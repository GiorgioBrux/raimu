import { uiLogger as log } from '../../../utils/logger.js';
import { TTSManager } from './TTSManager.js';
import { TranscriptionUI } from './TranscriptionUI.js';
import { AudioProcessor } from './AudioProcessor.js';
import { StreamManager } from './StreamManager.js';
import { ParticipantVideo } from '../ParticipantVideo.js';

/**
 * Main manager class that coordinates transcription functionality
 */
export class TranscriptionManager {
    /**
     * Creates a new TranscriptionManager instance
     * @param {import('../UIElements.js').UIElements} uiElements - UI elements manager
     * @param {WebSocket} websocket - WebSocket connection for sending transcriptions
     * @param {string} roomId - ID of the current room
     * @param {import('../../../services/RoomManager.js').RoomManager} roomManager - Room manager instance
     */
    constructor(uiElements, websocket, roomId, roomManager) {
        this.ui = new TranscriptionUI(uiElements, roomManager);
        this.websocket = websocket;
        this.tts = new TTSManager(websocket);
        this.audioProcessor = new AudioProcessor(websocket, roomId);
        this.streamManager = new StreamManager();
        this.roomManager = roomManager;

        this.setupEventListeners();
        log.debug('TranscriptionManager initialized');
    }

    setupEventListeners() {
        // Get UI elements
        const elements = this.ui;
        
        // Handle transcription toggle
        elements.transcriptionEnabled.addEventListener('change', () => {
            const enabled = elements.isTranscriptionEnabled();
            elements.updateTTSState(enabled);
        });

        // Handle TTS toggle
        elements.voiceTTSEnabled.addEventListener('change', async () => {
            const enabled = elements.isTTSEnabled();
            const currentMuteState = this.streamManager.isAudioMuted();
            log.debug({ enabled, currentMuteState }, 'TTS toggle');
            
            if (this.streamManager.getCurrentStream() && this.streamManager.webrtc) {
                const roomUI = this.roomManager?.roomUI;
                const vadManager = roomUI?.vadManager;
                const localVideo = roomUI?.uiElements.getElements().localVideo;
                const videoElement = localVideo?.querySelector('video');
                const videoTrack = this.streamManager.getCurrentStream().getVideoTracks()[0];
                const isVideoEnabled = videoTrack?.enabled ?? false;

                if (enabled) {
                    await this.enableTTS(videoElement, isVideoEnabled, currentMuteState, vadManager, localVideo);
                } else {
                    await this.disableTTS(videoElement, isVideoEnabled, currentMuteState, vadManager, localVideo);
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

    async enableTTS(videoElement, isVideoEnabled, currentMuteState, vadManager, localVideo) {
        // Store a fresh stream for VAD and local display
        const originalStream = await this.streamManager.createNewStream(
            this.streamManager.getCurrentStream().getVideoTracks()[0]
        );
        this.tts.setOriginalStream(originalStream);
        
        // Update stream states
        this.streamManager._updateStreamStates(originalStream, isVideoEnabled, currentMuteState);

        // Update local video display with original stream
        if (videoElement) {
            videoElement.srcObject = originalStream;
        }

        // Create and set up silent stream for peers
        const silentStream = await this.createSilentStream(isVideoEnabled);
        await this.streamManager.updateWebRTCStream(silentStream, currentMuteState);
        
        // Use original stream for VAD
        this.streamManager.setCurrentStream(originalStream);

        // Setup VAD with new stream
        if (vadManager && localVideo) {
            await this.setupVAD(vadManager, localVideo, originalStream, currentMuteState);
        }
    }

    async disableTTS(videoElement, isVideoEnabled, currentMuteState, vadManager, localVideo) {
        // Clean up original stream
        this.tts.cleanup();

        // Get fresh stream with current settings
        const newStream = await this.streamManager.createNewStream(
            this.streamManager.getCurrentStream().getVideoTracks()[0]
        );
        
        // Update stream states
        this.streamManager._updateStreamStates(newStream, isVideoEnabled, currentMuteState);

        // Update local video element with new stream
        if (videoElement) {
            videoElement.srcObject = newStream;
        }

        await this.streamManager.updateWebRTCStream(newStream, currentMuteState);
        this.streamManager.setCurrentStream(newStream);

        // Reinitialize VAD with new stream
        if (vadManager && localVideo) {
            await this.setupVAD(vadManager, localVideo, newStream, currentMuteState);
        }
    }

    async createSilentStream(isVideoEnabled) {
        const silentStream = new MediaStream();
        const originalVideoTrack = this.streamManager.getCurrentStream().getVideoTracks()[0];
        if (originalVideoTrack) {
            silentStream.addTrack(originalVideoTrack);
            originalVideoTrack.enabled = isVideoEnabled;
        }
        
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

    async setupVAD(vadManager, container, stream, isMuted) {
        log.debug({
            containerId: container.id,
            streamTracks: stream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                id: t.id,
                readyState: t.readyState
            }))
        }, 'Setting up VAD with stream');
        
        vadManager.muted.set(container.id, isMuted);

        // Get the videoGrid from roomUI, with fallback to ParticipantVideo's static method
        const onSpeakingChange = this.roomManager?.roomUI?.videoGrid?.updateSpeakingIndicators?.bind(this.roomManager.roomUI.videoGrid) || 
            ParticipantVideo.updateSpeakingIndicators;

        await vadManager.setupVAD(
            stream, 
            container,
            onSpeakingChange
        );
    }

    /**
     * Sets up the current stream and WebRTC instance
     */
    setCurrentStream(stream, webrtc) {
        this.streamManager.setCurrentStream(stream);
        this.streamManager.setWebRTC(webrtc);
        this.tts.setStreams(stream, webrtc);
        
        // Set up track state change handler
        this.streamManager.setupTrackStateHandler(this.handleMuteStateChange.bind(this));
    }

    /**
     * Handles mute state changes
     */
    handleMuteStateChange(isMuted) {
        const roomUI = this.roomManager?.roomUI;
        const vadManager = roomUI?.vadManager;
        const localVideo = roomUI?.uiElements.getElements().localVideo;

        if (vadManager && localVideo) {
            // Update VAD's mute state
            vadManager.updateMuteState(localVideo.id, isMuted);

            // Update the current stream being used for VAD
            const stream = this.ui.isTTSEnabled() ? this.tts.originalStream : this.streamManager.getCurrentStream();
            if (stream) {
                const audioTrack = stream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !isMuted;
                }
            }
        }
    }

    /**
     * Processes audio for transcription
     */
    sendAudioForTranscription(base64AudioData, userId) {
        if (!this.ui.isTranscriptionEnabled()) return;
        if (this.streamManager.isAudioMuted() && userId === 'local') return;

        this.audioProcessor.sendAudioForTranscription(
            base64AudioData, 
            userId,
            this.ui.getSelectedLanguage()
        );
    }

    /**
     * Handles incoming TTS audio
     */
    async handleTTSAudio(base64Audio) {
        log.debug('Handling TTS audio');
        log.debug({
            isTTSEnabled: this.ui.isTTSEnabled(),
            isAudioMuted: this.streamManager.isAudioMuted()
        }, 'TTS audio handling');
        if (!this.ui.isTTSEnabled() || this.streamManager.isAudioMuted()) return;
        await this.tts.handleTTSAudio(base64Audio, this.streamManager.isAudioMuted());
    }

    /**
     * Adds a transcription to the UI
     */
    addTranscription(text, userId, timestamp, translatedText = null, originalLanguage = null) {
        this.ui.addTranscription(text, userId, timestamp, translatedText, originalLanguage);
    }
} 