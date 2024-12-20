/**
 * Manages the transcription functionality for a room
 * @class
 */
import { uiLogger as log } from '../../utils/logger.js';
import { ParticipantVideo } from './ParticipantVideo.js';

export class TranscriptionManager {
    /**
     * Creates a new TranscriptionManager instance
     * @param {import('./UIElements.js').UIElements} uiElements - UI elements manager
     * @param {WebSocket} websocket - WebSocket connection for sending transcriptions
     * @param {string} roomId - ID of the current room
     * @param {import('../../services/RoomManager.js').RoomManager} roomManager - Room manager instance
     */
    constructor(uiElements, websocket, roomId, roomManager) {
        const elements = uiElements.getElements();
        this.transcriptionEnabled = elements.transcriptionEnabled;
        this.transcriptionLang = elements.transcriptionLang;
        this.voiceTTSEnabled = elements.voiceTTSEnabled;
        this.transcriptionText = elements.transcriptionText;
        this.uiElements = uiElements;
        this.websocket = websocket;
        this.roomId = roomId;
        this.roomManager = roomManager;
        this.enabled = false;
        this.hasTranscriptions = false;
        this.currentStream = null;
        this.webrtc = null;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.originalStream = null;

        // Audio queue system
        this.audioQueue = [];
        this.isProcessingQueue = false;

        // Initially disable TTS switch
        this.voiceTTSEnabled.disabled = true;
        this.voiceTTSEnabled.checked = false;
        this.voiceTTSEnabled.parentElement?.classList.add('opacity-50', 'cursor-not-allowed');

        log.debug('TranscriptionManager initialized');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.transcriptionEnabled.addEventListener('change', () => {
            this.enabled = this.transcriptionEnabled.checked;
            
            // Handle TTS switch state
            if (this.enabled) {
                // Enable TTS switch whenever transcription is enabled
                this.voiceTTSEnabled.disabled = false;
                this.voiceTTSEnabled.parentElement?.classList.remove('opacity-50', 'cursor-not-allowed');
                log.debug('Enabled TTS switch');
            } else {
                // If transcription is disabled, turn off TTS and disable the switch
                if (this.voiceTTSEnabled.checked) {
                    // Programmatically click to trigger the change event and cleanup
                    this.voiceTTSEnabled.click();
                }
                this.voiceTTSEnabled.disabled = true;
                this.voiceTTSEnabled.parentElement?.classList.add('opacity-50', 'cursor-not-allowed');
                log.debug('Disabled TTS switch');
            }
        });

        this.transcriptionLang.addEventListener('change', () => {
            this.language = this.transcriptionLang.value;
        });

        this.voiceTTSEnabled.addEventListener('change', async () => {
            const enabled = this.voiceTTSEnabled.checked;
            // Store the REAL mute state from WebRTC before we do anything
            const currentMuteState = !this.webrtc?.localStream?.getAudioTracks()[0]?.enabled ?? false;
            log.debug({ enabled, currentMuteState }, 'TTS toggle');
            
            if (this.currentStream && this.webrtc) {
                const roomUI = this.roomManager?.roomUI;
                const vadManager = roomUI?.vadManager;
                const localVideo = this.uiElements.getElements().localVideo;
                const videoElement = localVideo?.querySelector('video');

                // Store current states
                const videoTrack = this.currentStream.getVideoTracks()[0];
                const isVideoEnabled = videoTrack?.enabled ?? false;
                const videoConstraints = videoTrack?.getConstraints() || { width: 1280, height: 720 };

                if (enabled) {
                    // Store a fresh stream for VAD and local display
                    this.originalStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: true, 
                        video: videoConstraints
                    });
                    
                    // Update stream states
                    this._updateStreamStates(this.originalStream, isVideoEnabled, currentMuteState);

                    // Update local video display with original stream
                    if (videoElement) {
                        videoElement.srcObject = this.originalStream;
                    }

                    // Create silent stream for peers
                    const silentStream = new MediaStream();
                    const originalVideoTrack = this.originalStream.getVideoTracks()[0];
                    if (originalVideoTrack) {
                        silentStream.addTrack(originalVideoTrack);
                        originalVideoTrack.enabled = isVideoEnabled;  // Match video state
                    }
                    
                    // Create silent audio track for peers
                    const ctx = new AudioContext();
                    const oscillator = ctx.createOscillator();
                    oscillator.frequency.value = 0;
                    const gain = ctx.createGain();
                    gain.gain.value = 0;
                    oscillator.connect(gain);
                    const dest = gain.connect(ctx.createMediaStreamDestination());
                    oscillator.start();
                    silentStream.addTrack(dest.stream.getAudioTracks()[0]);
                    
                    // Temporarily disable track state change handler
                    const originalHandler = this.webrtc.onTrackStateChange;
                    this.webrtc.onTrackStateChange = null;
                    
                    try {
                        // Update WebRTC (what peers receive)
                        await this.webrtc.updateLocalStream(silentStream);
                        // Ensure the silent stream respects mute state
                        silentStream.getAudioTracks()[0].enabled = !currentMuteState;
                    } finally {
                        this.webrtc.onTrackStateChange = originalHandler;
                    }
                    
                    // Use original stream for VAD
                    this.currentStream = this.originalStream;

                    // Setup VAD with new stream
                    if (vadManager && localVideo) {
                        vadManager.muted.set(localVideo.id, currentMuteState);
                        await this.setupVADWithStream(vadManager, localVideo, this.currentStream);
                    }
                } else {
                    // Clean up original stream
                    if (this.originalStream) {
                        this.originalStream.getTracks().forEach(track => {
                            if (track.kind === 'audio') {
                                track.stop();
                            }
                        });
                        this.originalStream = null;
                    }

                    // Get fresh stream with current settings
                    const newStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: true, 
                        video: videoConstraints
                    });
                    
                    // Update stream states
                    this._updateStreamStates(newStream, isVideoEnabled, currentMuteState);

                    // Update local video element with new stream
                    if (videoElement) {
                        videoElement.srcObject = newStream;
                    }

                    // Temporarily disable track state change handler
                    const originalHandler = this.webrtc.onTrackStateChange;
                    this.webrtc.onTrackStateChange = null;
                    
                    try {
                        await this.webrtc.updateLocalStream(newStream);
                        // Ensure the new stream respects mute state
                        newStream.getAudioTracks()[0].enabled = !currentMuteState;
                    } finally {
                        this.webrtc.onTrackStateChange = originalHandler;
                    }
                    
                    this.currentStream = newStream;

                    // Reinitialize VAD with new stream
                    if (vadManager && localVideo) {
                        vadManager.muted.set(localVideo.id, currentMuteState);
                        await this.setupVADWithStream(vadManager, localVideo, newStream);
                    }
                }
            } else {
                log.warn('No current stream or WebRTC when toggling TTS');
            }
            
            this.websocket.send({
                type: 'TTSStatus',
                enabled
            });
        });
    }

    /**
     * Helper method to setup VAD with a stream
     */
    async setupVADWithStream(vadManager, container, stream) {
        log.debug({
            containerId: container.id,
            streamTracks: stream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                id: t.id,
                readyState: t.readyState
            }))
        }, 'Setting up VAD with stream');

        try {
            // Create a clone of the stream for VAD
            const vadStream = stream.clone();
            
            // Set initial mute state before setting up VAD
            const audioTrack = vadStream.getAudioTracks()[0];
            if (audioTrack) {
                const isMuted = vadManager.muted.get(container.id) ?? false;
                audioTrack.enabled = !isMuted;
                log.debug({ isMuted }, 'Setting initial VAD stream mute state');
            }
            
            // Setup new VAD - the VADManager will handle cleanup of existing instance
            await vadManager.setupVAD(
                vadStream,
                container,
                ParticipantVideo.updateSpeakingIndicators
            );
            
            log.debug({ containerId: container.id }, 'VAD setup completed');
        } catch (error) {
            log.error({ error, containerId: container.id }, 'Failed to setup VAD with stream');
            // Cleanup the cloned stream on error
            try {
                stream.getTracks().forEach(track => track.stop());
            } catch (e) {
                log.warn({ error: e }, 'Error cleaning up stream after VAD setup failure');
            }
        }
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
                try {
                    log.debug('Restoring silent stream');
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

                    await this.webrtc.updateLocalStream(silentStream);
                    log.debug('Silent stream restored successfully');
                } catch (error) {
                    console.error('Error restoring silent stream:', error);
                    log.error({ error }, 'Failed to restore silent stream');
                }
            }
        }
    }

    /**
     * Handles incoming TTS audio data by playing it through the local audio context
     * and updating the WebRTC stream that peers receive
     * @param {string} base64Audio - Base64 encoded audio data to be played
     * @returns {Promise<void>}
     */
    async handleTTSAudio(base64Audio) {
        if (!this.currentStream || 
            !this.voiceTTSEnabled.checked || 
            !this.webrtc ||
            this.isAudioMuted()) {
            log.debug({
                hasCurrentStream: !!this.currentStream,
                ttsEnabled: this.voiceTTSEnabled.checked,
                hasWebRTC: !!this.webrtc,
                isAudioMuted: this.isAudioMuted()
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

    sendAudioForTranscription(base64AudioData, userId) {
        // Only send audio for transcription if enabled and not muted
        if (!this.enabled || this.isAudioMuted()) return;

        this.websocket.send({
            type: 'transcriptionRequest',
            audioData: base64AudioData,
            language: this.language,
            roomId: this.roomId,
            timestamp: new Date().toISOString(),
            userId: userId
        });
    }

    setCurrentStream(stream, webrtc) {
        this.currentStream = stream;
        this.webrtc = webrtc;
        // Register for track state changes
        const originalCallback = webrtc.onTrackStateChange;
        webrtc.onTrackStateChange = (peerId, kind, enabled, roomId) => {
            // Only handle local audio track changes
            if (peerId === webrtc.peer?.id && kind === 'audio') {
                this.handleMuteStateChange(!enabled);
            }
            // Call original callback if it exists
            originalCallback?.(peerId, kind, enabled, roomId);
        };
    }

    addTranscription(text, userId, timestamp) {
        if (!this.hasTranscriptions) {
            const placeholder = this.transcriptionText.querySelector('.opacity-30');
            if (placeholder) {
                placeholder.remove();
            }
            this.hasTranscriptions = true;
        }

        const transcriptionElement = document.createElement('div');
        transcriptionElement.className = 'p-3 bg-slate-800/30 rounded-lg mb-2';

        const headerRow = document.createElement('div');
        headerRow.className = 'flex justify-between items-center mb-1';

        // Get username from room manager based on userId
        let username;
        if (userId === 'local') {
            username = 'You';
        } else {
            const participant = this.roomManager.participants.get(userId);
            username = participant?.name || 'Unknown User';
        }
        
        const nameEl = document.createElement('span');
        nameEl.className = 'text-xs text-slate-500';
        nameEl.textContent = username;

        const timeEl = document.createElement('span');
        timeEl.className = 'text-xs text-slate-500';
        const time = new Date(timestamp);
        timeEl.textContent = time.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        headerRow.appendChild(nameEl);
        headerRow.appendChild(timeEl);

        const transcriptionText = document.createElement('p');
        transcriptionText.className = 'text-sm text-slate-300';
        transcriptionText.textContent = text;

        transcriptionElement.appendChild(headerRow);
        transcriptionElement.appendChild(transcriptionText);
        this.transcriptionText.appendChild(transcriptionElement);
        this.transcriptionText.scrollTop = this.transcriptionText.scrollHeight;
    }

    isEnabled() {
        return this.enabled;
    }

    // handle mute state changes
    handleMuteStateChange(isMuted) {
        const roomUI = this.roomManager?.roomUI;
        const vadManager = roomUI?.vadManager;
        const localVideo = this.uiElements.getElements().localVideo;

        if (vadManager && localVideo) {
            // Update VAD's mute state
            vadManager.muted.set(localVideo.id, isMuted);

            // Update the current stream being used for VAD
            const stream = this.voiceTTSEnabled.checked ? this.originalStream : this.currentStream;
            if (stream) {
                const audioTrack = stream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !isMuted;
                }
            }

            // Reinitialize VAD with current stream and mute state
            this.setupVADWithStream(vadManager, localVideo, stream);
        }
    }

    /**
     * Checks if audio is currently muted
     * @returns {boolean} True if audio is muted
     */
    isAudioMuted() {
        if (!this.webrtc?.localStream) return false;
        const audioTrack = this.webrtc.localStream.getAudioTracks()[0];
        return audioTrack ? !audioTrack.enabled : false;
    }

    /**
     * Updates a stream's tracks to match current states
     * @param {MediaStream} stream - Stream to update
     * @param {boolean} isVideoEnabled - Video enabled state to apply
     * @param {boolean} isAudioMuted - Audio mute state to apply
     */
    _updateStreamStates(stream, isVideoEnabled, isAudioMuted) {
        log.debug({ 
            isVideoEnabled, 
            isAudioMuted,
            streamTracks: stream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                id: t.id
            }))
        }, 'Updating stream states');

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = isVideoEnabled;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !isAudioMuted;
            log.debug({ 
                audioTrackId: audioTrack.id,
                enabled: audioTrack.enabled,
                shouldBeMuted: isAudioMuted 
            }, 'Updated audio track state');
        }
    }
} 