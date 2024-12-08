import { VideoGrid } from './components/VideoGrid';
import { MediaControls } from './components/MediaControls';
import { VADManager } from './components/VADManager';
import { UIElements } from './components/UIElements';
import { ParticipantVideo } from './components/ParticipantVideo';
import { PanelManager } from './components/PanelManager';
import { uiLogger as log } from '../utils/logger.js';

export class RoomUI {
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.roomManager.onParticipantLeft = (participantId) => {
      log.debug({ participantId }, 'Participant left, removing video');
      this.removeParticipantVideo(participantId);
    };
    this.initialized = false;
    this.uiElements = new UIElements();
  }

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
      this.vadManager = new VADManager();

      this.setupEventListeners();
      this.initialized = true;
      log.debug('Room UI initialized successfully');
    } catch (error) {
      log.error({ error }, 'Failed to initialize room UI');
      throw error;
    }
  }

  setupEventListeners() {
    this.mediaControls.setupEventListeners({
      onAudioToggle: (mute) => {
        this.roomManager.webrtc.toggleAudio(mute);
        const elements = this.uiElements.getElements();
        const localContainer = elements.localVideo.parentElement;
        if (localContainer) {
          this.vadManager.updateMuteState(localContainer.id, mute);
          const videoTrack = elements.localVideo.srcObject?.getVideoTracks()[0];
          ParticipantVideo.updateLocalVideoContainer(
            localContainer,
            videoTrack?.enabled ?? false,
            !mute
          );
        }
      },
      onVideoToggle: (disable) => {
        this.roomManager.webrtc.toggleVideo(disable);
      },
      onScreenShare: () => this.roomManager.webrtc.shareScreen(),
      onLeave: () => this.handleLeaveRoom(),
      onPanelToggle: (panelId) => PanelManager.togglePanel(panelId)
    });
  }

  handleLeaveRoom() {
    this.cleanup();
    this.roomManager.leaveRoom();
    window.appRouter.navigate('/');
  }

  addParticipantVideo(participantId, stream) {
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
      this.vadManager.setupVAD(
        stream, 
        container, 
        ParticipantVideo.updateSpeakingIndicators
      );
    };

    this.videoGrid.addVideo(participantId, stream, setupCallbacks);
  }

  removeParticipantVideo(participantId) {
    if (!this.initialized) {
      log.warn({ participantId }, 'Attempted to remove participant video before initialization');
      return;
    }
    log.debug({ participantId }, 'Removing participant video');
    this.videoGrid.removeVideo(participantId);
  }

  setLocalStream(stream) {
    if (!this.initialized) {
      log.warn('Attempted to set local stream before initialization');
      return;
    }
    
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    const isVideoEnabled = videoTrack?.enabled ?? false;
    const isAudioEnabled = audioTrack?.enabled ?? false;
    
    log.debug({
      hasVideo: isVideoEnabled,
      hasAudio: isAudioEnabled
    }, 'Setting up local stream');
    
    this.mediaControls.updateInitialStates(isVideoEnabled, isAudioEnabled);
    
    const elements = this.uiElements.getElements();
    elements.localVideo.srcObject = stream;
    
    elements.localVideo.play().catch(error => {
      log.error({ error }, 'Failed to play local video');
    });
    
    const localContainer = elements.localVideo.parentElement;
    ParticipantVideo.updateLocalVideoContainer(
      localContainer,
      isVideoEnabled,
      isAudioEnabled
    );
    
    if (localContainer) {
      this.vadManager.updateMuteState(localContainer.id, !isAudioEnabled);
    }
    
    this.vadManager.setupVAD(
      stream, 
      localContainer,
      ParticipantVideo.updateSpeakingIndicators
    );
  }

  cleanup() {
    log.debug('Cleaning up Room UI');
    this.vadManager.cleanup();
  }
} 