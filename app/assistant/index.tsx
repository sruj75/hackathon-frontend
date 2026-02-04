import {
  Animated,
  StyleSheet,
  useAnimatedValue,
  View,
  ScrollView,
  Text,
} from 'react-native';

import React, { useCallback, useEffect, useState, useRef } from 'react';
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

// Generative UI Components
import { DayView } from '../../components/generative/DayView';
import { TodoList } from '../../components/generative/TodoList';
import { CalendarView } from '../../components/generative/CalendarView';

// Hardcoded userId for v0 (matches root layout)
const USER_ID = 'user_default';

interface Transcription {
  participant: string;
  text: string;
  timestamp: number;
}

type ViewMode = 'voice' | 'chat' | 'ui';

export default function AssistantScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Get session ID from route params (deep link) or generate new one
  const sessionId =
    (params.resume_session_id as string) || `session-${Date.now()}`;

  // Log deep link context if available
  useEffect(() => {
    if (params.resume_session_id) {
      console.log(
        '[AssistantScreen] Resuming session from notification:',
        params.resume_session_id,
        'type:',
        params.trigger_type
      );
    }
  }, [params.resume_session_id, params.trigger_type]);

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
  } = useWebSocketAgent(USER_ID, sessionId);

  // Audio recording and playback
  const { isRecording, startRecording, stopRecording, onAudioData } =
    useAudioRecording();
  const { isPlaying, playAudio, stopPlayback } = useAudioPlayback();

  // UI State
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('voice');
  const [chatMessage, setChatMessage] = useState('');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);

  // Generative UI State
  const [uiComponents, setUIComponents] = useState<GenerativeUIEvent[]>([]);
  const [isPendingUIRender, setIsPendingUIRender] = useState(false);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Auto-start recording when WebSocket connects for real-time streaming
  const hasAutoStartedRef = React.useRef(false);
  useEffect(() => {
    if (wsState.isConnected && !isRecording && !hasAutoStartedRef.current) {
      console.log('Auto-starting real-time recording...');
      startRecording()
        .then(() => {
          setIsMicEnabled(true);
          hasAutoStartedRef.current = true;
          console.log('Real-time audio streaming active');
        })
        .catch((err) => console.error('Failed to start recording:', err));
    }
  }, [wsState.isConnected, isRecording, startRecording]);

  // Set up audio data callback - stream audio chunks to WebSocket in real-time
  useEffect(() => {
    const unsubscribe = onAudioData((data) => {
      // Software AEC: Don't send audio while agent is speaking to prevent loopback
      if (wsState.isConnected && !isPlaying) {
        // Log periodically to avoid spam
        // console.log(`Streaming audio chunk: ${data.byteLength} bytes`);
        sendAudio(data);
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [onAudioData, sendAudio, wsState.isConnected, isPlaying]);

  // Set up audio playback callback - play audio received from server
  useEffect(() => {
    const unsubscribe = onAudio((audioData) => {
      playAudio(audioData);
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [onAudio, playAudio]);

  // Handle UI components from backend
  useEffect(() => {
    onUIComponent((component: GenerativeUIEvent) => {
      setUIComponents([component]); // Replace with new component (clearing history)
      setIsPendingUIRender(true); // Trigger collapse animation (callback will handle UI render)
    });
  }, [onUIComponent]);

  const addTranscription = useCallback((participant: string, text: string) => {
    setTranscriptions((prev) => [
      ...prev,
      { participant, text, timestamp: Date.now() },
    ]);
  }, []);

  // Handle ADK events (transcriptions, responses)
  useEffect(() => {
    const unsubscribe = onEvent((event: ADKEvent) => {
      // Handle input transcription (user speech)
      if (event.serverContent?.inputTranscription?.text) {
        addTranscription(USER_ID, event.serverContent.inputTranscription.text);
      }

      // Handle output transcription (agent speech)
      if (event.serverContent?.outputTranscription?.text) {
        console.log(
          '[CHAT] Received output transcription:',
          event.serverContent.outputTranscription.text
        );
        addTranscription('Agent', event.serverContent.outputTranscription.text);
      }

      // Handle text responses (Chat Mode)
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          if (part.text) {
            console.log('[CHAT] Received text part:', part.text);
            addTranscription('Agent', part.text);
          }
        }
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [onEvent, addTranscription]);

  // Control callbacks
  const onMicClick = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
      setIsMicEnabled(false);
    } else {
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

  const onExitClick = useCallback(() => {
    disconnect();
    stopPlayback();
    router.back();
  }, [router, disconnect, stopPlayback]);

  const onChatSend = useCallback(
    (message: string) => {
      addTranscription(USER_ID, message);
      sendText(message);
      setChatMessage('');
    },
    [sendText, addTranscription]
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
    switch (component.type) {
      case 'day_view':
        return (
          <DayView
            key={component.id}
            events={(props.events as []) || []}
            tasks={(props.tasks as []) || []}
          />
        );
      case 'todo_list':
        return (
          <TodoList key={component.id} tasks={(props.tasks as []) || []} />
        );
      case 'calendar_view':
        return (
          <CalendarView
            key={component.id}
            events={(props.events as []) || []}
          />
        );
      default:
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
    }
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
              />
              <ChatBar
                style={styles.chatBar}
                value={chatMessage}
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
            isMicEnabled,
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
