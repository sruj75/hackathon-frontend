import {
  Animated,
  StyleSheet,
  useAnimatedValue,
  View,
  ScrollView,
  Text,
} from 'react-native';

import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ControlBar from '../../components/assistant/ControlBar';
import ChatBar from '../../components/assistant/ChatBar';
import ChatLog from '../../components/assistant/ChatLog';
import AgentVisualization from '../../components/assistant/AgentVisualization';
import {
  useWebSocketAgent,
  ADKEvent,
  GenerativeUIEvent,
} from '@/hooks/useWebSocketAgent';
import { useAudioRecording, useAudioPlayback } from '@/hooks/useAudio';
import { useAuth } from '@/hooks/useAuth';

// Generative UI Components
import { DayView } from '../../components/generative/DayView';

interface Transcription {
  participant: string;
  text: string;
  timestamp: number;
}

type ViewMode = 'voice' | 'chat' | 'ui';
const PLAYBACK_END_DEBOUNCE_MS_DEFAULT = 320;
const PLAYBACK_END_DEBOUNCE_MS_ONBOARDING = 900;
const ONBOARDING_ECHO_GUARD_TAIL_MS = 250;
const ONBOARDING_BARGE_IN_OPEN_WINDOW_MS = 1200;
const ONBOARDING_BARGE_IN_MIN_CONSECUTIVE_FRAMES = 4;
const ONBOARDING_BARGE_IN_ABS_RMS_THRESHOLD = 0.035;
const ONBOARDING_BARGE_IN_PLAYBACK_RMS_MULTIPLIER = 1.8;
const ONBOARDING_MIC_NOISE_RMS_MULTIPLIER = 3.0;
const ONBOARDING_SIGNAL_EMA_ALPHA = 0.22;
const ONBOARDING_NOISE_EMA_ALPHA = 0.08;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function pcm16RmsFromArrayBuffer(audioData: ArrayBuffer): number {
  const byteLength = audioData.byteLength;
  if (byteLength < 2) {
    return 0;
  }
  const sampleCount = Math.floor(byteLength / 2);
  if (sampleCount <= 0) {
    return 0;
  }
  const view = new DataView(audioData);
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = view.getInt16(i * 2, true) / 32768;
    sumSquares += sample * sample;
  }
  return clampUnit(Math.sqrt(sumSquares / sampleCount));
}

function pcm16RmsFromBase64(base64Data: string): number {
  if (!base64Data) {
    return 0;
  }
  try {
    const decode = (globalThis as { atob?: (value: string) => string }).atob;
    if (typeof decode !== 'function') {
      return 0;
    }
    const binaryString = decode(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return pcm16RmsFromArrayBuffer(bytes.buffer);
  } catch {
    return 0;
  }
}

export default function AssistantScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, session } = useAuth();
  const transcriptionUserId = user?.id || 'User';

  const resumeSessionId = Array.isArray(params.resume_session_id)
    ? params.resume_session_id[0]
    : params.resume_session_id;
  const triggerType = Array.isArray(params.trigger_type)
    ? params.trigger_type[0]
    : params.trigger_type;
  const entryModeParam = Array.isArray(params.entry_mode)
    ? params.entry_mode[0]
    : params.entry_mode;
  const sourceParam = Array.isArray(params.source)
    ? params.source[0]
    : params.source;
  const eventIdParam = Array.isArray(params.event_id)
    ? params.event_id[0]
    : params.event_id;
  const calendarEventIdParam = Array.isArray(params.calendar_event_id)
    ? params.calendar_event_id[0]
    : params.calendar_event_id;
  const scheduledTimeParam = Array.isArray(params.scheduled_time)
    ? params.scheduled_time[0]
    : params.scheduled_time;

  const inferredEntryMode =
    typeof entryModeParam === 'string' && entryModeParam
      ? entryModeParam
      : resumeSessionId || triggerType
      ? 'proactive'
      : 'reactive';
  const isOnboardingSession = triggerType === 'onboarding';

  const isStaleNotificationEntry = useMemo(() => {
    if (
      inferredEntryMode !== 'proactive' ||
      typeof scheduledTimeParam !== 'string' ||
      !scheduledTimeParam
    ) {
      return false;
    }
    const scheduled = new Date(scheduledTimeParam);
    if (Number.isNaN(scheduled.getTime())) {
      return false;
    }
    const today = new Date();
    const localDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
    return localDay(scheduled) !== localDay(today);
  }, [inferredEntryMode, scheduledTimeParam]);

  // Get session ID from route params (deep link) or generate new one
  const generatedSessionIdRef = useRef(`session-${Date.now()}`);
  const effectiveResumeSessionId = isStaleNotificationEntry
    ? undefined
    : resumeSessionId;
  const sessionId = effectiveResumeSessionId || generatedSessionIdRef.current;

  // Log deep link context if available
  useEffect(() => {
    if (effectiveResumeSessionId || triggerType || eventIdParam) {
      console.log(
        '[AssistantScreen] Entry context:',
        {
          resume_session_id: effectiveResumeSessionId,
          trigger_type: triggerType,
          entry_mode: inferredEntryMode,
          source: sourceParam,
          event_id: eventIdParam,
          calendar_event_id: calendarEventIdParam,
          scheduled_time: scheduledTimeParam,
          stale: isStaleNotificationEntry,
        },
        'type:',
        triggerType
      );
    }
  }, [
    effectiveResumeSessionId,
    triggerType,
    inferredEntryMode,
    sourceParam,
    eventIdParam,
    calendarEventIdParam,
    scheduledTimeParam,
    isStaleNotificationEntry,
  ]);

  // WebSocket connection
  const {
    state: wsState,
    connect,
    disconnect,
    sendAudio,
    sendText,
    onEvent,
    onAudio,
    onUIComponent,
  } = useWebSocketAgent(sessionId, session?.access_token ?? null);

  // Audio recording and playback
  const { isRecording, startRecording, stopRecording, onAudioData } =
    useAudioRecording();
  const { isPlaying, playAudio, endPlayback, stopPlayback } =
    useAudioPlayback();

  // UI State
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('voice');
  const [chatMessage, setChatMessage] = useState('');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [awaitingInitialGreeting, setAwaitingInitialGreeting] = useState(true);
  const endPlaybackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingTurnCompleteRef = useRef(false);
  const turnHasAudioChunkRef = useRef(false);
  const outputAudioChunkCountRef = useRef(0);
  const turnCompleteCountRef = useRef(0);
  const playbackTimerScheduleCountRef = useRef(0);
  const streamingTextRef = useRef('');
  const lastAgentMessageRef = useRef<{
    text: string;
    timestamp: number;
  } | null>(null);
  const turnHasOutputTranscriptionRef = useRef(false);
  const hasPostOnboardingHandoffRef = useRef(false);
  const pendingPostOnboardingReconnectRef = useRef(false);
  const onboardingDiagnosticsRef = useRef({
    wsConnectedAtMs: null as number | null,
    recordingStartedAtMs: null as number | null,
    firstOutputAudioAtMs: null as number | null,
    firstInputTranscriptionAtMs: null as number | null,
    interruptionCount: 0,
    outputTurnIndex: 0,
    currentTurnChunkCount: 0,
    lastOutputChunkAtMs: null as number | null,
    outputGapWarningCount: 0,
    outputUnderrunWarningCount: 0,
    maxOutputUnderrunMs: 0,
    playbackStoppedOnInputCount: 0,
    inputChunkSeenCount: 0,
    inputChunkSentCount: 0,
    lastInputChunkAtMs: null as number | null,
    maxInputChunkGapMs: 0,
  });
  const onboardingEchoGuardUntilMsRef = useRef(0);
  const onboardingBargeInActiveUntilMsRef = useRef(0);
  const onboardingPlaybackRmsEmaRef = useRef(0);
  const onboardingMicNoiseRmsEmaRef = useRef(0.01);
  const onboardingBargeInConsecutiveFramesRef = useRef(0);
  const onboardingEchoGuardDropCountRef = useRef(0);
  const onboardingBargeInTriggerCountRef = useRef(0);
  const playbackEndDebounceMs =
    triggerType === 'onboarding'
      ? PLAYBACK_END_DEBOUNCE_MS_ONBOARDING
      : PLAYBACK_END_DEBOUNCE_MS_DEFAULT;
  const logOnboardingAudio = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      if (!isOnboardingSession) {
        return;
      }
      const diagnostics = onboardingDiagnosticsRef.current;
      const now = Date.now();
      console.log('[ONBOARDING-AUDIO]', event, {
        at_ms: now,
        since_ws_connected_ms:
          diagnostics.wsConnectedAtMs === null
            ? null
            : now - diagnostics.wsConnectedAtMs,
        ...payload,
      });
    },
    [isOnboardingSession]
  );

  // Streaming state for accumulating partial responses
  const [streamingTranscription, setStreamingTranscription] = useState<{
    participant: string;
    text: string;
  } | null>(null);

  // Generative UI State
  const [uiComponents, setUIComponents] = useState<GenerativeUIEvent[]>([]);
  const [isPendingUIRender, setIsPendingUIRender] = useState(false);
  const isMicUiEnabled =
    isMicEnabled || (wsState.isConnected && awaitingInitialGreeting);

  useEffect(() => {
    return () => {
      pendingPostOnboardingReconnectRef.current = false;
    };
  }, []);

  const schedulePlaybackEnd = useCallback(() => {
    const scheduleId = ++playbackTimerScheduleCountRef.current;
    if (endPlaybackTimerRef.current) {
      clearTimeout(endPlaybackTimerRef.current);
    }
    if (isOnboardingSession) {
      logOnboardingAudio('schedule_playback_end', {
        schedule_id: scheduleId,
        debounce_ms: playbackEndDebounceMs,
        pending_turn_complete: pendingTurnCompleteRef.current,
        turn_has_audio_chunk: turnHasAudioChunkRef.current,
        turn_complete_count: turnCompleteCountRef.current,
        output_audio_chunk_count: outputAudioChunkCountRef.current,
      });
    }
    endPlaybackTimerRef.current = setTimeout(() => {
      if (isOnboardingSession) {
        logOnboardingAudio('fire_playback_end', {
          schedule_id: scheduleId,
          turn_has_audio_chunk: turnHasAudioChunkRef.current,
          output_audio_chunk_count: outputAudioChunkCountRef.current,
        });
      }
      void endPlayback();
      pendingTurnCompleteRef.current = false;
      endPlaybackTimerRef.current = null;
    }, playbackEndDebounceMs);
  }, [
    endPlayback,
    playbackEndDebounceMs,
    isOnboardingSession,
    logOnboardingAudio,
  ]);

  const mergeStreamingText = useCallback(
    (current: string, incoming: string) => {
      if (!incoming) {
        return current;
      }
      if (!current) {
        return incoming;
      }
      // Backends differ: some send deltas (" world"), others send full partials ("hello world").
      if (incoming.startsWith(current)) {
        return incoming;
      }
      if (current.endsWith(incoming)) {
        return current;
      }
      return current + incoming;
    },
    []
  );

  const handoffToMainAgent = useCallback(() => {
    if (hasPostOnboardingHandoffRef.current) {
      return;
    }
    hasPostOnboardingHandoffRef.current = true;

    if (endPlaybackTimerRef.current) {
      clearTimeout(endPlaybackTimerRef.current);
      endPlaybackTimerRef.current = null;
    }
    pendingTurnCompleteRef.current = false;
    streamingTextRef.current = '';
    turnHasOutputTranscriptionRef.current = false;

    setStreamingTranscription(null);
    setTranscriptions([]);
    setViewMode('voice');
    setAwaitingInitialGreeting(true);

    pendingPostOnboardingReconnectRef.current = true;
    disconnect();
  }, [disconnect]);

  // Connect on mount with session resumption params if available
  useEffect(() => {
    if (!session?.access_token) {
      console.error('[AssistantScreen] Missing access token; cannot connect');
      return;
    }
    const connectOptions =
      effectiveResumeSessionId ||
      triggerType ||
      eventIdParam ||
      inferredEntryMode !== 'reactive'
        ? {
            resume_session_id: effectiveResumeSessionId as string,
            trigger_type: triggerType as string,
            entry_mode: isStaleNotificationEntry
              ? 'reactive'
              : (inferredEntryMode as
                  | 'proactive'
                  | 'reactive'
                  | 'post_onboarding'),
            source: isStaleNotificationEntry
              ? 'manual'
              : (sourceParam as 'push' | 'manual' | 'post_onboarding') ||
                'manual',
            event_id: isStaleNotificationEntry
              ? undefined
              : (eventIdParam as string),
            calendar_event_id: isStaleNotificationEntry
              ? undefined
              : (calendarEventIdParam as string),
            scheduled_time: isStaleNotificationEntry
              ? undefined
              : (scheduledTimeParam as string),
          }
        : undefined;

    connect(connectOptions);
    return () => {
      disconnect();
    };
  }, [
    connect,
    disconnect,
    resumeSessionId,
    effectiveResumeSessionId,
    session?.access_token,
    triggerType,
    inferredEntryMode,
    sourceParam,
    eventIdParam,
    calendarEventIdParam,
    scheduledTimeParam,
    isStaleNotificationEntry,
  ]);

  // Event-driven post-onboarding reconnect: reconnect only after disconnect settles.
  useEffect(() => {
    if (!pendingPostOnboardingReconnectRef.current) {
      return;
    }
    if (wsState.isConnected || wsState.isConnecting) {
      return;
    }
    pendingPostOnboardingReconnectRef.current = false;
    connect({
      trigger_type: 'post_onboarding',
      entry_mode: 'post_onboarding',
      source: 'post_onboarding',
    });
  }, [connect, wsState.isConnected, wsState.isConnecting]);

  useEffect(() => {
    if (!isOnboardingSession) {
      return;
    }
    const diagnostics = onboardingDiagnosticsRef.current;
    if (wsState.isConnected && diagnostics.wsConnectedAtMs === null) {
      diagnostics.wsConnectedAtMs = Date.now();
      diagnostics.recordingStartedAtMs = null;
      diagnostics.firstOutputAudioAtMs = null;
      diagnostics.firstInputTranscriptionAtMs = null;
      diagnostics.interruptionCount = 0;
      diagnostics.outputTurnIndex = 0;
      diagnostics.currentTurnChunkCount = 0;
      diagnostics.lastOutputChunkAtMs = null;
      diagnostics.outputGapWarningCount = 0;
      diagnostics.outputUnderrunWarningCount = 0;
      diagnostics.maxOutputUnderrunMs = 0;
      diagnostics.playbackStoppedOnInputCount = 0;
      diagnostics.inputChunkSeenCount = 0;
      diagnostics.inputChunkSentCount = 0;
      diagnostics.lastInputChunkAtMs = null;
      diagnostics.maxInputChunkGapMs = 0;
      onboardingEchoGuardUntilMsRef.current = 0;
      onboardingBargeInActiveUntilMsRef.current = 0;
      onboardingPlaybackRmsEmaRef.current = 0;
      onboardingMicNoiseRmsEmaRef.current = 0.01;
      onboardingBargeInConsecutiveFramesRef.current = 0;
      onboardingEchoGuardDropCountRef.current = 0;
      onboardingBargeInTriggerCountRef.current = 0;
      logOnboardingAudio('ws_connected', {
        ws_connected_at_ms: diagnostics.wsConnectedAtMs,
      });
    }
    if (!wsState.isConnected && diagnostics.wsConnectedAtMs !== null) {
      logOnboardingAudio('session_summary', {
        ws_connected_at_ms: diagnostics.wsConnectedAtMs,
        recording_started_at_ms: diagnostics.recordingStartedAtMs,
        first_output_audio_at_ms: diagnostics.firstOutputAudioAtMs,
        first_input_transcription_at_ms:
          diagnostics.firstInputTranscriptionAtMs,
        interruption_count: diagnostics.interruptionCount,
        output_turn_count: diagnostics.outputTurnIndex,
        output_gap_warning_count: diagnostics.outputGapWarningCount,
        output_underrun_warning_count: diagnostics.outputUnderrunWarningCount,
        max_output_underrun_ms: diagnostics.maxOutputUnderrunMs,
        playback_stopped_on_input_count:
          diagnostics.playbackStoppedOnInputCount,
        input_chunk_seen_count: diagnostics.inputChunkSeenCount,
        input_chunk_sent_count: diagnostics.inputChunkSentCount,
        max_input_chunk_gap_ms: diagnostics.maxInputChunkGapMs,
      });
      diagnostics.wsConnectedAtMs = null;
      diagnostics.recordingStartedAtMs = null;
      diagnostics.firstOutputAudioAtMs = null;
      diagnostics.firstInputTranscriptionAtMs = null;
      diagnostics.interruptionCount = 0;
      diagnostics.outputTurnIndex = 0;
      diagnostics.currentTurnChunkCount = 0;
      diagnostics.lastOutputChunkAtMs = null;
      diagnostics.outputGapWarningCount = 0;
      diagnostics.outputUnderrunWarningCount = 0;
      diagnostics.maxOutputUnderrunMs = 0;
      diagnostics.playbackStoppedOnInputCount = 0;
      diagnostics.inputChunkSeenCount = 0;
      diagnostics.inputChunkSentCount = 0;
      diagnostics.lastInputChunkAtMs = null;
      diagnostics.maxInputChunkGapMs = 0;
      onboardingEchoGuardUntilMsRef.current = 0;
      onboardingBargeInActiveUntilMsRef.current = 0;
      onboardingPlaybackRmsEmaRef.current = 0;
      onboardingMicNoiseRmsEmaRef.current = 0.01;
      onboardingBargeInConsecutiveFramesRef.current = 0;
      onboardingEchoGuardDropCountRef.current = 0;
      onboardingBargeInTriggerCountRef.current = 0;
    }
  }, [isOnboardingSession, wsState.isConnected, logOnboardingAudio]);

  // Auto-start recording when WebSocket connects for real-time streaming
  const hasAutoStartedRef = React.useRef(false);
  const isStoppingRecordingRef = React.useRef(false);
  useEffect(() => {
    const shouldAutoStart =
      wsState.isConnected &&
      !isRecording &&
      !hasAutoStartedRef.current &&
      !isStoppingRecordingRef.current &&
      (isOnboardingSession || !awaitingInitialGreeting);
    if (shouldAutoStart) {
      console.log('Auto-starting real-time recording...');
      startRecording()
        .then(() => {
          setIsMicEnabled(true);
          hasAutoStartedRef.current = true;
          if (isOnboardingSession) {
            const diagnostics = onboardingDiagnosticsRef.current;
            if (diagnostics.recordingStartedAtMs === null) {
              diagnostics.recordingStartedAtMs = Date.now();
              logOnboardingAudio('recording_started', {
                recording_started_at_ms: diagnostics.recordingStartedAtMs,
                since_ws_connected_ms:
                  diagnostics.wsConnectedAtMs === null
                    ? null
                    : diagnostics.recordingStartedAtMs -
                      diagnostics.wsConnectedAtMs,
              });
            }
          }
          console.log('Real-time audio streaming active');
        })
        .catch((err) => console.error('Failed to start recording:', err));
    }
  }, [
    wsState.isConnected,
    awaitingInitialGreeting,
    isRecording,
    isOnboardingSession,
    logOnboardingAudio,
    startRecording,
  ]);

  // Ensure recording is torn down when WebSocket disconnects.
  useEffect(() => {
    if (!wsState.isConnected) {
      if (isOnboardingSession) {
        console.log('[ONBOARDING-AUDIO] ws_disconnected_summary', {
          turn_complete_count: turnCompleteCountRef.current,
          output_audio_chunk_count: outputAudioChunkCountRef.current,
          playback_timer_schedule_count: playbackTimerScheduleCountRef.current,
          input_chunk_seen_count:
            onboardingDiagnosticsRef.current.inputChunkSeenCount,
          input_chunk_sent_count:
            onboardingDiagnosticsRef.current.inputChunkSentCount,
        });
      }
      if (endPlaybackTimerRef.current) {
        clearTimeout(endPlaybackTimerRef.current);
        endPlaybackTimerRef.current = null;
      }
      pendingTurnCompleteRef.current = false;
      turnHasAudioChunkRef.current = false;
      outputAudioChunkCountRef.current = 0;
      turnCompleteCountRef.current = 0;
      playbackTimerScheduleCountRef.current = 0;
      streamingTextRef.current = '';
      turnHasOutputTranscriptionRef.current = false;
      onboardingEchoGuardUntilMsRef.current = 0;
      onboardingBargeInActiveUntilMsRef.current = 0;
      onboardingPlaybackRmsEmaRef.current = 0;
      onboardingMicNoiseRmsEmaRef.current = 0.01;
      onboardingBargeInConsecutiveFramesRef.current = 0;
      onboardingEchoGuardDropCountRef.current = 0;
      onboardingBargeInTriggerCountRef.current = 0;
      hasAutoStartedRef.current = false;
      if (isRecording && !isStoppingRecordingRef.current) {
        isStoppingRecordingRef.current = true;
        stopRecording()
          .catch((err) => console.error('Failed to stop recording:', err))
          .finally(() => {
            isStoppingRecordingRef.current = false;
          });
      }
      setIsMicEnabled(false);
    }
  }, [wsState.isConnected, isRecording, stopRecording, isOnboardingSession]);

  // Set up audio data callback - stream audio chunks to WebSocket in real-time
  useEffect(() => {
    const unsubscribe = onAudioData((data) => {
      if (!wsState.isConnected) {
        return;
      }

      // Preserve existing behavior outside onboarding.
      if (!isOnboardingSession) {
        sendAudio(data);
        return;
      }

      const diagnostics = onboardingDiagnosticsRef.current;
      const now = Date.now();
      const micRms = pcm16RmsFromArrayBuffer(data);
      diagnostics.inputChunkSeenCount += 1;
      if (diagnostics.lastInputChunkAtMs !== null) {
        const inputGap = now - diagnostics.lastInputChunkAtMs;
        diagnostics.maxInputChunkGapMs = Math.max(
          diagnostics.maxInputChunkGapMs,
          inputGap
        );
      }
      diagnostics.lastInputChunkAtMs = now;

      const sendOnboardingMicChunk = () => {
        sendAudio(data);
        diagnostics.inputChunkSentCount += 1;
      };

      if (now < onboardingBargeInActiveUntilMsRef.current) {
        sendOnboardingMicChunk();
      } else {
        const playbackGuardActive =
          isPlaying || now < onboardingEchoGuardUntilMsRef.current;
        if (!playbackGuardActive) {
          const noiseFloor = onboardingMicNoiseRmsEmaRef.current;
          onboardingMicNoiseRmsEmaRef.current =
            noiseFloor + ONBOARDING_NOISE_EMA_ALPHA * (micRms - noiseFloor);
          onboardingBargeInConsecutiveFramesRef.current = 0;
          sendOnboardingMicChunk();
        } else {
          const playbackRms = onboardingPlaybackRmsEmaRef.current;
          const noiseFloor = onboardingMicNoiseRmsEmaRef.current;
          const threshold = Math.max(
            ONBOARDING_BARGE_IN_ABS_RMS_THRESHOLD,
            playbackRms * ONBOARDING_BARGE_IN_PLAYBACK_RMS_MULTIPLIER,
            noiseFloor * ONBOARDING_MIC_NOISE_RMS_MULTIPLIER
          );

          if (micRms >= threshold) {
            onboardingBargeInConsecutiveFramesRef.current += 1;
          } else {
            onboardingBargeInConsecutiveFramesRef.current = 0;
          }

          if (
            onboardingBargeInConsecutiveFramesRef.current >=
            ONBOARDING_BARGE_IN_MIN_CONSECUTIVE_FRAMES
          ) {
            onboardingBargeInConsecutiveFramesRef.current = 0;
            onboardingBargeInTriggerCountRef.current += 1;
            onboardingBargeInActiveUntilMsRef.current =
              now + ONBOARDING_BARGE_IN_OPEN_WINDOW_MS;
            onboardingEchoGuardUntilMsRef.current = now;
            diagnostics.playbackStoppedOnInputCount += 1;
            if (endPlaybackTimerRef.current) {
              clearTimeout(endPlaybackTimerRef.current);
              endPlaybackTimerRef.current = null;
            }
            pendingTurnCompleteRef.current = false;
            turnHasAudioChunkRef.current = false;
            streamingTextRef.current = '';
            setStreamingTranscription(null);
            logOnboardingAudio('onboarding_barge_in_trigger', {
              trigger_count: onboardingBargeInTriggerCountRef.current,
              consecutive_frames: ONBOARDING_BARGE_IN_MIN_CONSECUTIVE_FRAMES,
              mic_rms: micRms,
              threshold_rms: threshold,
              playback_rms_ema: playbackRms,
              noise_floor_rms_ema: noiseFloor,
              playback_stopped_on_input_count:
                diagnostics.playbackStoppedOnInputCount,
            });
            void stopPlayback();
            sendOnboardingMicChunk();
          } else {
            onboardingEchoGuardDropCountRef.current += 1;
            if (onboardingEchoGuardDropCountRef.current % 40 === 0) {
              logOnboardingAudio('onboarding_echo_guard_drop', {
                dropped_chunk_count: onboardingEchoGuardDropCountRef.current,
                mic_rms: micRms,
                threshold_rms: threshold,
                playback_rms_ema: playbackRms,
                noise_floor_rms_ema: noiseFloor,
                barge_in_frames: onboardingBargeInConsecutiveFramesRef.current,
              });
            }
          }
        }
      }

      if (diagnostics.inputChunkSeenCount % 100 === 0) {
        logOnboardingAudio('input_uplink_flow', {
          input_chunk_seen_count: diagnostics.inputChunkSeenCount,
          input_chunk_sent_count: diagnostics.inputChunkSentCount,
          is_playing: isPlaying,
        });
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [
    onAudioData,
    sendAudio,
    wsState.isConnected,
    isOnboardingSession,
    isPlaying,
    stopPlayback,
    logOnboardingAudio,
  ]);

  // Set up audio playback callback - play audio received from server
  useEffect(() => {
    const unsubscribe = onAudio((audioData, mimeType) => {
      // Keep audio output active across voice/chat/ui views.
      // View mode should affect layout, not whether the user hears the assistant.
      if (wsState.isConnected) {
        let now = 0;
        let gapMs: number | null = null;
        outputAudioChunkCountRef.current += 1;
        turnHasAudioChunkRef.current = true;
        if (isOnboardingSession) {
          const diagnostics = onboardingDiagnosticsRef.current;
          now = Date.now();
          onboardingBargeInActiveUntilMsRef.current = 0;
          onboardingEchoGuardUntilMsRef.current =
            now + ONBOARDING_ECHO_GUARD_TAIL_MS;
          onboardingBargeInConsecutiveFramesRef.current = 0;
          const outputRms =
            typeof audioData === 'string'
              ? pcm16RmsFromBase64(audioData)
              : pcm16RmsFromArrayBuffer(audioData);
          const currentPlaybackRms = onboardingPlaybackRmsEmaRef.current;
          onboardingPlaybackRmsEmaRef.current =
            currentPlaybackRms +
            ONBOARDING_SIGNAL_EMA_ALPHA * (outputRms - currentPlaybackRms);
          if (diagnostics.currentTurnChunkCount === 0) {
            diagnostics.outputTurnIndex += 1;
            logOnboardingAudio('output_turn_started', {
              output_turn_index: diagnostics.outputTurnIndex,
              turn_complete_count: turnCompleteCountRef.current,
              pending_turn_complete: pendingTurnCompleteRef.current,
            });
          }
          diagnostics.currentTurnChunkCount += 1;
          gapMs =
            diagnostics.lastOutputChunkAtMs === null
              ? null
              : now - diagnostics.lastOutputChunkAtMs;
          diagnostics.lastOutputChunkAtMs = now;
          const isGapWarning = gapMs !== null && gapMs > 260;
          const gapOverChunkMs = gapMs === null ? null : gapMs - 40;
          const isUnderrunWarning =
            gapOverChunkMs !== null && gapOverChunkMs > 160;
          if (isUnderrunWarning) {
            diagnostics.outputUnderrunWarningCount += 1;
            diagnostics.maxOutputUnderrunMs = Math.max(
              diagnostics.maxOutputUnderrunMs,
              gapOverChunkMs
            );
          }
          const shouldSampleLog =
            diagnostics.currentTurnChunkCount === 1 ||
            diagnostics.currentTurnChunkCount % 40 === 0 ||
            (gapMs !== null && gapMs > 360);
          if (isGapWarning) {
            diagnostics.outputGapWarningCount += 1;
          }
          if (shouldSampleLog) {
            logOnboardingAudio('output_audio_chunk', {
              output_turn_index: diagnostics.outputTurnIndex,
              turn_chunk_index: diagnostics.currentTurnChunkCount,
              chunk_count_total: outputAudioChunkCountRef.current,
              inter_chunk_gap_ms: gapMs,
              gap_warning: isGapWarning,
              gap_over_chunk_ms: gapOverChunkMs,
              underrun_warning: isUnderrunWarning,
              mime_type: mimeType || null,
              pending_turn_complete: pendingTurnCompleteRef.current,
              turn_complete_count: turnCompleteCountRef.current,
            });
          }
          if (diagnostics.firstOutputAudioAtMs === null) {
            diagnostics.firstOutputAudioAtMs = now || Date.now();
            logOnboardingAudio('first_output_audio_chunk', {
              first_output_audio_at_ms: diagnostics.firstOutputAudioAtMs,
              since_ws_connected_ms:
                diagnostics.wsConnectedAtMs === null
                  ? null
                  : diagnostics.firstOutputAudioAtMs -
                    diagnostics.wsConnectedAtMs,
              since_recording_started_ms:
                diagnostics.recordingStartedAtMs === null
                  ? null
                  : diagnostics.firstOutputAudioAtMs -
                    diagnostics.recordingStartedAtMs,
            });
          }
        }
        void playAudio(audioData, mimeType);
        if (pendingTurnCompleteRef.current) {
          schedulePlaybackEnd();
        }
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [
    onAudio,
    playAudio,
    schedulePlaybackEnd,
    wsState.isConnected,
    isOnboardingSession,
    logOnboardingAudio,
  ]);

  // Handle UI components from backend
  useEffect(() => {
    const unsubscribe = onUIComponent((component: GenerativeUIEvent) => {
      setUIComponents([component]); // Replace with new component (clearing history)
      setIsPendingUIRender(true); // Trigger collapse animation (callback will handle UI render)
    });
    return unsubscribe;
  }, [onUIComponent]);

  const addTranscription = useCallback((participant: string, text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }
    setTranscriptions((prev) => [
      ...prev,
      { participant, text: normalizedText, timestamp: Date.now() },
    ]);
  }, []);

  const addAgentTranscription = useCallback(
    (text: string) => {
      const normalizedText = text.trim();
      if (!normalizedText) {
        return;
      }
      const now = Date.now();
      const last = lastAgentMessageRef.current;
      if (last && last.text === normalizedText && now - last.timestamp < 1500) {
        return;
      }
      addTranscription('Agent', normalizedText);
      lastAgentMessageRef.current = { text: normalizedText, timestamp: now };
    },
    [addTranscription]
  );

  // Handle ADK events (transcriptions, responses)
  useEffect(() => {
    const unsubscribe = onEvent((event: ADKEvent) => {
      // Handle interruptions - clear any streaming text when user interrupts
      if (event.interrupted) {
        console.log(
          '[CHAT] Agent interrupted, clearing streaming transcription'
        );
        if (isOnboardingSession) {
          const diagnostics = onboardingDiagnosticsRef.current;
          diagnostics.interruptionCount += 1;
          logOnboardingAudio('interruption', {
            interruption_count: diagnostics.interruptionCount,
            turn_complete_count: turnCompleteCountRef.current,
            output_turn_index: diagnostics.outputTurnIndex,
          });
        }
        if (endPlaybackTimerRef.current) {
          clearTimeout(endPlaybackTimerRef.current);
          endPlaybackTimerRef.current = null;
        }
        pendingTurnCompleteRef.current = false;
        turnHasAudioChunkRef.current = false;
        streamingTextRef.current = '';
        turnHasOutputTranscriptionRef.current = false;
        void stopPlayback();
        setStreamingTranscription(null);
      }

      // Handle input transcription (user speech)
      if (event.serverContent?.inputTranscription?.text) {
        if (isOnboardingSession) {
          const diagnostics = onboardingDiagnosticsRef.current;
          logOnboardingAudio('input_transcription', {
            text_length: event.serverContent.inputTranscription.text.length,
            is_playing: isPlaying,
            turn_complete_count: turnCompleteCountRef.current,
            output_turn_index: diagnostics.outputTurnIndex,
            pending_turn_complete: pendingTurnCompleteRef.current,
            ms_since_last_output_chunk:
              diagnostics.lastOutputChunkAtMs === null
                ? null
                : Date.now() - diagnostics.lastOutputChunkAtMs,
          });
          if (diagnostics.firstInputTranscriptionAtMs === null) {
            diagnostics.firstInputTranscriptionAtMs = Date.now();
            logOnboardingAudio('first_input_transcription', {
              first_input_transcription_at_ms:
                diagnostics.firstInputTranscriptionAtMs,
              since_ws_connected_ms:
                diagnostics.wsConnectedAtMs === null
                  ? null
                  : diagnostics.firstInputTranscriptionAtMs -
                    diagnostics.wsConnectedAtMs,
              since_recording_started_ms:
                diagnostics.recordingStartedAtMs === null
                  ? null
                  : diagnostics.firstInputTranscriptionAtMs -
                    diagnostics.recordingStartedAtMs,
            });
          }
        }
        // If user starts talking, stop assistant playback immediately for barge-in UX.
        if (isPlaying) {
          if (isOnboardingSession) {
            const diagnostics = onboardingDiagnosticsRef.current;
            diagnostics.playbackStoppedOnInputCount += 1;
            logOnboardingAudio('stop_playback_on_input', {
              playback_stopped_on_input_count:
                diagnostics.playbackStoppedOnInputCount,
              ms_since_last_output_chunk:
                diagnostics.lastOutputChunkAtMs === null
                  ? null
                  : Date.now() - diagnostics.lastOutputChunkAtMs,
            });
          }
          if (endPlaybackTimerRef.current) {
            clearTimeout(endPlaybackTimerRef.current);
            endPlaybackTimerRef.current = null;
          }
          pendingTurnCompleteRef.current = false;
          turnHasAudioChunkRef.current = false;
          streamingTextRef.current = '';
          setStreamingTranscription(null);
          void stopPlayback();
        }
        addTranscription(
          transcriptionUserId,
          event.serverContent.inputTranscription.text
        );
      }

      // Handle output transcription (agent speech) - already complete
      if (event.serverContent?.outputTranscription?.text) {
        console.log(
          '[CHAT] Received output transcription:',
          event.serverContent.outputTranscription.text
        );
        turnHasOutputTranscriptionRef.current = true;
        addAgentTranscription(event.serverContent.outputTranscription.text);
      }

      // Handle text responses (Chat Mode) - with streaming support
      if (event.content?.parts) {
        let shouldHandoffToMain = false;
        for (const part of event.content.parts as Record<string, unknown>[]) {
          const functionResponse = part.functionResponse as
            | {
                name?: string;
                response?: Record<string, unknown>;
              }
            | undefined;
          if (functionResponse?.name !== 'complete_onboarding') {
            continue;
          }
          const response = functionResponse.response || {};
          const onboardingStatus = response.onboarding_status;
          const routeHint = response.route_hint;
          const handoffToMain = Boolean(response.handoff_to_main);
          if (
            (handoffToMain ||
              (onboardingStatus === 'completed' &&
                routeHint === 'assistant')) &&
            triggerType === 'onboarding'
          ) {
            shouldHandoffToMain = true;
          }
        }

        const hasAudioPart = event.content.parts.some((part) =>
          Boolean(part.inlineData?.mimeType?.includes('audio'))
        );
        for (const part of event.content.parts) {
          if (part.text) {
            const textContent = part.text;
            console.log(
              '[CHAT] Received text part:',
              textContent,
              'partial:',
              event.partial
            );

            if (event.partial) {
              // Accumulate partial responses
              const mergedText = mergeStreamingText(
                streamingTextRef.current,
                textContent
              );
              streamingTextRef.current = mergedText;
              setStreamingTranscription({
                participant: 'Agent',
                text: mergedText,
              });
            } else {
              // Non-partial responses are shown only when tied to conversation context.
              const finalText = mergeStreamingText(
                streamingTextRef.current,
                textContent
              );
              const hadStreamingText = streamingTextRef.current.length > 0;
              streamingTextRef.current = '';
              setStreamingTranscription(null);
              const isConversationalText =
                hasAudioPart ||
                turnHasOutputTranscriptionRef.current ||
                hadStreamingText;
              if (
                isConversationalText &&
                !turnHasOutputTranscriptionRef.current
              ) {
                addAgentTranscription(finalText);
              }
            }
          }
        }
        if (shouldHandoffToMain) {
          handoffToMainAgent();
        }
      }

      // Handle turn completion - finalize streaming transcription
      if (event.turnComplete) {
        turnCompleteCountRef.current += 1;
        console.log('[CHAT] Turn complete, finalizing streaming transcription');
        setAwaitingInitialGreeting(false);
        pendingTurnCompleteRef.current = true;
        if (isOnboardingSession) {
          const diagnostics = onboardingDiagnosticsRef.current;
          logOnboardingAudio('turn_complete', {
            turn_complete_count: turnCompleteCountRef.current,
            turn_has_audio_chunk: turnHasAudioChunkRef.current,
            output_audio_chunk_count: outputAudioChunkCountRef.current,
            has_streaming_text: Boolean(streamingTextRef.current),
            has_output_transcription: turnHasOutputTranscriptionRef.current,
            output_turn_index: diagnostics.outputTurnIndex,
            turn_chunk_count: diagnostics.currentTurnChunkCount,
            ms_since_last_output_chunk:
              diagnostics.lastOutputChunkAtMs === null
                ? null
                : Date.now() - diagnostics.lastOutputChunkAtMs,
          });
        }
        if (!isOnboardingSession || turnHasAudioChunkRef.current) {
          schedulePlaybackEnd();
        } else {
          if (isOnboardingSession) {
            logOnboardingAudio('skip_end_playback_no_audio_turn');
          }
        }
        if (
          streamingTextRef.current &&
          !turnHasOutputTranscriptionRef.current
        ) {
          addAgentTranscription(streamingTextRef.current);
        }
        streamingTextRef.current = '';
        turnHasOutputTranscriptionRef.current = false;
        turnHasAudioChunkRef.current = false;
        if (isOnboardingSession) {
          onboardingDiagnosticsRef.current.currentTurnChunkCount = 0;
        }
        setStreamingTranscription(null);
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [
    onEvent,
    addAgentTranscription,
    addTranscription,
    mergeStreamingText,
    schedulePlaybackEnd,
    isPlaying,
    isOnboardingSession,
    stopPlayback,
    transcriptionUserId,
    handoffToMainAgent,
    triggerType,
    logOnboardingAudio,
  ]);

  // Control callbacks
  const onMicClick = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
      setIsMicEnabled(false);
    } else {
      setAwaitingInitialGreeting(false);
      await startRecording();
      setIsMicEnabled(true);
    }
  }, [isRecording, startRecording, stopRecording]);

  const onChatClick = useCallback(() => {
    if (viewMode === 'chat') {
      // Toggle back to UI if exists, else Voice
      if (uiComponents.length > 0) {
        setViewMode('ui');
      } else {
        setViewMode('voice');
      }
    } else {
      setViewMode('chat');
    }
  }, [viewMode, uiComponents.length]);

  const onExitClick = useCallback(async () => {
    pendingPostOnboardingReconnectRef.current = false;
    await stopRecording();
    disconnect();
    await stopPlayback();
    router.back();
  }, [router, disconnect, stopPlayback, stopRecording]);

  const onChatSend = useCallback(
    (message: string) => {
      const trimmedMessage = message.trim();
      if (!user || !wsState.isConnected || !trimmedMessage) {
        return;
      }
      addTranscription(transcriptionUserId, trimmedMessage);
      sendText(trimmedMessage);
      setChatMessage('');
    },
    [sendText, addTranscription, transcriptionUserId, user, wsState.isConnected]
  );

  // Render Generative UI component based on type
  const renderUIComponent = (component: GenerativeUIEvent) => {
    const props = component.props as Record<string, unknown>;
    console.log(
      '[FRONTEND-RENDER] >>> Rendering component:',
      component.type,
      'id:',
      component.id
    );

    if (component.type === 'day_view') {
      return (
        <DayView
          key={component.id}
          events={(props.events as []) || []}
          tasks={(props.tasks as []) || []}
          display_mode={(props.display_mode as any) || 'planning'} // Required - fallback for safety
          current_block={props.current_block as any}
          next_checkin={props.next_checkin as any}
          focus_mode={props.focus_mode as any}
          urgency_signals={props.urgency_signals as any}
        />
      );
    }

    // Show error for unknown component types (helps debugging)
    console.warn(`Unknown UI component type: ${component.type}`);
    return (
      <View
        key={component.id}
        style={{
          padding: 16,
          backgroundColor: '#fee2e2',
          borderRadius: 8,
          margin: 8,
        }}
      >
        <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>
          Unknown Component
        </Text>
        <Text style={{ color: '#dc2626' }}>Type: {component.type}</Text>
      </View>
    );
  };

  const isCollapsed = viewMode !== 'voice' || isPendingUIRender;

  // Use ref to track pending UI state without causing callback recreation
  const isPendingUIRenderRef = useRef(isPendingUIRender);
  useEffect(() => {
    isPendingUIRenderRef.current = isPendingUIRender;
  }, [isPendingUIRender]);

  // Callback triggered when collapse animation completes
  // Stable reference prevents animation restart loop
  const handleCollapseComplete = useCallback(() => {
    if (isPendingUIRenderRef.current) {
      setViewMode('ui'); // Only auto-switch when UI event pending
      setIsPendingUIRender(false);
    }
  }, []); // Empty deps - callback never changes

  const agentVisualizationPosition = useAgentVisualizationPosition(
    isCollapsed,
    false, // No local video in WebSocket mode
    handleCollapseComplete
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* 1. Top: Agent Pulse (Always present, collapsed in chat/ui modes) */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              zIndex: 1,
              backgroundColor: 'transparent',
              ...agentVisualizationPosition,
            },
          ]}
        >
          <AgentVisualization
            style={styles.agentVisualization}
            isConnected={wsState.isConnected}
            isPlaying={isPlaying}
          />
        </Animated.View>

        {/* 2. Middle: Content Switcher */}
        <View style={styles.middleContainer}>
          {viewMode === 'chat' && (
            <>
              <ChatLog
                style={styles.logContainer}
                transcriptions={transcriptions}
                streamingTranscription={streamingTranscription}
              />
              <ChatBar
                style={styles.chatBar}
                value={chatMessage}
                isSendDisabled={
                  !wsState.isConnected || chatMessage.trim().length === 0
                }
                onChangeText={(value) => setChatMessage(value)}
                onChatSend={onChatSend}
              />
            </>
          )}

          {viewMode === 'ui' && (
            <ScrollView style={styles.generativeUIContainer}>
              {/* Render the latest component or all? Typically focused view is one. */}
              {/* Mapping all for now to preserve history if desired, but user said "render appears in the middle" */}
              {uiComponents.map(renderUIComponent)}
            </ScrollView>
          )}
          {/* Spacer for Voice Mode to push agent to center (handled by absolute positioning of agent) */}
          {viewMode === 'voice' && <View style={styles.spacer} />}
        </View>

        {/* 3. Bottom: Control Bar (Always present) */}
        <ControlBar
          style={styles.controlBar}
          options={{
            // UX: show mic as armed while waiting for agent-first greeting,
            // but start actual capture only after greeting turn completes.
            isMicEnabled: isMicUiEnabled,
            isCameraEnabled: false,
            isChatEnabled: viewMode === 'chat',
            onMicClick,
            onCameraClick: () => {}, // No camera in WebSocket mode
            onChatClick,
            onExitClick,
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
  },
  spacer: {
    height: '24%', // Adjust if needed for voice mode centering
  },
  middleContainer: {
    flex: 1,
    width: '100%',
    marginTop: '32%', // Space for collapsed pulse at top with breathing room
    marginBottom: 80, // Space for ControlBar at bottom
  },
  logContainer: {
    width: '100%',
    flexGrow: 1,
    flexDirection: 'column',
    marginBottom: 8,
  },
  chatBar: {
    left: 0,
    right: 0,
    marginHorizontal: 16,
    marginBottom: 0,
  },
  controlBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  agentVisualization: {
    width: '100%',
    height: '100%',
  },
  generativeUIContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000000',
  },
});

const expandedAgentWidth = 1;
const expandedAgentHeight = 1;
const collapsedWidth = 0.3;
const collapsedHeight = 0.2;

const createAnimConfig = (toValue: any) => ({
  toValue,
  stiffness: 200,
  damping: 30,
  useNativeDriver: false,
  isInteraction: false,
  overshootClamping: true,
});

const useAgentVisualizationPosition = (
  isCollapsed: boolean,
  _hasLocalVideo: boolean,
  onCollapseComplete?: () => void
) => {
  const width = useAnimatedValue(
    isCollapsed ? collapsedWidth : expandedAgentWidth
  );
  const height = useAnimatedValue(
    isCollapsed ? collapsedHeight : expandedAgentHeight
  );

  // Track animation completion across both useEffects
  const completionCountRef = React.useRef(0);
  const totalAnimations = 4;

  useEffect(() => {
    // Reset counter when animation state changes
    completionCountRef.current = 0;

    const handleAnimationComplete = (finished: { finished: boolean }) => {
      if (finished.finished) {
        completionCountRef.current++;
        // Only trigger callback when collapsing and all 4 animations complete
        if (
          completionCountRef.current === totalAnimations &&
          isCollapsed &&
          onCollapseComplete
        ) {
          onCollapseComplete();
        }
      }
    };

    const widthAnim = Animated.spring(
      width,
      createAnimConfig(isCollapsed ? collapsedWidth : expandedAgentWidth)
    );
    const heightAnim = Animated.spring(
      height,
      createAnimConfig(isCollapsed ? collapsedHeight : expandedAgentHeight)
    );

    widthAnim.start(handleAnimationComplete);
    heightAnim.start(handleAnimationComplete);

    return () => {
      widthAnim.stop();
      heightAnim.stop();
    };
  }, [width, height, isCollapsed, onCollapseComplete]);

  const x = useAnimatedValue(0);
  const y = useAnimatedValue(0);

  useEffect(() => {
    const handleAnimationComplete = (finished: { finished: boolean }) => {
      if (finished.finished) {
        completionCountRef.current++;
        // Only trigger callback when collapsing and all 4 animations complete
        if (
          completionCountRef.current === totalAnimations &&
          isCollapsed &&
          onCollapseComplete
        ) {
          onCollapseComplete();
        }
      }
    };

    let targetX = 0;
    let targetY = 0;

    if (isCollapsed) {
      targetX = 0.5 - collapsedWidth / 2;
      targetY = 16;
    }

    const xAnim = Animated.spring(x, createAnimConfig(targetX));
    const yAnim = Animated.spring(y, createAnimConfig(targetY));

    xAnim.start(handleAnimationComplete);
    yAnim.start(handleAnimationComplete);

    return () => {
      xAnim.stop();
      yAnim.stop();
    };
  }, [x, y, isCollapsed, onCollapseComplete]);

  return {
    left: x.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    }),
    top: y,
    width: width.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    }),
    height: height.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    }),
  };
};
