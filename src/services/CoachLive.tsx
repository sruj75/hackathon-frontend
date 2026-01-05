import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getApp } from '@react-native-firebase/app';
import { getAI, getLiveGenerativeModel, LiveSession, VertexAIBackend } from '@react-native-firebase/ai';
import AudioPlayer from './AudioPlayer';
import AudioRecorder from './AudioRecorder';

const MODEL_NAME = 'gemini-live-2.5-flash-native-audio';

type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';

export default function CoachLive() {
  const [status, setStatus] = useState<ConnectionStatus>('Disconnected');
  const [logs, setLogs] = useState<string[]>([]);

  const sessionRef = useRef<LiveSession | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 99)]);
  }, []);

  useEffect(() => {
    audioPlayerRef.current = new AudioPlayer(addLog);
    return () => {
      audioPlayerRef.current?.stop();
    };
  }, [addLog]);

  const connectToCoach = async () => {
    try {
      addLog('Initializing Firebase AI...');
      setStatus('Connecting');

      const ai = getAI(getApp(), { backend: new VertexAIBackend('us-central1') });

      const model = getLiveGenerativeModel(ai, {
        model: MODEL_NAME,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' }
            }
          }
        },
        systemInstruction: {
          role: 'system',
          parts: [{
            text: 'You are a supportive accountability coach. Be encouraging, concise, and help the user stay on track with their goals. Keep responses brief and conversational.'
          }]
        }
      });

      addLog('Establishing session...');
      const session = await model.connect();
      sessionRef.current = session;
      setStatus('Connected');
      addLog('✅ Session active! Waiting for server setup...');

      listenToResponses(session);

      // Start recording immediately after connection
      await startAutoRecording();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Error: ${errorMessage}`);
      setStatus('Error');
    }
  };

  const startAutoRecording = async () => {
    addLog('🎙️ Starting auto-recording (VAD active)...');

    const recorder = new AudioRecorder(
      async (base64Pcm: string) => {
        if (sessionRef.current && !sessionRef.current.isClosed) {
          try {
            await sessionRef.current.sendAudioRealtime({
              mimeType: 'audio/pcm',
              data: base64Pcm
            });
          } catch (error) {
            addLog(`❌ Send audio error: ${error}`);
          }
        }
      },
      addLog
    );

    audioRecorderRef.current = recorder;
    const started = await recorder.start();

    if (started) {
      addLog('🎙️ Mic active - just speak naturally!');
    } else {
      addLog('❌ Failed to start recording');
    }
  };

  const listenToResponses = async (session: LiveSession) => {
    try {
      for await (const message of session.receive()) {
        const data = message as any;
        addLog(`📥 Raw received (type: ${data.type})`);

        try {
          // Parse in React demo order
          if (data?.setupComplete) {
            addLog('✅ Setup complete!');
            // startAutoRecording(); // Already started upon connection
            continue;
          }

          if (data?.turnComplete) {
            addLog('--- Turn complete ---');
            continue;
          }

          if (data?.interrupted) {
            addLog('⚡ Interrupted');
            audioPlayerRef.current?.stop();
            continue;
          }

          if (data?.inputTranscription) {
            const text = data.inputTranscription.text || '';
            const done = data.inputTranscription.finished || false;
            if (text) {
              addLog(`📝 You: "${text}"${done ? ' ✓' : '...'}`);
            }
            continue;
          }

          if (data?.outputTranscription) {
            const text = data.outputTranscription.text || '';
            const done = data.outputTranscription.finished || false;
            if (text) {
              addLog(`💬 Coach: "${text}"${done ? ' ✓' : '...'}`);
            }
            continue;
          }

          if (data?.toolCall) {
            addLog(`🔧 Tool: ${JSON.stringify(data.toolCall)}`);
            continue;
          }

          const parts = data?.modelTurn?.parts;
          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              if (part.text) {
                addLog(`💬 Coach (text): "${part.text}"`);
              }

              if (part.inlineData?.data) {
                const audioData = part.inlineData.data;
                addLog(`🔊 Audio received: ${audioData.length} chars`);
                audioPlayerRef.current?.addChunk(audioData);
              }
            }
          }

        } catch (parseError) {
          addLog(`⚠️ Parse error: ${parseError}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`⚠️ Stream error: ${errorMessage}`);
      if (!sessionRef.current?.isClosed) {
        setStatus('Error');
      }
    }
  };

  const disconnect = async () => {
    await audioRecorderRef.current?.stop();
    audioRecorderRef.current = null;

    await audioPlayerRef.current?.stop();

    if (sessionRef.current) {
      addLog('Disconnecting...');
      try {
        await sessionRef.current.close();
        addLog('✅ Disconnected');
      } catch (error) {
        addLog('Forced disconnect');
      }
      sessionRef.current = null;
    }
    setStatus('Disconnected');
  };

  useEffect(() => {
    return () => {
      audioRecorderRef.current?.stop();
      audioPlayerRef.current?.stop();
      if (sessionRef.current && !sessionRef.current.isClosed) {
        sessionRef.current.close().catch(() => { });
      }
    };
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'Connected': return '#4CAF50';
      case 'Connecting': return '#FF9800';
      case 'Error': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>🎯 Gemini Coach</Text>
      <Text style={[styles.status, { color: getStatusColor() }]}>
        ● {status}
      </Text>

      <View style={styles.btnRow}>
        {status !== 'Connected' ? (
          <TouchableOpacity
            style={[styles.mainBtn, status === 'Connecting' && styles.btnDisabled]}
            onPress={connectToCoach}
            disabled={status === 'Connecting'}
          >
            <Text style={styles.mainBtnText}>
              {status === 'Connecting' ? 'Connecting...' : 'Start Conversation'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.mainBtn, styles.disconnectBtn]}
            onPress={disconnect}
          >
            <Text style={styles.mainBtnText}>End Conversation</Text>
          </TouchableOpacity>
        )}
      </View>

      {status === 'Connected' && (
        <Text style={styles.hint}>
          🎙️ Just speak naturally - the AI will respond automatically
        </Text>
      )}

      <Text style={styles.logsHeader}>Logs:</Text>
      <ScrollView style={styles.logs}>
        {logs.map((log, index) => (
          <Text key={index} style={styles.log}>{log}</Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff'
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center'
  },
  status: {
    marginBottom: 20,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600'
  },
  btnRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  mainBtn: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    minWidth: 200,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: '#B0BEC5',
  },
  disconnectBtn: {
    backgroundColor: '#F44336',
  },
  mainBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  hint: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  logsHeader: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#666'
  },
  logs: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8
  },
  log: {
    fontSize: 11,
    marginBottom: 4,
    fontFamily: 'monospace'
  }
});
