import { VideoGrid } from '../ui/room/VideoGrid.js';
import { MediaControls } from '../ui/room/MediaControls.js';
import { VADManager } from '../ui/room/VADManager.js';
import { SettingsControl } from '../ui/room/SettingsControl.js';
import { HeaderManager } from '../ui/room/HeaderManager.js';
import { UIElements } from '../ui/room/UIElements.js';
import { ParticipantVideo } from '../ui/room/ParticipantVideo.js';
import { PanelManager } from '../ui/room/PanelManager.js';
import { uiLogger as log } from '../utils/logger.js';
import { ParticipantMuteManager } from '../ui/room/ParticipantMuteManager.js';
import { ChatManager } from '../ui/room/ChatManager.js';
import { TranscriptionManager } from '../ui/room/TranscriptionManager.js';

/**
 * Manages the user interface components for a video chat room
 */
export class RoomUI {
  /**
   * Creates a new RoomUI instance
   * @param {RoomManager} roomManager - The room manager instance to coordinate with
   */
  constructor(roomManager) {
    /** @type {RoomManager} Room manager instance */
    this.roomManager = roomManager;

    /** @type {boolean} Whether UI has been initialized */
    this.initialized = false;
    
    /** @type {UIElements} UI elements manager */
    this.uiElements = new UIElements();

    /** @type {ParticipantMuteManager} Mute manager instance */
    this.muteManager = new ParticipantMuteManager();
  }

  /**
   * Initializes the room UI components and sets up initial state
   * @returns {Promise<void>}
   * @throws {Error} If UI initialization fails
   */
  async initialize() {
    try {
      if (!await this.uiElements.initialize()) {
        const error = new Error('Failed to initialize UI elements');
        log.error({ error }, 'UI initialization failed');
        throw error;
      }

      const elements = this.uiElements.getElements();
      
      this.videoGrid = new VideoGrid(elements.videoGrid, elements.remoteTemplate);
      this.mediaControls = new MediaControls(elements.controls);
      this.headerManager = new HeaderManager(elements.roomName, elements.PIN, elements.copyPinBtn);
      this.settingsControl = new SettingsControl(elements.controls, elements.settingsModal, this.roomManager, this);
      this.chatManager = new ChatManager(
        elements, 
        this.roomManager.ws, 
        this.roomManager.roomId,
        this.roomManager
      );
      this.transcriptionManager = new TranscriptionManager(
        this.uiElements,
        this.roomManager.ws,
        this.roomManager.roomId,
        this.roomManager
      );
      this.vadManager = new VADManager(this.transcriptionManager);

      this.setupEventListeners();
      this.initialized = true;
      log.debug('Room UI initialized successfully');
    } catch (error) {
      log.error({ error }, 'Failed to initialize room UI');
      throw error;
    }
  }

  /**
   * Sets up event listeners for media controls and other UI interactions
   */
  setupEventListeners() {
    this.mediaControls.setupEventListeners({
      onAudioToggle: (mute) => {
        this.roomManager.webrtc.toggleAudio(mute);
        const elements = this.uiElements.getElements();
        const localContainer = elements.localVideo;
        if (localContainer) {
          this.vadManager.updateMuteState(localContainer.id, mute);
          const videoTrack = elements.localVideo.srcObject?.getVideoTracks()[0];
          ParticipantVideo.updateMediaState(
            localContainer,
            videoTrack?.enabled ?? false,
            !mute
          );
        }
      },
      onVideoToggle: (disable) => {
        this.roomManager.webrtc.toggleVideo(disable);
      },
      onLeave: () => this.handleLeaveRoom(),
      onPanelToggle: (panelId) => PanelManager.togglePanel(panelId)
    });
  }

  /**
   * Handles leaving the current room by cleaning up resources and navigating home
   */
  handleLeaveRoom() {
    this.cleanup();
    this.roomManager.leaveRoom();
    window.appRouter.navigate('/');
  }

  /**
   * Adds a participant's video stream to the video grid
   * @param {string} participantId - Unique identifier for the participant
   * @param {string} participantName - Name of the participant
   * @param {MediaStream} stream - The participant's media stream containing audio/video tracks
   * @returns {HTMLElement} The container element for the participant's video
   */
  addParticipantVideo(participantId, participantName, stream) {
    if (!this.initialized) {
      log.warn({ participantId }, 'Attempted to add participant video before initialization');
      return;
    }

    log.debug({ 
      participantId,
      hasVideo: stream.getVideoTracks().length > 0,
      hasAudio: stream.getAudioTracks().length > 0
    }, 'Adding participant video');

    const setupCallbacks = (container, stream) => {
      ParticipantVideo.setupStates(container, stream);
      log.debug({ containerId: container.id }, 'Setting up VAD for participant');
      this.vadManager.setupVAD(
        stream, 
        container, 
        ParticipantVideo.updateSpeakingIndicators
      );

      // Handle remote participant mute controls
      const muteButton = container.querySelector('[data-remote-only]');
      if (muteButton) {
        if (participantId === 'local') {
          muteButton.classList.add('hidden');
        } else {
          this.muteManager.setupControls(participantId, container);
        }
      }
    };

    return this.videoGrid.addVideo(participantId, participantName, stream, setupCallbacks);
  }

  /**
   * Removes a participant's video from the grid and cleans up associated resources
   * @param {string} participantId - Unique identifier for the participant to remove
   */
  removeParticipantVideo(participantId) {
    log.debug({ participantId }, 'RoomUI.removeParticipantVideo called');
    
    if (!this.initialized) {
        log.warn({ participantId }, 'Attempted to remove participant video before initialization');
        return;
    }

    if (!this.videoGrid) {
        log.error({ participantId }, 'VideoGrid not initialized');
        return;
    }
    
    log.debug({ participantId }, 'Removing participant video');
    
    // Clean up VAD for this participant
    if (this.vadManager) {
        log.debug({ participantId }, 'Cleaning up VAD');
        this.vadManager.cleanup(participantId);
    }
    
    // Remove the video from the grid
    log.debug({ participantId }, 'Removing from video grid');
    this.videoGrid.removeVideo(participantId);
  }

  /**
   * Sets up the local media stream and initializes related UI components
   * @param {MediaStream} stream - The local media stream to set up
   * @returns {void}
   */
  setLocalStream(stream) {
    if (!this.initialized) {
        log.warn('Attempted to set local stream before initialization');
        return;
    }
    
    // Pass both stream and WebRTC instance to TranscriptionManager
    this.transcriptionManager.setCurrentStream(stream, this.roomManager.webrtc);
    
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    const isVideoEnabled = videoTrack?.enabled ?? false;
    const isAudioEnabled = audioTrack?.enabled ?? false;
    
    log.debug({
        hasVideo: isVideoEnabled,
        hasAudio: isAudioEnabled
    }, 'Setting up local stream');
    
    // Update existing local video if it exists
    const existingContainer = document.getElementById('participant-local');
    if (existingContainer) {
        const video = existingContainer.querySelector('video');
        if (video) {
            video.srcObject = stream;
            ParticipantVideo.updateMediaState(
                existingContainer,
                isVideoEnabled,
                isAudioEnabled
            );
            this.vadManager.updateMuteState(existingContainer.id, !isAudioEnabled);
            log.debug({ containerId: existingContainer.id }, 'Setting up VAD for existing local participant');
            this.vadManager.setupVAD(
                stream, 
                existingContainer,
                ParticipantVideo.updateSpeakingIndicators
            );
            return;
        }
    }

    // If no existing video, create new one (first time setup)
    this.mediaControls.updateInitialStates(isVideoEnabled, isAudioEnabled);
    const container = this.addParticipantVideo('local', `You (${sessionStorage.getItem('userName')})`, stream);
    this.uiElements.addLocalVideoElement(container);
    
    const video = container.querySelector('video');
    if (!video) {
        log.error('No video element found, container: ', container);
        return;
    }
    
    video.muted = true; // Ensure muted for iOS Safari
    try {
       video.play();
    } catch (error) {
        log.warn({ error }, 'Auto-play failed, will retry after user interaction');
        // Add click handler to try playing again
        video.addEventListener('click', () => {
            video.play().catch(e => 
                log.error({ error: e }, 'Failed to play video after user interaction')
            );
        }, { once: true });
    }

    ParticipantVideo.updateMediaState(
        container,
        isVideoEnabled,
        isAudioEnabled
    );
    
    if (container) {
        this.vadManager.updateMuteState(container.id, !isAudioEnabled);
    }
  }

  /**
   * Cleans up Room UI components and releases resources
   */
  cleanup() {
    log.debug('Cleaning up Room UI');
    this.vadManager.cleanup();
    this.muteManager.cleanup();
  }

  /**
   * Handles incoming chat messages
   * @param {Object} data - The incoming chat message data
   */
  handleChatMessage(data) {
    if (!this.initialized || !this.chatManager) return;
    
    const { sender, message, timestamp } = data;
    this.chatManager.addMessage(sender, message, timestamp);
  }
} 