import { VideoGrid } from '../ui/components/VideoGrid.js';
import { MediaControls } from '../ui/components/MediaControls.js';
import { VADManager } from '../ui/components/VADManager.js';
import { UIElements } from '../ui/components/UIElements.js';
import { ParticipantVideo } from '../ui/components/ParticipantVideo.js';
import { PanelManager } from '../ui/components/PanelManager.js';
import { uiLogger as log } from '../utils/logger.js';

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
      this.vadManager = new VADManager();

      // Get values from sessionStorage
      const roomName = sessionStorage.getItem('roomName');
      const pin = sessionStorage.getItem('PIN');

      // Update room name display
      if (elements.roomName) {
        elements.roomName.textContent = roomName || 'Unnamed Room';
      }

      // Update PIN display
      if (elements.PIN && pin) {
        // Clear existing dots
        elements.PIN.innerHTML = '';
        
        // Create PIN display groups
        pin.match(/.{1,4}/g).forEach((group, groupIndex) => {
          const groupDiv = document.createElement('div');
          groupDiv.className = 'flex gap-1 items-center group';
          
          // Create dots display
          const dotsDisplay = document.createElement('div');
          dotsDisplay.className = 'flex gap-1 absolute group-hover:opacity-0 transition-opacity';
          
          // Create numbers display
          const numbersDisplay = document.createElement('div');
          numbersDisplay.className = 'flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity';
          
          // Add digits for this group
          [...group].forEach((digit) => {
            // Create dot
            const dot = document.createElement('div');
            dot.className = 'w-2 h-2 rounded-full bg-lime-500';
            dotsDisplay.appendChild(dot);
            
            // Create number
            const number = document.createElement('div');
            number.className = 'w-2 text-xs text-lime-500 font-medium';
            number.textContent = digit;
            numbersDisplay.appendChild(number);
          });
          
          groupDiv.appendChild(dotsDisplay);
          groupDiv.appendChild(numbersDisplay);
          elements.PIN.appendChild(groupDiv);
          
          // Add separator after each group except the last
          if (groupIndex < pin.match(/.{1,4}/g).length - 1) {
            const separator = document.createElement('div');
            separator.className = 'text-lime-400/50';
            separator.textContent = '-';
            elements.PIN.appendChild(separator);
          }
        });
      }

      // Add click handler for copying PIN
      const copyPinBtn = document.getElementById('copyPinBtn');
      if (copyPinBtn) {
        copyPinBtn.addEventListener('click', () => this.handlePinCopy(pin));
      }

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
        else {
          log.warn('Could not find local video container for audio toggle');
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
   * @param {MediaStream} stream - The participant's media stream containing audio/video tracks
   * @returns {HTMLElement} The container element for the participant's video
   */
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

    return this.videoGrid.addVideo(participantId, stream, setupCallbacks);
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
    
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    const isVideoEnabled = videoTrack?.enabled ?? false;
    const isAudioEnabled = audioTrack?.enabled ?? false;
    
    log.debug({
      hasVideo: isVideoEnabled,
      hasAudio: isAudioEnabled
    }, 'Setting up local stream');
    
    this.mediaControls.updateInitialStates(isVideoEnabled, isAudioEnabled);
    
    // Add local video using the template
    const container = this.addParticipantVideo('local', stream);

    // Update the participant name to show "You (username)"
    const nameElement = container.querySelector('.participant-name');
    if (nameElement) {
      nameElement.textContent = `You (${sessionStorage.getItem('userName')})`;
    }

    // Update UI elements
    this.uiElements.addLocalVideoElement(container);
    
    // Ensure video plays
    const video = container.querySelector('video');
    if(!video) {
      log.error('No video element found, container: ', container);
      return;
    }
    
    video.play().catch(error => {
      log.error({ error }, 'Failed to play local video');
    });

    // Update states and setup VAD
    ParticipantVideo.updateMediaState(
      container,
      isVideoEnabled,
      isAudioEnabled
    );
    
    if (container) {
      this.vadManager.updateMuteState(container.id, !isAudioEnabled);
      this.vadManager.setupVAD(
        stream, 
        container,
        ParticipantVideo.updateSpeakingIndicators
      );
    }
  }

  /**
   * Cleans up Room UI components and releases resources
   */
  cleanup() {
    log.debug('Cleaning up Room UI');
    this.vadManager.cleanup();
  }

  /**
   * Handles copying the room PIN to clipboard and shows feedback
   * @param {string} pin - The PIN to copy
   * @returns {Promise<void>}
   */
  async handlePinCopy(pin) {
    if (!pin) return;
    
    try {
      await navigator.clipboard.writeText(pin);
      
      // Show success state
      const copyIcon = document.querySelector('.copy-icon');
      const checkIcon = document.querySelector('.check-icon');
      
      if (copyIcon && checkIcon) {
        copyIcon.classList.add('hidden');
        checkIcon.classList.remove('hidden');
        
        // Reset after 2 seconds
        setTimeout(() => {
          copyIcon.classList.remove('hidden');
          checkIcon.classList.add('hidden');
        }, 2000);
      }
    } catch (err) {
      log.error({ error: err }, 'Failed to copy PIN to clipboard');
    }
  }
} 