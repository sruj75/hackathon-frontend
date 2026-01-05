/**
 * AudioRecorder - Handles recording audio from microphone and converting to Base64 PCM
 * 
 * Strategy: Record short clips (500ms), read as Base64, send to Gemini, delete temp file
 * The Gemini Live API expects: 16-bit PCM, 16kHz, mono (little-endian)
 */

import { Audio } from 'expo-av';
import { readAsStringAsync, deleteAsync, EncodingType } from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

// Gemini Live API input format: 16-bit PCM, 16kHz, mono
const SAMPLE_RATE = 16000;
const RECORDING_INTERVAL_MS = 500; // Send chunks every 500ms

export class AudioRecorder {
    private recording: Audio.Recording | null = null;
    private isRecording = false;
    private recordingInterval: NodeJS.Timeout | null = null;
    private onAudioChunk?: (base64Pcm: string) => void;
    private onLog?: (msg: string) => void;

    constructor(
        onAudioChunk: (base64Pcm: string) => void,
        onLog?: (msg: string) => void
    ) {
        this.onAudioChunk = onAudioChunk;
        this.onLog = onLog;
    }

    private log(msg: string) {
        this.onLog?.(`[AudioRecorder] ${msg}`);
    }

    /**
     * Request microphone permissions
     */
    async requestPermissions(): Promise<boolean> {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                this.log('Microphone permission denied');
                return false;
            }
            this.log('Microphone permission granted');
            return true;
        } catch (error) {
            this.log(`Permission error: ${error}`);
            return false;
        }
    }

    /**
     * Start recording audio in chunks
     */
    private _isStarting = false;

    /**
     * Start recording audio in chunks
     */
    async start(): Promise<boolean> {
        if (this.isRecording || this._isStarting) {
            this.log('Already recording or starting');
            return false;
        }

        this._isStarting = true;

        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
            this._isStarting = false;
            return false;
        }

        try {
            // Configure audio mode for recording
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });

            this.isRecording = true;
            this._isStarting = false;
            this.log('Starting recording loop');

            // Start the recording loop
            this.recordChunk();

            return true;
        } catch (error) {
            this.log(`Start error: ${error}`);
            this.isRecording = false;
            this._isStarting = false;
            return false;
        }
    }

    /**
     * Record a single chunk and schedule the next one
     */
    private async recordChunk() {
        if (!this.isRecording) return;

        try {
            // Create a new recording with PCM settings
            const recording = new Audio.Recording();

            await recording.prepareToRecordAsync({
                android: {
                    extension: '.wav',
                    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
                    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
                    sampleRate: SAMPLE_RATE,
                    numberOfChannels: 1,
                    bitRate: SAMPLE_RATE * 16,
                },
                ios: {
                    extension: '.wav',
                    audioQuality: Audio.IOSAudioQuality.HIGH,
                    sampleRate: SAMPLE_RATE,
                    numberOfChannels: 1,
                    bitRate: SAMPLE_RATE * 16,
                    linearPCMBitDepth: 16,
                    linearPCMIsBigEndian: false,
                    linearPCMIsFloat: false,
                },
                web: {
                    mimeType: 'audio/wav',
                    bitsPerSecond: SAMPLE_RATE * 16,
                },
            });

            await recording.startAsync();
            this.recording = recording;

            // Record for the interval duration
            this.recordingInterval = setTimeout(async () => {
                if (!this.isRecording) return;

                try {
                    // Stop and unload specifically
                    // Removed _canRecord check as it might be unreliable for unloading
                    try {
                        await recording.stopAndUnloadAsync();
                    } catch (unloadError) {
                        // Ignore if already unloaded or stopped, but ensure we tried
                    }

                    const uri = recording.getURI();

                    if (uri) {
                        // Read the file and extract PCM data
                        const base64Pcm = await this.extractPcmFromWav(uri);

                        if (base64Pcm && this.onAudioChunk) {
                            // this.log(`Sending chunk (${base64Pcm.length} chars)`); // Reduce log noise
                            this.onAudioChunk(base64Pcm);
                        }

                        // Clean up temp file
                        await deleteAsync(uri, { idempotent: true });
                    }
                } catch (e) {
                    this.log(`Chunk processing error: ${e}`);
                }

                this.recording = null;

                // Add a small safety delay to let native layer cleanup
                // This prevents "Only one recording object can be prepared" errors
                setTimeout(() => {
                    this.recordChunk();
                }, 50);

            }, RECORDING_INTERVAL_MS);

        } catch (error) {
            this.log(`Recording error: ${error}`);
            // Retry after a short delay
            setTimeout(() => this.recordChunk(), 200);
        }
    }

    /**
     * Extract raw PCM data from WAV file (skip the 44-byte header)
     */
    private async extractPcmFromWav(uri: string): Promise<string | null> {
        try {
            const base64Wav = await readAsStringAsync(uri, {
                encoding: EncodingType.Base64,
            });

            // Decode the WAV file
            const wavBuffer = Buffer.from(base64Wav, 'base64');

            // WAV header is typically 44 bytes, but let's be safe and find the data chunk
            const dataChunkIndex = wavBuffer.indexOf('data');
            if (dataChunkIndex === -1) {
                // Just skip first 44 bytes as fallback
                const pcmBuffer = wavBuffer.slice(44);
                return pcmBuffer.toString('base64');
            }

            // Skip 'data' (4 bytes) + size (4 bytes) = 8 bytes after 'data'
            const pcmStart = dataChunkIndex + 8;
            const pcmBuffer = wavBuffer.slice(pcmStart);

            return pcmBuffer.toString('base64');
        } catch (error) {
            this.log(`PCM extraction error: ${error}`);
            return null;
        }
    }

    /**
     * Stop recording
     */
    async stop() {
        this.isRecording = false;

        if (this.recordingInterval) {
            clearTimeout(this.recordingInterval);
            this.recordingInterval = null;
        }

        if (this.recording) {
            try {
                await this.recording.stopAndUnloadAsync();
                const uri = this.recording.getURI();
                if (uri) {
                    await deleteAsync(uri, { idempotent: true });
                }
            } catch (e) {
                // Ignore cleanup errors
            }
            this.recording = null;
        }

        // Reset audio mode
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
        });

        this.log('Stopped');
    }
}

export default AudioRecorder;
