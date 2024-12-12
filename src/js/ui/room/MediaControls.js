import { uiLogger as logger } from '../../utils/logger.js';

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
    this.callbacks = {};
  }

  /**
   * Updates the audio button state.
   * @param {boolean} muted - Whether audio is muted
   */
  updateAudioState(muted) {
    logger.debug({ muted }, 'Updating audio button state');
    const button = this.elements.audio;
    if (!button) return;

    const mutedStr = muted.toString();
    button.dataset.muted = mutedStr;
    
    // Update all child elements with data-muted attribute
    button.querySelectorAll('[data-muted]').forEach(el => {
        el.dataset.muted = mutedStr;
    });
  }

  /**
   * Updates the video button state.
   * @param {boolean} disabled - Whether video is disabled
   */
  updateVideoState(disabled) {
    logger.debug({ disabled }, 'Updating video buttonstate');
    const button = this.elements.video;
    if (!button) return;

    const disabledStr = disabled.toString();
    button.dataset.disabled = disabledStr;
    
    // Update all child elements with data-disabled attribute
    button.querySelectorAll('[data-disabled]').forEach(el => {
        el.dataset.disabled = disabledStr;
    });
  }

  /**
   * Updates initial states of media controls.
   * @param {boolean} isVideoEnabled - Whether video is initially enabled
   * @param {boolean} isAudioEnabled - Whether audio is initially enabled
   */
  updateInitialStates(isVideoEnabled, isAudioEnabled) {
    logger.debug({ 
      isVideoEnabled, 
      isAudioEnabled 
    }, 'Setting initial media states');
    
    if (this.elements.video) {
      this.elements.video.dataset.disabled = (!isVideoEnabled).toString();
      const videoIcon = this.elements.video.querySelector('.control-icon');
      if (videoIcon) {
        videoIcon.dataset.disabled = (!isVideoEnabled).toString();
      }
    }

    if (this.elements.audio) {
      this.elements.audio.dataset.muted = (!isAudioEnabled).toString();
      const audioIcon = this.elements.audio.querySelector('.control-icon');
      if (audioIcon) {
        audioIcon.dataset.muted = (!isAudioEnabled).toString();
      }
    }
  }

  /**
   * Sets up event listeners for all control buttons.
   * @param {Object} callbacks - Object containing callback functions
   */
  setupEventListeners({ onAudioToggle, onVideoToggle, onLeave, onPanelToggle }) {
    this.callbacks = { onAudioToggle, onVideoToggle, onLeave, onPanelToggle };

    if (this.elements.audio) {
        this.elements.audio.addEventListener('click', () => {
            logger.debug('Audio button clicked');
            const isMuted = this.elements.audio.dataset.muted === 'true';
            const newMutedState = !isMuted;

            // Update button state
            this.updateAudioState(newMutedState);

            // Call callback to update other UI elements
            this.callbacks.onAudioToggle?.(newMutedState);
        });
    }

    if (this.elements.video) {
        this.elements.video.addEventListener('click', () => {
            logger.debug('Video button clicked');
            const isDisabled = this.elements.video.dataset.disabled === 'true';
            const newDisabledState = !isDisabled;

            // Update button state
            this.updateVideoState(newDisabledState);

            // Call callback to update other UI elements
            this.callbacks.onVideoToggle?.(newDisabledState);
        });
    }

    if (this.elements.leave) {
        this.elements.leave.addEventListener('click', () => {
            logger.debug('Leave button clicked');
            this.callbacks.onLeave?.();
        });
    }
  }
} 