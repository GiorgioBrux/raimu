import { uiLogger as log } from '../../../utils/logger.js';

/**
 * Manages TTS audio playback
 */
export class TTSManager {
    constructor(websocket) {
        this.websocket = websocket;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100  // Match the model's sample rate
        });
        this.audioQueue = [];
        this.isPlaying = false;
        this.onSpeakingStateChange = null;
        this.onQueueStateChange = null; // Callback for queue state changes
        this.currentlyPlayingId = null;
    }

    /**
     * Handles incoming TTS audio
     */
    async handleTTSAudio(base64Audio, userId, messageId) {
        // Add to queue and process
        this.audioQueue.push({ base64Audio, userId, messageId });
        
        log.debug({
            messageId,
            queueLength: this.audioQueue.length,
            isPlaying: this.isPlaying,
            currentlyPlaying: this.currentlyPlayingId
        }, 'Added message to TTS queue');
        
        // Notify about queue state change
        this._notifyQueueStateChange();
        
        if (!this.isPlaying) {
            await this.processAudioQueue();
        }
    }

    /**
     * Gets the current state of a message (queued, playing, or completed)
     */
    getMessageState(messageId) {
        if (this.currentlyPlayingId === messageId) {
            return 'playing';
        }
        if (this.audioQueue.some(item => item.messageId === messageId)) {
            return 'queued';
        }
        return 'completed';
    }

    /**
     * Notifies listeners about queue state changes
     */
    _notifyQueueStateChange() {
        if (this.onQueueStateChange) {
            const state = {
                currentlyPlaying: this.currentlyPlayingId,
                queued: this.audioQueue.map(item => item.messageId)
            };
            
            log.debug({
                currentlyPlaying: state.currentlyPlaying,
                queuedMessages: state.queued,
                queueLength: state.queued.length
            }, 'TTS queue state changed');
            
            this.onQueueStateChange(state);
        }
    }

    /**
     * Processes the audio queue
     */
    async processAudioQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            this.currentlyPlayingId = null;
            log.debug('TTS queue empty, stopping playback');
            this._notifyQueueStateChange();
            return;
        }

        this.isPlaying = true;
        const { base64Audio, userId, messageId } = this.audioQueue.shift();
        this.currentlyPlayingId = messageId;
        
        log.debug({
            messageId,
            userId,
            remainingInQueue: this.audioQueue.length
        }, 'Starting TTS playback for message');
        
        this._notifyQueueStateChange();

        try {
            // Decode base64 audio
            const audioData = atob(base64Audio);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const view = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioData.length; i++) {
                view[i] = audioData.charCodeAt(i);
            }

            // Decode audio data with proper error handling
            let audioBuffer;
            try {
                audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                console.log('Audio buffer decoded:', {
                    duration: audioBuffer.duration,
                    numberOfChannels: audioBuffer.numberOfChannels,
                    sampleRate: audioBuffer.sampleRate,
                    length: audioBuffer.length
                });
            } catch (decodeError) {
                console.error('Error decoding audio:', decodeError);
                throw decodeError;
            }

            // Notify that user started speaking
            if (this.onSpeakingStateChange) {
                this.onSpeakingStateChange(userId, true);
            }

            // Create and configure source
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            
            // Connect directly to destination without additional processing
            source.connect(this.audioContext.destination);
            
            // When audio finishes
            source.onended = async () => {
                // Notify that user stopped speaking
                if (this.onSpeakingStateChange) {
                    this.onSpeakingStateChange(userId, false);
                }
                
                this.currentlyPlayingId = null;
                this._notifyQueueStateChange();
                
                // Process next in queue
                await this.processAudioQueue();
            };

            source.start();
        } catch (error) {
            console.error('Error playing TTS audio:', error);
            // Process next in queue even if there was an error
            this.currentlyPlayingId = null;
            this._notifyQueueStateChange();
            await this.processAudioQueue();
        }
    }
} 