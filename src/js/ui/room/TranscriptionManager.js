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
                // Enable TTS switch when transcription is enabled
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
            log.debug({ enabled }, 'TTS toggle');
            
            if (this.currentStream && this.webrtc) {
                const roomUI = this.roomManager?.roomUI;
                const vadManager = roomUI?.vadManager;
                const localVideo = this.uiElements.getElements().localVideo;
                const videoElement = localVideo?.querySelector('video');

                // Store current video enabled state
                const videoTrack = this.currentStream.getVideoTracks()[0];
                const isVideoEnabled = videoTrack?.enabled ?? false;
                const videoConstraints = videoTrack?.getConstraints() || { width: 1280, height: 720 };

                if (enabled) {
                    // Store a fresh stream for VAD and local display
                    this.originalStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: true, 
                        video: videoConstraints
                    });
                    
                    // Match previous video enabled state
                    const newVideoTrack = this.originalStream.getVideoTracks()[0];
                    if (newVideoTrack) {
                        newVideoTrack.enabled = isVideoEnabled;
                    }

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
                    
                    // Update WebRTC (what peers receive)
                    await this.webrtc.updateLocalStream(silentStream);
                    
                    // Use original stream for VAD
                    this.currentStream = this.originalStream;

                    // Setup VAD with new stream
                    if (vadManager && localVideo) {
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
                    
                    // Match previous video enabled state
                    const newVideoTrack = newStream.getVideoTracks()[0];
                    if (newVideoTrack) {
                        newVideoTrack.enabled = isVideoEnabled;
                    }

                    // Update local video element with new stream
                    if (videoElement) {
                        videoElement.srcObject = newStream;
                    }

                    await this.webrtc.updateLocalStream(newStream);
                    this.currentStream = newStream;

                    // Reinitialize VAD with new stream
                    if (vadManager && localVideo) {
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

        // First destroy existing VAD instance
        if (vadManager.instances.has(container.id)) {
            await vadManager.instances.get(container.id).destroy();
            vadManager.instances.delete(container.id);
            log.debug({ containerId: container.id }, 'Destroyed old VAD instance');
        }
        
        // Setup new VAD
        await vadManager.setupVAD(
            stream,
            container,
            ParticipantVideo.updateSpeakingIndicators
        );
        
        log.debug({ containerId: container.id }, 'VAD setup completed');
    }
    /**
     * Handles incoming TTS audio data by playing it through the local audio context
     * and updating the WebRTC stream that peers receive
     * @param {string} base64Audio - Base64 encoded audio data to be played
     * @returns {Promise<void>}
     */
    async handleTTSAudio(base64Audio) {
        if (!this.currentStream || !this.voiceTTSEnabled.checked || !this.webrtc) return;

        try {
            const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
            const audioBuffer = await this.audioContext.decodeAudioData(audioData.buffer);

            const newStream = new MediaStream();
            const videoTrack = this.currentStream.getVideoTracks()[0];
            if (videoTrack) {
                newStream.addTrack(videoTrack);
            }

            // Add TTS audio track
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            const streamDest = this.audioContext.createMediaStreamDestination();
            source.connect(streamDest);
            newStream.addTrack(streamDest.stream.getAudioTracks()[0]);

            // Update only WebRTC stream (what peers receive)
            await this.webrtc.updateLocalStream(newStream);
            source.start();

            // When TTS ends, go back to silent track for peers
            source.onended = () => {
                const silentStream = new MediaStream();
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

                this.webrtc.updateLocalStream(silentStream);
            };
        } catch (error) {
            console.error('Error handling TTS audio:', error);
        }
    }

    sendAudioForTranscription(base64AudioData) {
        if (!this.enabled) return;

        this.websocket.send({
            type: 'transcriptionRequest',
            audioData: base64AudioData,
            language: this.language,
            roomId: this.roomId,
            timestamp: new Date().toISOString()
        });
    }

    setCurrentStream(stream, webrtc) {
        this.currentStream = stream;
        this.webrtc = webrtc;
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

        const timeEl = document.createElement('span');
        timeEl.className = 'text-xs text-slate-500 block mb-1';
        const time = new Date(timestamp);
        timeEl.textContent = time.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const transcriptionText = document.createElement('p');
        transcriptionText.className = 'text-sm text-slate-300';
        transcriptionText.textContent = text;

        transcriptionElement.appendChild(timeEl);
        transcriptionElement.appendChild(transcriptionText);
        this.transcriptionText.appendChild(transcriptionElement);
        this.transcriptionText.scrollTop = this.transcriptionText.scrollHeight;
    }

    isEnabled() {
        return this.enabled;
    }
} 