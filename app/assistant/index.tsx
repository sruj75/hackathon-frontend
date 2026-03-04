import {
  Animated,
  StyleSheet,
  useAnimatedValue,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
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
  AgentSocketEvent,
  GenerativeUIEvent,
  OnboardingCompletedEvent,
  OnboardingCompletionFailedEvent,
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
const PLAYBACK_END_DEBOUNCE_MS_ONBOARDING = 900;
const ONBOARDING_SPEECH_HOLD_MS = 800;
const ONBOARDING_STRONG_SPEECH_RMS_THRESHOLD = 0.02;
const ECHO_GUARD_TAIL_MS = 250;
const BARGE_IN_OPEN_WINDOW_MS = 1200;
const BARGE_IN_MIN_CONSECUTIVE_FRAMES = 4;
const BARGE_IN_ABS_RMS_THRESHOLD = 0.035;
const BARGE_IN_PLAYBACK_RMS_MULTIPLIER = 1.8;
const MIC_NOISE_RMS_MULTIPLIER = 3.0;
const SIGNAL_EMA_ALPHA = 0.22;
const NOISE_EMA_ALPHA = 0.08;

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

function isOnboardingCompletedEvent(
  event: AgentSocketEvent
): event is OnboardingCompletedEvent {
  return event.type === 'onboarding_completed';
}

function isOnboardingCompletionFailedEvent(
  event: AgentSocketEvent
): event is OnboardingCompletionFailedEvent {
  return event.type === 'onboarding_completion_failed';
}

function isADKEvent(event: AgentSocketEvent): event is ADKEvent {
  return (
    !isOnboardingCompletedEvent(event) &&
    !isOnboardingCompletionFailedEvent(event)
  );
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
  const echoGuardUntilMsRef = useRef(0);
  const lastStrongUserSpeechAtMsRef = useRef(0);
  const bargeInActiveUntilMsRef = useRef(0);
  const playbackRmsEmaRef = useRef(0);
  const micNoiseRmsEmaRef = useRef(0.01);
  const bargeInConsecutiveFramesRef = useRef(0);
  const echoGuardDropCountRef = useRef(0);
  const bargeInTriggerCountRef = useRef(0);
  const onboardingSpeechHoldSuppressedChunkCountRef = useRef(0);
  const playbackEndDebounceMs = PLAYBACK_END_DEBOUNCE_MS_ONBOARDING;
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
  const [onboardingDoneVisible, setOnboardingDoneVisible] = useState(false);
  const [completionErrorMessage, setCompletionErrorMessage] = useState<
    string | null
  >(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [isVerifyingContinue, setIsVerifyingContinue] = useState(false);

  // Generative UI State
  const [uiComponents, setUIComponents] = useState<GenerativeUIEvent[]>([]);
  const [isPendingUIRender, setIsPendingUIRender] = useState(false);
  const isMicUiEnabled =
    isMicEnabled || (wsState.isConnected && awaitingInitialGreeting);

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

  const reconnectOnboardingSession = useCallback(() => {
    connect({
      resume_session_id: effectiveResumeSessionId as string,
      trigger_type: 'onboarding',
      entry_mode: 'reactive',
      source: 'manual',
    });
  }, [connect, effectiveResumeSessionId]);

  const showOnboardingDoneState = useCallback(() => {
    if (endPlaybackTimerRef.current) {
      clearTimeout(endPlaybackTimerRef.current);
      endPlaybackTimerRef.current = null;
    }
    pendingTurnCompleteRef.current = false;
    turnHasAudioChunkRef.current = false;
    turnHasOutputTranscriptionRef.current = false;
    streamingTextRef.current = '';
    setStreamingTranscription(null);
    setCompletionErrorMessage(null);
    setMissingFields([]);
    setContinueError(null);
    setOnboardingDoneVisible(true);
    void stopRecording();
    void stopPlayback();
    disconnect();
  }, [disconnect, stopPlayback, stopRecording]);

  const handleContinueToAssistant = useCallback(async () => {
    if (isVerifyingContinue) {
      return;
    }
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!backendUrl || !session?.access_token) {
      setContinueError(
        'Missing auth or backend configuration. Please try again.'
      );
      return;
    }

    setIsVerifyingContinue(true);
    setContinueError(null);
    try {
      const response = await fetch(`${backendUrl}/api/onboarding/bootstrap`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = (await response.json().catch(() => ({}))) as {
        route_hint?: string;
      };
      if (!response.ok) {
        throw new Error(`Bootstrap verification failed (${response.status})`);
      }

      if (body.route_hint === 'assistant') {
        router.replace({
          pathname: '/assistant',
          params: {
            trigger_type: 'post_onboarding',
            entry_mode: 'post_onboarding',
            source: 'post_onboarding',
          },
        });
        return;
      }

      setContinueError(
        'Onboarding is still finishing. We will keep you in onboarding and retry.'
      );
      setOnboardingDoneVisible(false);
      reconnectOnboardingSession();
    } catch (error) {
      console.error('[onboarding] continue verification failed', error);
      setContinueError(
        'Could not verify onboarding completion. Staying in onboarding for safety.'
      );
      setOnboardingDoneVisible(false);
      reconnectOnboardingSession();
    } finally {
      setIsVerifyingContinue(false);
    }
  }, [
    isVerifyingContinue,
    reconnectOnboardingSession,
    router,
    session?.access_token,
  ]);

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
      echoGuardUntilMsRef.current = 0;
      lastStrongUserSpeechAtMsRef.current = 0;
      bargeInActiveUntilMsRef.current = 0;
      playbackRmsEmaRef.current = 0;
      micNoiseRmsEmaRef.current = 0.01;
      bargeInConsecutiveFramesRef.current = 0;
      echoGuardDropCountRef.current = 0;
      bargeInTriggerCountRef.current = 0;
      onboardingSpeechHoldSuppressedChunkCountRef.current = 0;
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
        speech_hold_suppressed_chunk_count:
          onboardingSpeechHoldSuppressedChunkCountRef.current,
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
      echoGuardUntilMsRef.current = 0;
      lastStrongUserSpeechAtMsRef.current = 0;
      bargeInActiveUntilMsRef.current = 0;
      playbackRmsEmaRef.current = 0;
      micNoiseRmsEmaRef.current = 0.01;
      bargeInConsecutiveFramesRef.current = 0;
      echoGuardDropCountRef.current = 0;
      bargeInTriggerCountRef.current = 0;
      onboardingSpeechHoldSuppressedChunkCountRef.current = 0;
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
      !isStoppingRecordingRef.current;
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
          speech_hold_suppressed_chunk_count:
            onboardingSpeechHoldSuppressedChunkCountRef.current,
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
      echoGuardUntilMsRef.current = 0;
      bargeInActiveUntilMsRef.current = 0;
      playbackRmsEmaRef.current = 0;
      micNoiseRmsEmaRef.current = 0.01;
      bargeInConsecutiveFramesRef.current = 0;
      echoGuardDropCountRef.current = 0;
      bargeInTriggerCountRef.current = 0;
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

      const diagnostics = onboardingDiagnosticsRef.current;
      const now = Date.now();
      const micRms = pcm16RmsFromArrayBuffer(data);
      const hasStrongUserSpeech = micRms >= ONBOARDING_STRONG_SPEECH_RMS_THRESHOLD;
      if (isOnboardingSession && hasStrongUserSpeech) {
        lastStrongUserSpeechAtMsRef.current = now;
      }
      if (isOnboardingSession) {
        diagnostics.inputChunkSeenCount += 1;
        if (diagnostics.lastInputChunkAtMs !== null) {
          const inputGap = now - diagnostics.lastInputChunkAtMs;
          diagnostics.maxInputChunkGapMs = Math.max(
            diagnostics.maxInputChunkGapMs,
            inputGap
          );
        }
        diagnostics.lastInputChunkAtMs = now;
      }

      const sendMicChunk = () => {
        sendAudio(data);
        if (isOnboardingSession) {
          diagnostics.inputChunkSentCount += 1;
        }
      };

      if (now < bargeInActiveUntilMsRef.current) {
        sendMicChunk();
      } else {
        const playbackGuardActive =
          isPlaying || now < echoGuardUntilMsRef.current;
        if (!playbackGuardActive) {
          const noiseFloor = micNoiseRmsEmaRef.current;
          micNoiseRmsEmaRef.current =
            noiseFloor + NOISE_EMA_ALPHA * (micRms - noiseFloor);
          bargeInConsecutiveFramesRef.current = 0;
          sendMicChunk();
        } else {
          const playbackRms = playbackRmsEmaRef.current;
          const noiseFloor = micNoiseRmsEmaRef.current;
          const threshold = Math.max(
            BARGE_IN_ABS_RMS_THRESHOLD,
            playbackRms * BARGE_IN_PLAYBACK_RMS_MULTIPLIER,
            noiseFloor * MIC_NOISE_RMS_MULTIPLIER
          );

          if (micRms >= threshold) {
            bargeInConsecutiveFramesRef.current += 1;
          } else {
            bargeInConsecutiveFramesRef.current = 0;
          }

          if (
            bargeInConsecutiveFramesRef.current >=
            BARGE_IN_MIN_CONSECUTIVE_FRAMES
          ) {
            bargeInConsecutiveFramesRef.current = 0;
            bargeInTriggerCountRef.current += 1;
            bargeInActiveUntilMsRef.current = now + BARGE_IN_OPEN_WINDOW_MS;
            echoGuardUntilMsRef.current = now;
            if (isOnboardingSession) {
              diagnostics.playbackStoppedOnInputCount += 1;
            }
            if (endPlaybackTimerRef.current) {
              clearTimeout(endPlaybackTimerRef.current);
              endPlaybackTimerRef.current = null;
            }
            pendingTurnCompleteRef.current = false;
            turnHasAudioChunkRef.current = false;
            streamingTextRef.current = '';
            setStreamingTranscription(null);
            if (isOnboardingSession) {
              logOnboardingAudio('onboarding_barge_in_trigger', {
                trigger_count: bargeInTriggerCountRef.current,
                consecutive_frames: BARGE_IN_MIN_CONSECUTIVE_FRAMES,
                mic_rms: micRms,
                threshold_rms: threshold,
                playback_rms_ema: playbackRms,
                noise_floor_rms_ema: noiseFloor,
                playback_stopped_on_input_count:
                  diagnostics.playbackStoppedOnInputCount,
              });
            }
            void stopPlayback();
            sendMicChunk();
          } else {
            echoGuardDropCountRef.current += 1;
            if (
              isOnboardingSession &&
              echoGuardDropCountRef.current % 40 === 0
            ) {
              logOnboardingAudio('onboarding_echo_guard_drop', {
                dropped_chunk_count: echoGuardDropCountRef.current,
                mic_rms: micRms,
                threshold_rms: threshold,
                playback_rms_ema: playbackRms,
                noise_floor_rms_ema: noiseFloor,
                barge_in_frames: bargeInConsecutiveFramesRef.current,
              });
            }
          }
        }
      }

      if (isOnboardingSession && diagnostics.inputChunkSeenCount % 100 === 0) {
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
        const now = Date.now();
        if (isOnboardingSession) {
          const lastStrongUserSpeechAtMs = lastStrongUserSpeechAtMsRef.current;
          const msSinceStrongUserSpeech =
            lastStrongUserSpeechAtMs > 0
              ? now - lastStrongUserSpeechAtMs
              : null;
          const withinSpeechHoldWindow =
            msSinceStrongUserSpeech !== null &&
            msSinceStrongUserSpeech >= 0 &&
            msSinceStrongUserSpeech <= ONBOARDING_SPEECH_HOLD_MS;
          if (withinSpeechHoldWindow) {
            onboardingSpeechHoldSuppressedChunkCountRef.current += 1;
            if (
              onboardingSpeechHoldSuppressedChunkCountRef.current === 1 ||
              onboardingSpeechHoldSuppressedChunkCountRef.current % 20 === 0
            ) {
              logOnboardingAudio('speech_hold_suppress_assistant_audio', {
                suppressed_chunk_count:
                  onboardingSpeechHoldSuppressedChunkCountRef.current,
                ms_since_strong_user_speech: msSinceStrongUserSpeech,
                hold_window_ms: ONBOARDING_SPEECH_HOLD_MS,
                mime_type: mimeType || null,
              });
            }
            return;
          }
        }
        let gapMs: number | null = null;
        outputAudioChunkCountRef.current += 1;
        turnHasAudioChunkRef.current = true;
        bargeInActiveUntilMsRef.current = 0;
        echoGuardUntilMsRef.current = now + ECHO_GUARD_TAIL_MS;
        bargeInConsecutiveFramesRef.current = 0;
        const outputRms =
          typeof audioData === 'string'
            ? pcm16RmsFromBase64(audioData)
            : pcm16RmsFromArrayBuffer(audioData);
        const currentPlaybackRms = playbackRmsEmaRef.current;
        playbackRmsEmaRef.current =
          currentPlaybackRms +
          SIGNAL_EMA_ALPHA * (outputRms - currentPlaybackRms);
        if (isOnboardingSession) {
          const diagnostics = onboardingDiagnosticsRef.current;
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
    const unsubscribe = onEvent((event: AgentSocketEvent) => {
      if (isOnboardingCompletedEvent(event) && isOnboardingSession) {
        showOnboardingDoneState();
        return;
      }
      if (isOnboardingCompletionFailedEvent(event) && isOnboardingSession) {
        const normalizedMissingFields = Array.isArray(event.missing_fields)
          ? event.missing_fields.filter((field) => typeof field === 'string')
          : [];
        setOnboardingDoneVisible(false);
        setContinueError(null);
        setCompletionErrorMessage(
          event.message ||
            'Onboarding is not complete yet. Please answer the missing fields.'
        );
        setMissingFields(normalizedMissingFields);
        return;
      }
      if (!isADKEvent(event)) {
        return;
      }

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
          lastStrongUserSpeechAtMsRef.current = Date.now();
        }
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
        if (turnHasAudioChunkRef.current) {
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
    showOnboardingDoneState,
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

        {isOnboardingSession &&
        !onboardingDoneVisible &&
        (completionErrorMessage || continueError) ? (
          <View
            style={styles.onboardingAlert}
            testID="onboarding-failure-panel"
          >
            <Text style={styles.onboardingAlertTitle}>
              Onboarding needs one more step
            </Text>
            {completionErrorMessage ? (
              <Text style={styles.onboardingAlertText}>
                {completionErrorMessage}
              </Text>
            ) : null}
            {missingFields.length > 0 ? (
              <Text style={styles.onboardingAlertText}>
                Missing: {missingFields.join(', ')}
              </Text>
            ) : null}
            {continueError ? (
              <Text style={styles.onboardingAlertText}>{continueError}</Text>
            ) : null}
          </View>
        ) : null}

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

        {onboardingDoneVisible ? (
          <View
            style={styles.onboardingDoneOverlay}
            testID="onboarding-done-panel"
          >
            <View style={styles.onboardingDoneCard}>
              <Text style={styles.onboardingDoneTitle}>
                Onboarding complete
              </Text>
              <Text style={styles.onboardingDoneText}>
                Your setup is saved. Tap Continue to enter the main assistant.
              </Text>
              <TouchableOpacity
                style={styles.onboardingDoneButton}
                activeOpacity={0.7}
                onPress={handleContinueToAssistant}
                disabled={isVerifyingContinue}
                testID="onboarding-continue-button"
              >
                <Text style={styles.onboardingDoneButtonText}>
                  {isVerifyingContinue ? 'Checking...' : 'Continue'}
                </Text>
              </TouchableOpacity>
              {continueError ? (
                <Text style={styles.onboardingDoneErrorText}>
                  {continueError}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
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
  onboardingAlert: {
    width: '92%',
    backgroundColor: 'rgba(130, 22, 22, 0.85)',
    borderColor: 'rgba(255, 190, 190, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    zIndex: 3,
  },
  onboardingAlertTitle: {
    color: '#FFD5D5',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  onboardingAlertText: {
    color: '#FFEAEA',
    fontSize: 12,
    lineHeight: 17,
  },
  onboardingDoneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    paddingHorizontal: 20,
  },
  onboardingDoneCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C3A58',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  onboardingDoneTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  onboardingDoneText: {
    color: '#C6D0EA',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  onboardingDoneButton: {
    backgroundColor: '#0A45FF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  onboardingDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  onboardingDoneErrorText: {
    color: '#FFCDCD',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
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
