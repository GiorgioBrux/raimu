import { uiLogger as log } from '../../../utils/logger.js';

/**
 * Manages Text-to-Speech functionality
 */
export class TTSManager {
    constructor(websocket, currentStream = null, webrtc = null) {
        this.websocket = websocket;
        this.currentStream = currentStream;
        this.webrtc = webrtc;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.originalStream = null;
        this.audioQueue = [];
        this.isProcessingQueue = false;
    }

    /**
     * Process the audio queue
     * @private
     */
    async processAudioQueue() {
        if (this.isProcessingQueue || this.audioQueue.length === 0) {
            log.debug({
                isProcessing: this.isProcessingQueue,
                queueLength: this.audioQueue.length
            }, 'Queue processing skipped');
            return;
        }

        this.isProcessingQueue = true;
        let currentSource = null;
        log.debug({ queueLength: this.audioQueue.length }, 'Starting queue processing');

        try {
            while (this.audioQueue.length > 0) {
                const { audioData, videoTrack } = this.audioQueue[0];
                log.debug({ 
                    remainingInQueue: this.audioQueue.length,
                    audioDuration: audioData.duration,
                    hasVideoTrack: !!videoTrack
                }, 'Processing next audio in queue');
                
                const newStream = new MediaStream();
                if (videoTrack) {
                    newStream.addTrack(videoTrack);
                }

                // Add TTS audio track
                currentSource = this.audioContext.createBufferSource();
                currentSource.buffer = audioData;
                const streamDest = this.audioContext.createMediaStreamDestination();
                currentSource.connect(streamDest);
                newStream.addTrack(streamDest.stream.getAudioTracks()[0]);

                // Update WebRTC stream
                log.debug('Updating WebRTC stream with new audio');
                await this.webrtc.updateLocalStream(newStream);

                // Wait for this audio to finish before processing next
                await new Promise((resolve) => {
                    const handleEnded = async () => {
                        log.debug('Audio clip finished playing');
                        currentSource.removeEventListener('ended', handleEnded);
                        // Add a small delay between clips
                        log.debug('Adding delay between clips');
                        await new Promise(r => setTimeout(r, 300));
                        resolve();
                    };
                    currentSource.addEventListener('ended', handleEnded);
                    log.debug('Starting audio playback');
                    currentSource.start();
                });

                // Remove the processed audio after it's done playing
                log.debug('Removing processed audio from queue');
                this.audioQueue.shift();
            }
        } catch (error) {
            console.error('Error processing audio queue:', error);
            log.error({ error }, 'Error in audio queue processing');
            // If there's an error, clear the queue to prevent getting stuck
            this.audioQueue = [];
            if (currentSource) {
                try {
                    currentSource.stop();
                    log.debug('Stopped current audio source after error');
                } catch (e) {
                    // Ignore stop errors
                    log.warn({ error: e }, 'Error stopping audio source');
                }
            }
        } finally {
            this.isProcessingQueue = false;
            log.debug('Queue processing finished');
            
            // If queue is empty, restore silent stream
            if (this.audioQueue.length === 0) {
                await this.restoreSilentStream();
            }
        }
    }

    /**
     * Creates and returns a silent media stream
     * @private
     */
    async createSilentStream() {
        const silentStream = new MediaStream();
        const videoTrack = this.currentStream.getVideoTracks()[0];
        if (videoTrack) silentStream.addTrack(videoTrack);
        
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        oscillator.frequency.value = 0;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain);
        const dest = gain.connect(ctx.createMediaStreamDestination());
        oscillator.start();
        silentStream.addTrack(dest.stream.getAudioTracks()[0]);

        return silentStream;
    }

    /**
     * Restores the silent stream after audio playback
     * @private
     */
    async restoreSilentStream() {
        try {
            log.debug('Restoring silent stream');
            const silentStream = await this.createSilentStream();
            await this.webrtc.updateLocalStream(silentStream);
            log.debug('Silent stream restored successfully');
        } catch (error) {
            console.error('Error restoring silent stream:', error);
            log.error({ error }, 'Failed to restore silent stream');
        }
    }

    /**
     * Handles incoming TTS audio data
     * @param {string} base64Audio - Base64 encoded audio data
     * @param {boolean} isAudioMuted - Whether audio is currently muted
     */
    async handleTTSAudio(base64Audio, isAudioMuted) {
        if (!this.currentStream || isAudioMuted) {
            log.debug({
                hasCurrentStream: !!this.currentStream,
                isAudioMuted
            }, 'TTS audio handling skipped');
            return;
        }

        try {
            log.debug('Processing new TTS audio');
            const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
            const audioBuffer = await this.audioContext.decodeAudioData(audioData.buffer);
            const videoTrack = this.currentStream.getVideoTracks()[0];

            log.debug({ 
                audioDuration: audioBuffer.duration,
                currentQueueLength: this.audioQueue.length,
                isProcessing: this.isProcessingQueue
            }, 'Adding audio to queue');

            // Add to queue
            this.audioQueue.push({
                audioData: audioBuffer,
                videoTrack: videoTrack
            });

            // Start processing queue if not already processing
            if (!this.isProcessingQueue) {
                log.debug('Starting queue processing');
                await this.processAudioQueue();
            } else {
                log.debug('Queue is already being processed');
            }
        } catch (error) {
            console.error('Error handling TTS audio:', error);
            log.error({ error }, 'Failed to handle TTS audio');
        }
    }

    /**
     * Updates the current stream and WebRTC instance
     */
    setStreams(currentStream, webrtc) {
        this.currentStream = currentStream;
        this.webrtc = webrtc;
    }

    /**
     * Stores the original stream for VAD purposes
     */
    setOriginalStream(stream) {
        this.originalStream = stream;
    }

    /**
     * Cleans up resources
     */
    cleanup() {
        this.audioQueue = [];
        if (this.originalStream) {
            this.originalStream.getTracks().forEach(track => {
                if (track.kind === 'audio') {
                    track.stop();
                }
            });
            this.originalStream = null;
        }
    }
} 