import { VideoGrid } from './components/VideoGrid';
import { MediaControls } from './components/MediaControls';
import { VADManager } from './components/VADManager';
import { UIElements } from './components/UIElements';
import { ParticipantVideo } from './components/ParticipantVideo';
import { PanelManager } from './components/PanelManager';

export class RoomUI {
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.initialized = false;
    this.uiElements = new UIElements();
  }

  async initialize() {
    try {
      if (!await this.uiElements.initialize()) {
        throw new Error('Failed to initialize UI elements');
      }

      const elements = this.uiElements.getElements();
      
      this.videoGrid = new VideoGrid(elements.videoGrid, elements.remoteTemplate);
      this.mediaControls = new MediaControls(elements.controls);
      this.vadManager = new VADManager();

      this.setupEventListeners();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize room UI:', error);
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
    if (!this.initialized) return;

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
    if (!this.initialized) return;
    this.vadManager.cleanup(participantId);
    this.videoGrid.removeVideo(participantId);
  }

  setLocalStream(stream) {
    if (!this.initialized) return;
    
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    const isVideoEnabled = videoTrack?.enabled ?? false;
    const isAudioEnabled = audioTrack?.enabled ?? false;
    
    this.mediaControls.updateInitialStates(isVideoEnabled, isAudioEnabled);
    
    const elements = this.uiElements.getElements();
    elements.localVideo.srcObject = stream;
    
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
    this.vadManager.cleanup();
  }
} 