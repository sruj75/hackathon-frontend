import { useCallback, useRef, useState, useEffect } from 'react';
import LiveAudioStream from 'react-native-live-audio-stream';
import { Audio, InterruptionModeIOS } from 'expo-av';

const AUDIO_DEBUG = __DEV__;

function audioLog(event: string, payload?: Record<string, unknown>) {
  if (!AUDIO_DEBUG) {
    return;
  }
  const ts = new Date().toISOString();
  if (payload) {
    console.log(`[AUDIO][${ts}] ${event}`, payload);
    return;
  }
  console.log(`[AUDIO][${ts}] ${event}`);
}

function audioError(event: string, error: unknown) {
  if (!AUDIO_DEBUG) {
    return;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'Unknown error';
  console.error(`[AUDIO] ${event}`, { message, raw: error });
}

type LiveAudioStreamRoutingModule = {
  forceSpeaker?: () => Promise<unknown>;
  getAudioRoute?: () => Promise<unknown>;
};

const liveAudioRouting =
  LiveAudioStream as unknown as LiveAudioStreamRoutingModule;

async function logNativeAudioRoute(reason: string) {
  if (!liveAudioRouting.getAudioRoute) {
    audioLog('route.snapshot.unavailable', { reason });
    return;
  }
  try {
    const route = await liveAudioRouting.getAudioRoute();
    if (route == null) {
      audioLog('route.snapshot.unavailable', { reason });
      return;
    }
    audioLog('route.snapshot', { reason, route });
  } catch (error) {
    audioError(`route.snapshot.failed.${reason}`, error);
  }
}

async function forceSpeakerRoute(reason: string) {
  if (!liveAudioRouting.forceSpeaker) {
    audioLog('route.forceSpeaker.unavailable', { reason });
    return;
  }
  try {
    const route = await liveAudioRouting.forceSpeaker();
    if (route == null) {
      audioLog('route.forceSpeaker.unavailable', { reason });
      return;
    }
    audioLog('route.forceSpeaker.success', { reason, route });
  } catch (error) {
    audioError(`route.forceSpeaker.failed.${reason}`, error);
  }
}

export interface UseAudioRecordingReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  onAudioData: (callback: (data: ArrayBuffer) => void) => void;
}

export function useAudioRecording(): UseAudioRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const audioDataCallbackRef = useRef<((data: ArrayBuffer) => void) | null>(
    null
  );
  const isInitializedRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const micChunkCountRef = useRef(0);
  const micByteCountRef = useRef(0);
  const micLastStatsLogMsRef = useRef(Date.now());

  const initializeAudioSessionAndStream = useCallback(async () => {
    if (isInitializedRef.current) {
      audioLog('recording.init.skipped.alreadyInitialized');
      return;
    }

    if (initPromiseRef.current) {
      audioLog('recording.init.awaitExistingPromise');
      await initPromiseRef.current;
      return;
    }

    audioLog('recording.init.start');
    initPromiseRef.current = (async () => {
      try {
        // Configure expo-av first, then let LiveAudioStream set category/mode last.
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        audioLog('recording.mode.set.success', {
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          interruptionModeIOS: 'DoNotMix',
          playThroughEarpieceAndroid: false,
        });
        await logNativeAudioRoute('after_expo_audio_mode_set');
      } catch (error) {
        audioError('recording.mode.set.failed', error);
      }

      audioLog('recording.stream.init');
      LiveAudioStream.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // VOICE_RECOGNITION on Android
        bufferSize: 4096,
        wavFile: 'audio.wav', // Required prop, but we use the stream
      });
      await logNativeAudioRoute('after_live_stream_init');

      LiveAudioStream.on('data', (data: string) => {
        if (audioDataCallbackRef.current) {
          // data is base64 encoded PCM 16-bit
          const binaryString = atob(data);
          micChunkCountRef.current += 1;
          micByteCountRef.current += binaryString.length;

          const now = Date.now();
          if (now - micLastStatsLogMsRef.current >= 2000) {
            audioLog('recording.mic.stats', {
              chunks: micChunkCountRef.current,
              bytes: micByteCountRef.current,
              avgChunkBytes:
                micChunkCountRef.current > 0
                  ? Math.round(
                      micByteCountRef.current / micChunkCountRef.current
                    )
                  : 0,
            });
            micChunkCountRef.current = 0;
            micByteCountRef.current = 0;
            micLastStatsLogMsRef.current = now;
          }

          // Convert base64 PCM to byte array for upstream websocket streaming.
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          audioDataCallbackRef.current(bytes.buffer);
        }
      });

      isInitializedRef.current = true;
      audioLog('recording.init.success');
    })();

    try {
      await initPromiseRef.current;
    } catch (error) {
      initPromiseRef.current = null;
      audioError('recording.init.failed', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    initializeAudioSessionAndStream().catch((error) => {
      audioError('recording.effect.init.failed', error);
    });

    return () => {
      audioLog('recording.effect.cleanup.stopStream');
      LiveAudioStream.stop();
    };
  }, [initializeAudioSessionAndStream]);

  const startRecording = useCallback(async () => {
    try {
      audioLog('recording.start.requested');
      await initializeAudioSessionAndStream();

      // Check permissions using expo-av (since LiveAudioStream doesn't expose permission check)
      // Or just trust the app has them from usage description
      const beforePermission = await Audio.getPermissionsAsync();
      audioLog('recording.permission.current', {
        status: beforePermission.status,
        granted: beforePermission.granted,
        canAskAgain: beforePermission.canAskAgain,
      });

      const { status } = await Audio.requestPermissionsAsync();
      audioLog('recording.permission.requestResult', { status });
      if (status !== 'granted') {
        throw new Error('Microphone permission not granted');
      }

      audioLog('recording.stream.start');
      LiveAudioStream.start();
      await forceSpeakerRoute('after_live_stream_start');

      setIsRecording(true);
      audioLog('recording.start.success');
    } catch (error) {
      audioError('recording.start.failed', error);
      setIsRecording(false);
      throw error;
    }
  }, [initializeAudioSessionAndStream]);

  const stopRecording = useCallback(async () => {
    try {
      audioLog('recording.stop.requested');
      LiveAudioStream.stop();
      audioLog('recording.stop.success');
    } catch (error) {
      audioError('recording.stop.failed', error);
    }
    setIsRecording(false);
  }, []);

  const onAudioData = useCallback((callback: (data: ArrayBuffer) => void) => {
    audioDataCallbackRef.current = callback;
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    onAudioData,
  };
}

export interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  playAudio: (audioData: ArrayBuffer, mimeType?: string) => Promise<void>;
  stopPlayback: () => Promise<void>;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isProcessingRef = useRef(false);
  const queueEnqueueCountRef = useRef(0);
  const queueEnqueueByteCountRef = useRef(0);
  const queueLastEnqueueLogMsRef = useRef(Date.now());
  const playbackBatchIdRef = useRef(0);
  const playbackSkipLogLastMsRef = useRef(0);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) {
      const now = Date.now();
      if (now - playbackSkipLogLastMsRef.current >= 1000) {
        audioLog('playback.process.skip.alreadyProcessing', {
          queueDepth: audioQueueRef.current.length,
        });
        playbackSkipLogLastMsRef.current = now;
      }
      return;
    }

    const batchId = ++playbackBatchIdRef.current;
    isProcessingRef.current = true;
    setIsPlaying(true);
    audioLog('playback.process.start', {
      batchId,
      initialQueueDepth: audioQueueRef.current.length,
    });

    while (audioQueueRef.current.length > 0) {
      // Batching Strategy: Take ALL currently available chunks
      // This prevents creating a tiny sound for every 4KB (85ms) chunk
      const chunksToPlay = [...audioQueueRef.current];
      audioQueueRef.current = [];

      if (chunksToPlay.length === 0) continue;

      const totalSize = chunksToPlay.reduce(
        (acc, chunk) => acc + chunk.byteLength,
        0
      );
      audioLog('playback.batch.merged', {
        batchId,
        chunkCount: chunksToPlay.length,
        totalSize,
      });

      // Merge chunks
      const mergedBuffer = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunksToPlay) {
        mergedBuffer.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      try {
        // Create WAV header for the merged PCM data (24kHz, 1ch, 16bit)
        const wavHeader = createWavHeader(totalSize, 24000, 1, 16);

        // Concatenate header and merged data
        const wavData = new Uint8Array(wavHeader.byteLength + totalSize);
        wavData.set(wavHeader);
        wavData.set(mergedBuffer, wavHeader.byteLength);

        // Convert to base64
        let binary = '';
        const len = wavData.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(wavData[i]);
        }
        const base64 = btoa(binary);
        const dataUri = `data:audio/wav;base64,${base64}`;
        audioLog('playback.sound.create', {
          batchId,
          wavBytes: wavData.byteLength,
        });
        await forceSpeakerRoute(`before_sound_create_batch_${batchId}`);

        // Create and play sound
        const { sound } = await Audio.Sound.createAsync(
          { uri: dataUri },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        audioLog('playback.sound.create.success', { batchId });
        await logNativeAudioRoute(`after_sound_create_batch_${batchId}`);

        await new Promise<void>((resolve) => {
          let settled = false;
          const settle = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };

          const timeoutId = setTimeout(() => {
            audioLog('playback.status.timeout', { batchId, timeoutMs: 15000 });
            settle();
          }, 15000);

          let firstLoadedStatusLogged = false;
          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) {
              if (status.error) {
                audioLog('playback.status.error', {
                  batchId,
                  error: status.error,
                });
              }
              return;
            }

            if (!firstLoadedStatusLogged) {
              firstLoadedStatusLogged = true;
              audioLog('playback.status.firstLoaded', {
                batchId,
                positionMillis: status.positionMillis,
                durationMillis: status.durationMillis,
                isPlaying: status.isPlaying,
              });
            }

            if (status.didJustFinish) {
              clearTimeout(timeoutId);
              audioLog('playback.status.finished', {
                batchId,
                finalPositionMillis: status.positionMillis,
              });
              settle();
            }
          });
        });

        await sound.unloadAsync();
        soundRef.current = null;
        audioLog('playback.sound.unload.success', { batchId });
      } catch (error) {
        audioError('playback.sound.failed', error);
      }
    }

    isProcessingRef.current = false;
    setIsPlaying(false);
    audioLog('playback.process.done', { batchId });
  }, []);

  const playAudio = useCallback(
    async (audioData: ArrayBuffer, _mimeType?: string) => {
      audioQueueRef.current.push(audioData);
      queueEnqueueCountRef.current += 1;
      queueEnqueueByteCountRef.current += audioData.byteLength;

      const now = Date.now();
      if (now - queueLastEnqueueLogMsRef.current >= 500) {
        audioLog('playback.enqueue.stats', {
          chunks: queueEnqueueCountRef.current,
          bytes: queueEnqueueByteCountRef.current,
          queueDepth: audioQueueRef.current.length,
        });
        queueEnqueueCountRef.current = 0;
        queueEnqueueByteCountRef.current = 0;
        queueLastEnqueueLogMsRef.current = now;
      }

      processQueue();
    },
    [processQueue]
  );

  const stopPlayback = useCallback(async () => {
    audioLog('playback.stop.requested', {
      queueDepth: audioQueueRef.current.length,
      hasSound: Boolean(soundRef.current),
    });
    audioQueueRef.current = [];
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsPlaying(false);
    isProcessingRef.current = false;
    audioLog('playback.stop.success');
  }, []);

  return {
    isPlaying,
    playAudio,
    stopPlayback,
  };
}

// WAV Header Construction Helper
function createWavHeader(
  dataLength: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF'); // ChunkID
  view.setUint32(4, 36 + dataLength, true); // ChunkSize
  writeString(8, 'WAVE'); // Format
  writeString(12, 'fmt '); // Subchunk1ID
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample
  writeString(36, 'data'); // Subchunk2ID
  view.setUint32(40, dataLength, true); // Subchunk2Size

  return header;
}
