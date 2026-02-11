import { useCallback, useRef } from 'react';
import { useAudioStream } from 'expo-realtime-audio';
import type { AudioChunkEvent } from 'expo-realtime-audio';

// ==================================================
// RECORDING HOOK - expo-realtime-audio
// ==================================================

export interface UseAudioRecordingReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  onAudioData: (callback: (data: ArrayBuffer) => void) => () => void;
}

export function useAudioRecording(): UseAudioRecordingReturn {
  const audioDataCallbackRef = useRef<((data: ArrayBuffer) => void) | null>(
    null
  );
  const isStartInFlightRef = useRef(false);
  const isStopInFlightRef = useRef(false);

  const {
    isRecording,
    startRecording: streamStartRecording,
    stopRecording: streamStopRecording,
    requestPermissions,
  } = useAudioStream({
    onError: (error) => {
      console.error('[AUDIO] Recording error:', error);
    },
  });

  const startRecording = useCallback(async () => {
    if (isRecording || isStartInFlightRef.current) {
      return;
    }

    isStartInFlightRef.current = true;

    try {
      // Request permissions
      const permissionResult = await requestPermissions();
      if (!permissionResult.granted) {
        throw new Error('Microphone permission not granted');
      }

      // Start recording with expo-realtime-audio
      await streamStartRecording(
        {
          sampleRate: 16000,
          channels: 1,
          intervalMs: 50, // Send chunks every 50ms
          bufferSize: 1024,
          audioSession: {
            defaultToSpeaker: true, // ✅ THE FIX - Force loudspeaker routing
            allowBluetooth: true,
            mixWithOthers: false,
          },
        },
        (event: AudioChunkEvent) => {
          // event.data is base64 encoded PCM data
          if (audioDataCallbackRef.current) {
            try {
              // Decode base64 to ArrayBuffer
              const binaryString = atob(event.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              // Pass to callback
              audioDataCallbackRef.current(bytes.buffer);
            } catch (error) {
              console.error('[AUDIO] Failed to decode audio chunk:', error);
            }
          }
        }
      );

      console.log(
        '[AUDIO] ✅ Recording started with expo-realtime-audio (16kHz, speaker routing enabled)'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('already in progress')) {
        console.log('[AUDIO] Recording already in progress, skipping start');
        return;
      }
      console.error('[AUDIO] Failed to start recording:', error);
      throw error;
    } finally {
      isStartInFlightRef.current = false;
    }
  }, [isRecording, streamStartRecording, requestPermissions]);

  const stopRecording = useCallback(async () => {
    if (
      (!isRecording && !isStartInFlightRef.current) ||
      isStopInFlightRef.current
    ) {
      return;
    }

    isStopInFlightRef.current = true;

    try {
      await streamStopRecording();
      console.log('[AUDIO] Recording stopped');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.toLowerCase().includes('not recording') ||
        errorMessage.toLowerCase().includes('not in progress')
      ) {
        return;
      }
      console.error('[AUDIO] Failed to stop recording:', error);
    } finally {
      isStopInFlightRef.current = false;
    }
  }, [isRecording, streamStopRecording]);

  const onAudioData = useCallback((callback: (data: ArrayBuffer) => void) => {
    audioDataCallbackRef.current = callback;
    return () => {
      if (audioDataCallbackRef.current === callback) {
        audioDataCallbackRef.current = null;
      }
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    onAudioData,
  };
}

// ==================================================
// PLAYBACK HOOK - expo-realtime-audio
// ==================================================

export interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  playAudio: (
    audioData: ArrayBuffer | string,
    mimeType?: string
  ) => Promise<void>;
  endPlayback: () => Promise<void>;
  stopPlayback: () => Promise<void>;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const playbackInitializedRef = useRef(false);
  const playbackInitPromiseRef = useRef<Promise<void> | null>(null);
  const playbackSampleRateRef = useRef(24000);
  const playbackQueueRef = useRef<string[]>([]);
  const isDrainingPlaybackRef = useRef(false);
  const playbackDrainGenerationRef = useRef(0);

  const {
    isPlaying,
    startPlayback: streamStartPlayback,
    endPlayback: streamEndPlayback,
    stopPlayback: streamStopPlayback,
    playChunk: streamPlayChunk,
  } = useAudioStream({
    onError: (error) => {
      console.error('[AUDIO] Playback error:', error);
    },
  });

  const initializePlayback = useCallback(
    async (sampleRate: number) => {
      if (playbackInitializedRef.current) {
        return;
      }

      if (playbackInitPromiseRef.current) {
        await playbackInitPromiseRef.current;
        return;
      }

      playbackInitPromiseRef.current = (async () => {
        try {
          await streamStartPlayback(
            {
              sampleRate,
              channels: 1,
            },
            () => {
              playbackInitializedRef.current = false;
              playbackSampleRateRef.current = 24000;
            }
          );

          playbackInitializedRef.current = true;
          playbackSampleRateRef.current = sampleRate;
          console.log(
            `[AUDIO] ✅ Playback initialized (${sampleRate}Hz, speaker routing)`
          );
        } catch (error) {
          console.error('[AUDIO] Failed to initialize playback:', error);
          throw error;
        } finally {
          playbackInitPromiseRef.current = null;
        }
      })();

      await playbackInitPromiseRef.current;
    },
    [streamStartPlayback]
  );

  const parseSampleRateFromMime = useCallback((mimeType?: string) => {
    if (!mimeType) {
      return null;
    }
    const match = mimeType.match(/rate=(\d+)/i);
    if (!match) {
      return null;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, []);

  const arrayBufferToBase64 = useCallback((audioData: ArrayBuffer) => {
    const bytes = new Uint8Array(audioData);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, []);

  const playAudio = useCallback(
    async (audioData: ArrayBuffer | string, mimeType?: string) => {
      try {
        const detectedRate = parseSampleRateFromMime(mimeType);
        const targetRate =
          detectedRate || playbackSampleRateRef.current || 24000;

        // Re-init playback if stream sample rate changes between turns.
        if (
          playbackInitializedRef.current &&
          playbackSampleRateRef.current !== targetRate
        ) {
          await streamStopPlayback();
          playbackInitializedRef.current = false;
        }

        if (!playbackInitializedRef.current) {
          await initializePlayback(targetRate);
        }

        const base64Data =
          typeof audioData === 'string'
            ? audioData
            : arrayBufferToBase64(audioData);
        playbackQueueRef.current.push(base64Data);

        if (isDrainingPlaybackRef.current) {
          return;
        }
        isDrainingPlaybackRef.current = true;
        const drainGeneration = playbackDrainGenerationRef.current;
        try {
          while (
            playbackQueueRef.current.length > 0 &&
            playbackDrainGenerationRef.current === drainGeneration
          ) {
            const chunk = playbackQueueRef.current.shift();
            if (!chunk) {
              continue;
            }
            await streamPlayChunk(chunk);
          }
        } finally {
          if (playbackDrainGenerationRef.current === drainGeneration) {
            isDrainingPlaybackRef.current = false;
          }
        }
      } catch (error) {
        console.error('[AUDIO] Failed to play audio:', error);
      }
    },
    [
      arrayBufferToBase64,
      initializePlayback,
      parseSampleRateFromMime,
      streamPlayChunk,
      streamStopPlayback,
    ]
  );

  const endPlayback = useCallback(async () => {
    if (playbackInitializedRef.current) {
      try {
        await streamEndPlayback();
      } catch (error) {
        console.error('[AUDIO] Failed to end playback:', error);
      }
    }
  }, [streamEndPlayback]);

  const stopPlayback = useCallback(async () => {
    try {
      playbackDrainGenerationRef.current += 1;
      playbackQueueRef.current = [];
      isDrainingPlaybackRef.current = false;
      await streamStopPlayback();
      playbackInitializedRef.current = false;
      playbackSampleRateRef.current = 24000;
      console.log('[AUDIO] Playback stopped');
    } catch (error) {
      console.error('[AUDIO] Failed to stop playback:', error);
    }
  }, [streamStopPlayback]);

  return {
    isPlaying,
    playAudio,
    endPlayback,
    stopPlayback,
  };
}
