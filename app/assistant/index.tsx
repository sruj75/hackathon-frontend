import {
  Animated,
  Dimensions,
  StyleSheet,
  useAnimatedValue,
  View,
  ViewStyle,
  ScrollView,
  TouchableOpacity,
  Text,
} from 'react-native';

import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ControlBar from '../../components/assistant/ControlBar';
import ChatBar from '../../components/assistant/ChatBar';
import ChatLog from '../../components/assistant/ChatLog';
import AgentVisualization from '../../components/assistant/AgentVisualization';
import { useWebSocketAgent, ADKEvent, GenerativeUIEvent } from '@/hooks/useWebSocketAgent';
import { useAudioRecording, useAudioPlayback } from '@/hooks/useAudio';

// Generative UI Components
import { DayView } from '../../components/generative/DayView';
import { GoalProgress } from '../../components/generative/GoalProgress';
import { TimeSlots } from '../../components/generative/TimeSlots';
import { Confirmation } from '../../components/generative/Confirmation';
import { DaySummary } from '../../components/generative/DaySummary';
import { CurrentFocus } from '../../components/generative/CurrentFocus';

// Generate unique IDs for this session
const userId = `user-${Date.now()}`;
const sessionId = `session-${Date.now()}`;

interface Transcription {
  participant: string;
  text: string;
  timestamp: number;
}

export default function AssistantScreen() {
  const router = useRouter();

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
  } = useWebSocketAgent(userId, sessionId);

  // Audio recording and playback
  const { isRecording, startRecording, stopRecording, onAudioData } = useAudioRecording();
  const { isPlaying, playAudio, stopPlayback } = useAudioPlayback();

  // UI State
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isChatEnabled, setChatEnabled] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);

  // Generative UI State (MVP - instant toggle, no animations)
  const [uiComponents, setUIComponents] = useState<GenerativeUIEvent[]>([]);
  const isMinimized = uiComponents.length > 0; // Auto-minimize when components exist

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
        console.log(`Streaming audio chunk: ${data.byteLength} bytes`);
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
    const unsubscribe = onUIComponent((component: GenerativeUIEvent) => {
      setUIComponents((prev) => [...prev.slice(-5), component]); // Keep last 5
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [onUIComponent]);

  // Handle ADK events (transcriptions, responses)
  useEffect(() => {
    const unsubscribe = onEvent((event: ADKEvent) => {
      // Handle input transcription (user speech)
      if (event.serverContent?.inputTranscription?.text) {
        addTranscription(userId, event.serverContent.inputTranscription.text);
      }

      // Handle output transcription (agent speech)
      if (event.serverContent?.outputTranscription?.text) {
        addTranscription('Agent', event.serverContent.outputTranscription.text);
      }

      // Handle text responses
      if (event.content?.parts) {
        for (const part of event.content.parts) {
          if (part.text) {
            addTranscription('Agent', part.text);
          }
        }
      }
    });
    return unsubscribe; // Cleanup to prevent duplicate listeners
  }, [onEvent]);

  const addTranscription = useCallback((participant: string, text: string) => {
    setTranscriptions((prev) => [
      ...prev,
      { participant, text, timestamp: Date.now() },
    ]);
  }, []);

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
    setChatEnabled(!isChatEnabled);
  }, [isChatEnabled]);

  const onExitClick = useCallback(() => {
    disconnect();
    stopPlayback();
    router.back();
  }, [router, disconnect, stopPlayback]);

  const onChatSend = useCallback(
    (message: string) => {
      addTranscription(userId, message);
      sendText(message);
      setChatMessage('');
    },
    [sendText, addTranscription]
  );

  // Render Generative UI component based on type
  const renderUIComponent = (component: GenerativeUIEvent) => {
    const props = component.props as Record<string, unknown>;
    switch (component.type) {
      case 'day_view':
        return (
          <DayView
            key={component.id}
            events={(props.events as []) || []}
            tasks={(props.tasks as []) || []}
          />
        );
      case 'goal_progress':
        return (
          <GoalProgress
            key={component.id}
            percentage={(props.percentage as number) || 0}
            summary={(props.summary as string) || ''}
            completed={(props.completed as []) || []}
            pending={(props.pending as []) || []}
          />
        );
      case 'time_slots':
        return (
          <TimeSlots key={component.id} slots={(props.slots as []) || []} />
        );
      case 'confirmation':
        return (
          <Confirmation
            key={component.id}
            action={(props.action as string) || ''}
            details={(props.details as string) || ''}
          />
        );
      case 'day_summary':
        return (
          <DaySummary
            key={component.id}
            completed={(props.completed as []) || []}
            pending={(props.pending as []) || []}
            events_count={(props.events_count as number) || 0}
          />
        );
      case 'current_focus':
        return (
          <CurrentFocus
            key={component.id}
            event={props.event as undefined}
            next_event={props.next_event as undefined}
          />
        );
      default:
        return null;
    }
  };

  // Layout positioning
  const [containerWidth, setContainerWidth] = useState(Dimensions.get('window').width);
  const [containerHeight, setContainerHeight] = useState(Dimensions.get('window').height);

  const agentVisualizationPosition = useAgentVisualizationPosition(
    isChatEnabled,
    false // No local video in WebSocket mode
  );

  // MVP: Instant toggle - no animations
  if (isMinimized) {
    // Minimized mode: Generative UI takes main space, agent in bottom bar
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Generative UI Components - takes main space */}
          <ScrollView style={styles.generativeUIContainer}>
            {uiComponents.map(renderUIComponent)}
          </ScrollView>

          {/* Bottom Bar - Compact Agent */}
          <View style={styles.bottomBar}>
            <View style={styles.bottomBarContent}>
              <View style={styles.compactVisualization}>
                <AgentVisualization
                  style={styles.compactAgent}
                  isConnected={wsState.isConnected}
                  isPlaying={isPlaying}
                />
              </View>

              <View style={styles.bottomBarControls}>
                <Text style={styles.bottomBarText}>
                  {isRecording ? '🎤 Listening...' : '🎤'}
                </Text>
                <TouchableOpacity onPress={onExitClick} style={styles.exitButton}>
                  <Text style={styles.exitButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Expanded mode: Full screen agent (current default behavior)
  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        style={styles.container}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setContainerWidth(width);
          setContainerHeight(height);
        }}
      >
        <View style={styles.spacer} />
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

        <Animated.View
          style={[
            {
              position: 'absolute',
              zIndex: 1,
              backgroundColor: '#000000',
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

        <ControlBar
          style={styles.controlBar}
          options={{
            isMicEnabled,
            isCameraEnabled: false,
            isChatEnabled,
            onMicClick,
            onCameraClick: () => { }, // No camera in WebSocket mode
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
    height: '24%',
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
    marginBottom: 16,
  },
  controlBar: {
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
  // Minimized mode styles (MVP - scrappy)
  generativeUIContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  bottomBar: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactVisualization: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  compactAgent: {
    width: '100%',
    height: '100%',
  },
  bottomBarControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bottomBarText: {
    color: '#fff',
    fontSize: 14,
  },
  exitButton: {
    padding: 8,
  },
  exitButtonText: {
    color: '#888',
    fontSize: 20,
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
  isChatVisible: boolean,
  _hasLocalVideo: boolean
) => {
  const width = useAnimatedValue(isChatVisible ? collapsedWidth : expandedAgentWidth);
  const height = useAnimatedValue(isChatVisible ? collapsedHeight : expandedAgentHeight);

  useEffect(() => {
    const widthAnim = Animated.spring(
      width,
      createAnimConfig(isChatVisible ? collapsedWidth : expandedAgentWidth)
    );
    const heightAnim = Animated.spring(
      height,
      createAnimConfig(isChatVisible ? collapsedHeight : expandedAgentHeight)
    );

    widthAnim.start();
    heightAnim.start();

    return () => {
      widthAnim.stop();
      heightAnim.stop();
    };
  }, [width, height, isChatVisible]);

  const x = useAnimatedValue(0);
  const y = useAnimatedValue(0);

  useEffect(() => {
    let targetX = 0;
    let targetY = 0;

    if (isChatVisible) {
      targetX = 0.5 - collapsedWidth / 2;
      targetY = 16;
    }

    const xAnim = Animated.spring(x, createAnimConfig(targetX));
    const yAnim = Animated.spring(y, createAnimConfig(targetY));

    xAnim.start();
    yAnim.start();

    return () => {
      xAnim.stop();
      yAnim.stop();
    };
  }, [x, y, isChatVisible]);

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
