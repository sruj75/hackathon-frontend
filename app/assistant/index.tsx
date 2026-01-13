import {
  Animated,
  Dimensions,
  StyleSheet,
  useAnimatedValue,
  View,
  ViewStyle,
} from 'react-native';

import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ControlBar from './ui/ControlBar';
import ChatBar from './ui/ChatBar';
import ChatLog from './ui/ChatLog';
import AgentVisualization from './ui/AgentVisualization';
import { useWebSocketAgent, ADKEvent } from '@/hooks/useWebSocketAgent';
import { useAudioRecording, useAudioPlayback } from '@/hooks/useAudio';

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
  } = useWebSocketAgent(userId, sessionId);

  // Audio recording and playback
  const { isRecording, startRecording, stopRecording, onAudioData } = useAudioRecording();
  const { isPlaying, playAudio, stopPlayback } = useAudioPlayback();

  // UI State
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isChatEnabled, setChatEnabled] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);

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
    onAudioData((data) => {
      if (wsState.isConnected) {
        // Log periodically to avoid spam
        console.log(`Streaming audio chunk: ${data.byteLength} bytes`);
        sendAudio(data);
      }
    });
  }, [onAudioData, sendAudio, wsState.isConnected]);

  // Set up audio playback callback - play audio received from server
  useEffect(() => {
    onAudio((audioData) => {
      playAudio(audioData);
    });
  }, [onAudio, playAudio]);

  // Handle ADK events (transcriptions, responses)
  useEffect(() => {
    onEvent((event: ADKEvent) => {
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

  // Layout positioning
  const [containerWidth, setContainerWidth] = useState(Dimensions.get('window').width);
  const [containerHeight, setContainerHeight] = useState(Dimensions.get('window').height);

  const agentVisualizationPosition = useAgentVisualizationPosition(
    isChatEnabled,
    false // No local video in WebSocket mode
  );

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
