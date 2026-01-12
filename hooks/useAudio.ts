import { useCallback, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

/**
 * Audio recording hook using expo-av.
 * Records audio in PCM format for streaming to the ADK backend.
 */

export interface UseAudioRecordingReturn {
    isRecording: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    onAudioData: (callback: (data: ArrayBuffer) => void) => void;
}

export function useAudioRecording(): UseAudioRecordingReturn {
    const [isRecording, setIsRecording] = useState(false);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const audioDataCallbackRef = useRef<((data: ArrayBuffer) => void) | null>(null);

    const requestPermissions = useCallback(async () => {
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
            throw new Error('Audio recording permission not granted');
        }

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            playThroughEarpieceAndroid: false,
        });
    }, []);

    const startRecording = useCallback(async () => {
        try {
            await requestPermissions();

            // Create recording with PCM settings
            const { recording } = await Audio.Recording.createAsync({
                isMeteringEnabled: true,
                android: {
                    extension: '.wav',
                    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
                    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    bitRate: 256000,
                },
                ios: {
                    extension: '.wav',
                    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
                    audioQuality: Audio.IOSAudioQuality.HIGH,
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    bitRate: 256000,
                    linearPCMBitDepth: 16,
                    linearPCMIsBigEndian: false,
                    linearPCMIsFloat: false,
                },
                web: {
                    mimeType: 'audio/webm',
                    bitsPerSecond: 128000,
                },
            });

            recordingRef.current = recording;
            setIsRecording(true);
            console.log('Recording started');
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }, [requestPermissions]);

    const stopRecording = useCallback(async () => {
        if (!recordingRef.current) {
            return;
        }

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            console.log('Recording stopped, URI:', uri);

            if (uri && audioDataCallbackRef.current) {
                // Read the recorded file and send to callback
                const response = await fetch(uri);
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                audioDataCallbackRef.current(arrayBuffer);
            }

            recordingRef.current = null;
            setIsRecording(false);
        } catch (error) {
            console.error('Failed to stop recording:', error);
            recordingRef.current = null;
            setIsRecording(false);
            throw error;
        }
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

/**
 * Audio playback hook using expo-av.
 * Plays audio chunks received from the ADK backend.
 */

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

    const setupAudioMode = useCallback(async () => {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            playThroughEarpieceAndroid: false,
        });
    }, []);

    const processQueue = useCallback(async () => {
        if (isProcessingRef.current || audioQueueRef.current.length === 0) {
            return;
        }

        isProcessingRef.current = true;
        setIsPlaying(true);

        while (audioQueueRef.current.length > 0) {
            const audioData = audioQueueRef.current.shift();
            if (!audioData) continue;

            try {
                await setupAudioMode();

                // Convert ArrayBuffer to base64 data URI
                const uint8Array = new Uint8Array(audioData);
                let binary = '';
                for (let i = 0; i < uint8Array.length; i++) {
                    binary += String.fromCharCode(uint8Array[i]);
                }
                const base64 = btoa(binary);
                const dataUri = `data:audio/wav;base64,${base64}`;

                // Create and play sound
                const { sound } = await Audio.Sound.createAsync(
                    { uri: dataUri },
                    { shouldPlay: true }
                );
                soundRef.current = sound;

                // Wait for playback to finish
                await new Promise<void>((resolve) => {
                    sound.setOnPlaybackStatusUpdate((status) => {
                        if (status.isLoaded && status.didJustFinish) {
                            resolve();
                        }
                    });
                });

                await sound.unloadAsync();
                soundRef.current = null;
            } catch (error) {
                console.error('Failed to play audio:', error);
            }
        }

        isProcessingRef.current = false;
        setIsPlaying(false);
    }, [setupAudioMode]);

    const playAudio = useCallback(
        async (audioData: ArrayBuffer, _mimeType?: string) => {
            audioQueueRef.current.push(audioData);
            processQueue();
        },
        [processQueue]
    );

    const stopPlayback = useCallback(async () => {
        audioQueueRef.current = [];
        if (soundRef.current) {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
            soundRef.current = null;
        }
        setIsPlaying(false);
        isProcessingRef.current = false;
    }, []);

    return {
        isPlaying,
        playAudio,
        stopPlayback,
    };
}
