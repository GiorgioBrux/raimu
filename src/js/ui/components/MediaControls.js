import { uiLogger as log } from '../../utils/logger.js';

/**
 * Manages media control buttons and their states.
 */
export class MediaControls {
  /**
   * Creates a new MediaControls instance.
   * @param {Object} controlElements - Object containing control button elements
   */
  constructor(controlElements) {
    this.elements = controlElements;
    log.debug('Media controls initialized');
  }

  /**
   * Updates the audio button state.
   * @param {boolean} muted - Whether audio is muted
   */
  updateAudioState(muted) {
    log.debug({ muted }, 'Updating audio button state');
    const button = this.elements.audio;
    button.dataset.muted = muted;
    button.querySelectorAll('[data-muted]').forEach(el => {
      el.dataset.muted = muted;
    });
  }

  /**
   * Updates the video button state.
   * @param {boolean} disabled - Whether video is disabled
   */
  updateVideoState(disabled) {
    log.debug({ disabled }, 'Updating video buttonstate');
    const button = this.elements.video;
    button.dataset.disabled = disabled;
    button.querySelectorAll('[data-disabled]').forEach(el => {
      el.dataset.disabled = disabled;
    });
  }

  /**
   * Updates initial states of media controls.
   * @param {boolean} isVideoEnabled - Whether video is initially enabled
   * @param {boolean} isAudioEnabled - Whether audio is initially enabled
   */
  updateInitialStates(isVideoEnabled, isAudioEnabled) {
    log.debug({ 
      isVideoEnabled, 
      isAudioEnabled 
    }, 'Setting initial media states');
    
    this.updateVideoState(!isVideoEnabled);
    this.updateAudioState(!isAudioEnabled);
  }

  /**
   * Sets up event listeners for all control buttons.
   * @param {Object} callbacks - Object containing callback functions for each control
   * @param {Function} callbacks.onAudioToggle - Callback for audio toggle
   * @param {Function} callbacks.onVideoToggle - Callback for video toggle
   * @param {Function} callbacks.onScreenShare - Callback for screen sharing
   * @param {Function} callbacks.onLeave - Callback for leaving the room
   * @param {Function} callbacks.onPanelToggle - Callback for toggling panels
   */
  setupEventListeners(callbacks) {
    if (!this.elements.audio || !this.elements.video) {
      log.warn('Missing required control elements');
      return;
    }

    this.elements.audio?.addEventListener('click', () => {
      const isMuted = this.elements.audio.dataset.muted === 'true';
      log.debug({ newState: !isMuted }, 'Audio toggle clicked');
      callbacks.onAudioToggle(!isMuted);
      this.updateAudioState(!isMuted);
    });

    this.elements.video?.addEventListener('click', () => {
      const isDisabled = this.elements.video.dataset.disabled === 'true';
      log.debug({ newState: !isDisabled }, 'Video toggle clicked');
      callbacks.onVideoToggle(!isDisabled);
      this.updateVideoState(!isDisabled);
    });

    this.elements.screen?.addEventListener('click', () => {
      log.debug('Screen share clicked');
      callbacks.onScreenShare();
    });

    this.elements.leave?.addEventListener('click', () => {
      log.debug('Leave call clicked');
      callbacks.onLeave();
    });

    this.elements.transcribe?.addEventListener('click', () => {
      log.debug('Transcription panel toggle clicked');
      callbacks.onPanelToggle('transcriptionText');
    });

    this.elements.chat?.addEventListener('click', () => {
      log.debug('Chat panel toggle clicked');
      callbacks.onPanelToggle('chatMessages');
    });
  }
} 