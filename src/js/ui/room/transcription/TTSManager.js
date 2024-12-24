import { uiLogger as log } from '../../../utils/logger.js';

/**
 * Manages TTS audio playback
 */
export class TTSManager {
    constructor(websocket) {
        this.websocket = websocket;
        this.audioContext = new AudioContext();
        this.audioQueue = [];
        this.isPlaying = false;
        this.onSpeakingStateChange = null;
    }

    /**
     * Handles incoming TTS audio
     */
    async handleTTSAudio(base64Audio, userId) {
        // Add to queue and process
        this.audioQueue.push({ base64Audio, userId });
        if (!this.isPlaying) {
            await this.processAudioQueue();
        }
    }

    /**
     * Processes the audio queue
     */
    async processAudioQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const { base64Audio, userId } = this.audioQueue.shift();

        try {
            // Decode base64 audio
            const audioData = atob(base64Audio);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const view = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioData.length; i++) {
                view[i] = audioData.charCodeAt(i);
            }

            // Decode audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Notify that user started speaking
            if (this.onSpeakingStateChange) {
                this.onSpeakingStateChange(userId, true);
            }

            // Play the audio
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            // When audio finishes
            source.onended = async () => {
                // Notify that user stopped speaking
                if (this.onSpeakingStateChange) {
                    this.onSpeakingStateChange(userId, false);
                }
                // Process next in queue
                await this.processAudioQueue();
            };

            source.start();
        } catch (error) {
            console.error('Error playing TTS audio:', error);
            // Process next in queue even if there was an error
            await this.processAudioQueue();
        }
    }
} 