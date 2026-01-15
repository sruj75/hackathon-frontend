import { useCallback, useRef, useState, useEffect } from 'react';
import LiveAudioStream from 'react-native-live-audio-stream';
import { Audio, InterruptionModeIOS } from 'expo-av';

export interface UseAudioRecordingReturn {
    isRecording: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    onAudioData: (callback: (data: ArrayBuffer) => void) => void;
}

export function useAudioRecording(): UseAudioRecordingReturn {
    const [isRecording, setIsRecording] = useState(false);
    const audioDataCallbackRef = useRef<((data: ArrayBuffer) => void) | null>(null);

    useEffect(() => {
        // Initialize the audio stream
        LiveAudioStream.init({
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            audioSource: 6, // VOICE_RECOGNITION on Android
            bufferSize: 4096,
            wavFile: 'audio.wav', // Required prop, but we use the stream
        });

        LiveAudioStream.on('data', (data: string) => {
            if (audioDataCallbackRef.current) {
                // data is base64 encoded PCM 16-bit
                const binaryString = atob(data);

                // Simple audio level monitoring (log occasionally to reduce spam)
                if (Math.random() < 0.05) { // Log 5% of chunks
                    let audioLevel = 0;
                    for (let i = 0; i < Math.min(50, binaryString.length); i++) {
                        audioLevel = Math.max(audioLevel, Math.abs(binaryString.charCodeAt(i) - 128));
                    }
                    console.log(`🎤 ${binaryString.length}B | Level: ${audioLevel}`);
                }

                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                audioDataCallbackRef.current(bytes.buffer);
            }
        });

        return () => {
            LiveAudioStream.stop();
        };
    }, []);

    const startRecording = useCallback(async () => {
        try {
            // Check permissions using expo-av (since LiveAudioStream doesn't expose permission check)
            // Or just trust the app has them from usage description
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                throw new Error('Microphone permission not granted');
            }

            LiveAudioStream.start();

            setIsRecording(true);
            console.log('Real-time audio streaming started (react-native-live-audio-stream)');
        } catch (error) {
            console.error('Failed to start recording:', error);
            setIsRecording(false);
            throw error;
        }
    }, []);

    const stopRecording = useCallback(async () => {
        try {
            LiveAudioStream.stop();
            console.log('Recording stopped');
        } catch (error) {
            console.error('Failed to stop recording:', error);
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
    // Re-enabling playback logic delicately
    const [isPlaying, setIsPlaying] = useState(false);
    const soundRef = useRef<Audio.Sound | null>(null);
    const audioQueueRef = useRef<ArrayBuffer[]>([]);
    const isProcessingRef = useRef(false);

    const setupAudioMode = useCallback(async () => {
        try {
            // Configure audio mode ONCE for simultaneous recording and playback
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true, // critical: don't kill the mic
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });
        } catch (error) {
            console.error('Failed to set audio mode:', error);
        }
    }, []);

    useEffect(() => {
        setupAudioMode();
    }, [setupAudioMode]);

    const processQueue = useCallback(async () => {
        if (isProcessingRef.current) {
            return;
        }

        isProcessingRef.current = true;
        setIsPlaying(true);

        while (audioQueueRef.current.length > 0) {
            // Batching Strategy: Take ALL currently available chunks
            // This prevents creating a tiny sound for every 4KB (85ms) chunk
            const chunksToPlay = [...audioQueueRef.current];
            audioQueueRef.current = [];

            if (chunksToPlay.length === 0) continue;

            const totalSize = chunksToPlay.reduce((acc, chunk) => acc + chunk.byteLength, 0);

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

                // Create and play sound
                const { sound } = await Audio.Sound.createAsync(
                    { uri: dataUri },
                    { shouldPlay: true }
                );
                soundRef.current = sound;

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
    }, []);

    const playAudio = useCallback(async (audioData: ArrayBuffer, _mimeType?: string) => {
        audioQueueRef.current.push(audioData);
        processQueue();
    }, [processQueue]);

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

// WAV Header Construction Helper
function createWavHeader(dataLength: number, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array {
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
