/**
 * AudioPlayer - Handles playing Base64 PCM audio chunks from Gemini Live API
 * 
 * Strategy: Accumulate Base64 PCM chunks, convert to WAV, write to temp file, play with expo-av
 */

import { Audio } from 'expo-av';
import { cacheDirectory, writeAsStringAsync, deleteAsync, EncodingType } from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

// Audio format from Gemini Live API: 16-bit PCM, 24kHz, mono
const SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

export class AudioPlayer {
    private audioQueue: string[] = [];
    private isPlaying = false;
    private currentSound: Audio.Sound | null = null;
    private onLog?: (msg: string) => void;

    constructor(onLog?: (msg: string) => void) {
        this.onLog = onLog;
    }

    private log(msg: string) {
        this.onLog?.(`[AudioPlayer] ${msg}`);
    }

    /**
     * Add a Base64 PCM chunk to the playback queue
     */
    async addChunk(base64PcmData: string) {
        this.audioQueue.push(base64PcmData);
        this.log(`Queued chunk (${base64PcmData.length} chars), queue size: ${this.audioQueue.length}`);

        // Start playback if not already playing
        if (!this.isPlaying) {
            this.processQueue();
        }
    }

    /**
     * Process the audio queue - combines chunks and plays them
     */
    private async processQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;

        try {
            // Take all current chunks and combine them
            const chunks = this.audioQueue.splice(0, this.audioQueue.length);
            const combinedBase64 = chunks.join('');

            // Convert Base64 PCM to WAV file
            const wavBase64 = this.pcmToWav(combinedBase64);

            // Write to temp file
            const tempUri = `${cacheDirectory}gemini_audio_${Date.now()}.wav`;
            await writeAsStringAsync(tempUri, wavBase64, {
                encoding: EncodingType.Base64,
            });

            this.log(`Playing audio (${chunks.length} chunks combined)`);

            // Configure audio mode
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true, // Enable recording while playing
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });

            // Create and play sound
            const { sound } = await Audio.Sound.createAsync(
                { uri: tempUri },
                { shouldPlay: true }
            );
            this.currentSound = sound;

            // Wait for playback to complete
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    this.cleanupSound(sound, tempUri);
                    // Process next batch if any
                    this.processQueue();
                }
            });

        } catch (error) {
            this.log(`Playback error: ${error}`);
            this.isPlaying = false;
            this.processQueue(); // Try next batch
        }
    }

    /**
     * Convert raw PCM data to WAV format with proper headers
     */
    private pcmToWav(base64Pcm: string): string {
        const pcmBuffer = Buffer.from(base64Pcm, 'base64');
        const pcmLength = pcmBuffer.length;

        // WAV header is 44 bytes
        const wavBuffer = Buffer.alloc(44 + pcmLength);

        // RIFF header
        wavBuffer.write('RIFF', 0);
        wavBuffer.writeUInt32LE(36 + pcmLength, 4); // File size - 8
        wavBuffer.write('WAVE', 8);

        // fmt chunk
        wavBuffer.write('fmt ', 12);
        wavBuffer.writeUInt32LE(16, 16); // Chunk size
        wavBuffer.writeUInt16LE(1, 20); // Audio format (1 = PCM)
        wavBuffer.writeUInt16LE(NUM_CHANNELS, 22);
        wavBuffer.writeUInt32LE(SAMPLE_RATE, 24);
        wavBuffer.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 28); // Byte rate
        wavBuffer.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 32); // Block align
        wavBuffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

        // data chunk
        wavBuffer.write('data', 36);
        wavBuffer.writeUInt32LE(pcmLength, 40);
        pcmBuffer.copy(wavBuffer, 44);

        return wavBuffer.toString('base64');
    }

    private async cleanupSound(sound: Audio.Sound, tempUri: string) {
        try {
            await sound.unloadAsync();
            await deleteAsync(tempUri, { idempotent: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    /**
     * Stop playback and clear queue
     */
    async stop() {
        this.audioQueue = [];
        if (this.currentSound) {
            try {
                await this.currentSound.stopAsync();
                await this.currentSound.unloadAsync();
            } catch (e) {
                // Ignore
            }
            this.currentSound = null;
        }
        this.isPlaying = false;
        this.log('Stopped');
    }
}

export default AudioPlayer;
