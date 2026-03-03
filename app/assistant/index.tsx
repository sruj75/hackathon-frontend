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
  const streamingTextRef = useRef('');
  const lastAgentMessageRef = useRef<{
    text: string;
    timestamp: number;
  } | null>(null);
  const turnHasOutputTranscriptionRef = useRef(false);
  const hasPostOnboardingHandoffRef = useRef(false);
  const pendingPostOnboardingReconnectRef = useRef(false);
  const playbackEndDebounceMs =
    triggerType === 'onboarding'
      ? PLAYBACK_END_DEBOUNCE_MS_ONBOARDING
      : PLAYBACK_END_DEBOUNCE_MS_DEFAULT;

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
    if (endPlaybackTimerRef.current) {
      clearTimeout(endPlaybackTimerRef.current);
    }
    endPlaybackTimerRef.current = setTimeout(() => {
      void endPlayback();
      pendingTurnCompleteRef.current = false;
      endPlaybackTimerRef.current = null;
    }, playbackEndDebounceMs);
  }, [endPlayback, playbackEndDebounceMs]);

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

  // Auto-start recording when WebSocket connects for real-time streaming
  const hasAutoStartedRef = React.useRef(false);
  const isStoppingRecordingRef = React.useRef(false);
  useEffect(() => {
    if (
      wsState.isConnected &&
      !awaitingInitialGreeting &&
      !isRecording &&
      !hasAutoStartedRef.current &&
      !isStoppingRecordingRef.current
    ) {
      console.log('Auto-starting real-time recording...');
      startRecording()
        .then(() => {
          setIsMicEnabled(true);
          hasAutoStartedRef.current = true;
          console.log('Real-time audio streaming active');
        })
        .catch((err) => console.error('Failed to start recording:', err));
    }
  }, [
    wsState.isConnected,
    awaitingInitialGreeting,
    isRecording,
    startRecording,
  ]);

  // Ensure recording is torn down when WebSocket disconnects.
  useEffect(() => {
    if (!wsState.isConnected) {
      if (endPlaybackTimerRef.current) {
        clearTimeout(endPlaybackTimerRef.current);
        endPlaybackTimerRef.current = null;
      }
      pendingTurnCompleteRef.current = false;
      streamingTextRef.current = '';
      turnHasOutputTranscriptionRef.current = false;
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
  }, [wsState.isConnected, isRecording, stopRecording]);

  // Set up audio data callback - stream audio chunks to WebSocket in real-time
  useEffect(() => {
    const unsubscribe = onAudioData((data) => {
      // Full duplex for true barge-in: keep sending mic audio even while assistant is speaking.
      // iOS voiceChat mode in expo-realtime-audio provides native echo management.
      if (wsState.isConnected) {
        sendAudio(data);
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [onAudioData, sendAudio, wsState.isConnected]);

  // Set up audio playback callback - play audio received from server
  useEffect(() => {
    const unsubscribe = onAudio((audioData, mimeType) => {
      // Keep audio output active across voice/chat/ui views.
      // View mode should affect layout, not whether the user hears the assistant.
      if (wsState.isConnected) {
        playAudio(audioData, mimeType);
      }
      // Once turnComplete is seen, keep extending the end timer as chunks arrive.
      if (pendingTurnCompleteRef.current) {
        schedulePlaybackEnd();
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [onAudio, playAudio, schedulePlaybackEnd, wsState.isConnected]);

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
        if (endPlaybackTimerRef.current) {
          clearTimeout(endPlaybackTimerRef.current);
          endPlaybackTimerRef.current = null;
        }
        pendingTurnCompleteRef.current = false;
        streamingTextRef.current = '';
        turnHasOutputTranscriptionRef.current = false;
        void stopPlayback();
        setStreamingTranscription(null);
      }

      // Handle input transcription (user speech)
      if (event.serverContent?.inputTranscription?.text) {
        const ignoreOnboardingPlaybackBargeIn =
          isOnboardingSession && isPlaying;
        // If user starts talking, stop assistant playback immediately for barge-in UX.
        if (isPlaying && !ignoreOnboardingPlaybackBargeIn) {
          if (endPlaybackTimerRef.current) {
            clearTimeout(endPlaybackTimerRef.current);
            endPlaybackTimerRef.current = null;
          }
          pendingTurnCompleteRef.current = false;
          streamingTextRef.current = '';
          setStreamingTranscription(null);
          void stopPlayback();
        }
        if (!ignoreOnboardingPlaybackBargeIn) {
          addTranscription(
            transcriptionUserId,
            event.serverContent.inputTranscription.text
          );
        }
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
        console.log('[CHAT] Turn complete, finalizing streaming transcription');
        setAwaitingInitialGreeting(false);
        pendingTurnCompleteRef.current = true;
        schedulePlaybackEnd();
        if (
          streamingTextRef.current &&
          !turnHasOutputTranscriptionRef.current
        ) {
          addAgentTranscription(streamingTextRef.current);
        }
        streamingTextRef.current = '';
        turnHasOutputTranscriptionRef.current = false;
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
