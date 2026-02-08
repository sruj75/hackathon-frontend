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
  onAudioData: (callback: (data: ArrayBuffer) => void) => void;
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
  playAudio: (audioData: ArrayBuffer, mimeType?: string) => Promise<void>;
  stopPlayback: () => Promise<void>;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const playbackInitializedRef = useRef(false);
  const playbackInitPromiseRef = useRef<Promise<void> | null>(null);

  const {
    isPlaying,
    startPlayback: streamStartPlayback,
    stopPlayback: streamStopPlayback,
    playChunk: streamPlayChunk,
  } = useAudioStream({
    onError: (error) => {
      console.error('[AUDIO] Playback error:', error);
    },
  });

  const initializePlayback = useCallback(async () => {
    if (playbackInitializedRef.current) {
      return;
    }

    if (playbackInitPromiseRef.current) {
      await playbackInitPromiseRef.current;
      return;
    }

    playbackInitPromiseRef.current = (async () => {
      try {
        await streamStartPlayback({
          sampleRate: 24000, // Gemini sends 24kHz audio
          channels: 1,
        });

        playbackInitializedRef.current = true;
        console.log('[AUDIO] ✅ Playback initialized (24kHz, speaker routing)');
      } catch (error) {
        console.error('[AUDIO] Failed to initialize playback:', error);
        throw error;
      } finally {
        playbackInitPromiseRef.current = null;
      }
    })();

    await playbackInitPromiseRef.current;
  }, [streamStartPlayback]);

  const playAudio = useCallback(
    async (audioData: ArrayBuffer, _mimeType?: string) => {
      try {
        // Initialize playback on first call
        if (!playbackInitializedRef.current) {
          await initializePlayback();
        }

        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(audioData);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        // Queue and play the chunk
        await streamPlayChunk(base64Data);
      } catch (error) {
        console.error('[AUDIO] Failed to play audio:', error);
      }
    },
    [initializePlayback, streamPlayChunk]
  );

  const stopPlayback = useCallback(async () => {
    try {
      await streamStopPlayback();
      playbackInitializedRef.current = false;
      console.log('[AUDIO] Playback stopped');
    } catch (error) {
      console.error('[AUDIO] Failed to stop playback:', error);
    }
  }, [streamStopPlayback]);

  return {
    isPlaying,
    playAudio,
    stopPlayback,
  };
}
