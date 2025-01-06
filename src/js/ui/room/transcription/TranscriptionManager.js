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
        this.roomManager = roomManager;
        this.currentStream = null;
        this.webrtc = null;

        // Set up TTS queue state handler
        this.tts.onQueueStateChange = (state) => {
            this.ui.updateTTSIcons(state);
        };

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
            
            if (this.currentStream && this.webrtc) {
                if (enabled) {
                    // Store current stream tracks before creating silent stream
                    this.originalStreamTracks = this.currentStream.getTracks().map(track => track.clone());
                    // Create silent stream for peers when TTS is enabled
                    await this.createSilentStream();
                } else {
                    // Restore original stream when TTS is disabled
                    if (this.originalStreamTracks) {
                        const restoredStream = new MediaStream();
                        this.originalStreamTracks.forEach(track => {
                            track.enabled = true; // Ensure tracks are enabled
                            restoredStream.addTrack(track);
                        });
                        
                        // Update WebRTC stream first
                        await this.webrtc.updateLocalStream(restoredStream);
                        this.currentStream = restoredStream;
                        
                        // Update local video container using ParticipantVideo
                        const localContainer = document.getElementById('participant-local');
                        if (localContainer) {
                            const videoTrack = restoredStream.getVideoTracks()[0];
                            const audioTrack = restoredStream.getAudioTracks()[0];
                            ParticipantVideo.setupStates(localContainer, restoredStream);
                            ParticipantVideo.updateMediaState(
                                localContainer,
                                videoTrack?.enabled ?? false,
                                audioTrack?.enabled ?? false
                            );
                        }
                        
                        this.originalStreamTracks = null;
                    } else {
                        // If no stored tracks, try to get a new stream
                        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                        
                        // Update WebRTC stream first
                        await this.webrtc.updateLocalStream(newStream);
                        this.currentStream = newStream;
                        
                        // Update local video container using ParticipantVideo
                        const localContainer = document.getElementById('participant-local');
                        if (localContainer) {
                            const videoTrack = newStream.getVideoTracks()[0];
                            const audioTrack = newStream.getAudioTracks()[0];
                            ParticipantVideo.setupStates(localContainer, newStream);
                            ParticipantVideo.updateMediaState(
                                localContainer,
                                videoTrack?.enabled ?? false,
                                audioTrack?.enabled ?? false
                            );
                        }
                    }
                }
            }
            
            this.websocket.send({
                type: 'TTSStatus',
                enabled
            });
        });
    }

    /**
     * Creates and sets a silent stream for WebRTC
     */
    async createSilentStream() {
        const silentStream = new MediaStream();
        
        // Keep the video track from the current stream
        const videoTrack = this.currentStream.getVideoTracks()[0];
        if (videoTrack) {
            silentStream.addTrack(videoTrack);
        }
        
        // Create silent audio track
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        oscillator.frequency.value = 0;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain);
        const dest = gain.connect(ctx.createMediaStreamDestination());
        oscillator.start();
        silentStream.addTrack(dest.stream.getAudioTracks()[0]);

        // Update the WebRTC stream
        await this.webrtc.updateLocalStream(silentStream);
    }

    /**
     * Sets up the current stream and WebRTC instance
     */
    setCurrentStream(stream, webrtc) {
        this.currentStream = stream;
        this.webrtc = webrtc;

        // If TTS is already enabled, create silent stream
        if (this.ui.isTTSEnabled()) {
            this.createSilentStream();
        }

        // Set up speaking state change handler for TTS
        this.tts.onSpeakingStateChange = (userId, isSpeaking) => {
            const roomUI = this.roomManager?.roomUI;
            const vadManager = roomUI?.vadManager;
            if (vadManager) {
                const participantContainer = document.getElementById(`participant-${userId}`);
                if (participantContainer) {
                    vadManager.handleSpeakingChange(participantContainer, isSpeaking);
                }
            }
        };
    }

    /**
     * Processes audio for transcription
     */
    sendAudioForTranscription(base64AudioData, userId) {
        if (!this.ui.isTranscriptionEnabled()) return;

        this.audioProcessor.sendAudioForTranscription(
            base64AudioData, 
            userId,
            this.ui.getSelectedLanguage()
        );
    }

    /**
     * Handles incoming TTS audio
     */
    async handleTTSAudio(base64Audio, userId, timestamp) {
        log.debug('Handling TTS audio');
        // Use the original message timestamp to ensure ID consistency
        const timestampDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        const messageId = `${userId}-${timestampDate.getTime()}`; // Use original message timestamp
        await this.tts.handleTTSAudio(base64Audio, userId, messageId);
    }

    /**
     * Adds a transcription to the UI
     */
    addTranscription(text, userId, timestamp, translatedText = null, originalLanguage = null, hasTTS = false, ttsDuration = 0) {
        this.ui.addTranscription(
            text, 
            userId, 
            timestamp, 
            translatedText, 
            originalLanguage,
            null,  // translatedLanguage
            hasTTS,  // Use the hasTTS from the packet
            ttsDuration
        );
    }

    /**
     * Handles language change messages
     */
    handleLanguageChanged(data) {
        this.ui.handleLanguageChanged(data);
    }
} 