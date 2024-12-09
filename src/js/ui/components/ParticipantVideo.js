import { uiLogger as log } from '../../utils/logger.js';

/**
 * Manages the video and audio states for participant containers in the video grid.
 */
export class ParticipantVideo {
  /**
   * Sets up media track state handlers for a participant's container.
   * @param {HTMLElement} container - The participant's video container element
   * @param {MediaStream} stream - The participant's media stream
   */
  static setupStates(container, stream) {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    log.debug({
      containerId: container.id,
      hasVideo: !!videoTrack?.enabled,
      hasAudio: !!audioTrack?.enabled
    }, 'Setting up media states');
    
    // Initial state setup
    this.updateMediaState(container, videoTrack?.enabled ?? false, audioTrack?.enabled ?? false);
    
    if (videoTrack) {
      videoTrack.onmute = () => {
        log.debug({ containerId: container.id }, 'Video track muted');
        this.updateMediaState(container, false, audioTrack?.enabled ?? false);
      };
      videoTrack.onunmute = () => {
        log.debug({ containerId: container.id }, 'Video track unmuted');
        this.updateMediaState(container, true, audioTrack?.enabled ?? false);
      };
      videoTrack.onended = () => {
        log.debug({ containerId: container.id }, 'Video track ended');
        this.updateMediaState(container, false, audioTrack?.enabled ?? false);
      };
    }
    
    if (audioTrack) {
      audioTrack.onmute = () => {
        log.debug({ containerId: container.id }, 'Audio track muted');
        this.updateMediaState(container, videoTrack?.enabled ?? false, false);
      };
      audioTrack.onunmute = () => {
        log.debug({ containerId: container.id }, 'Audio track unmuted');
        this.updateMediaState(container, videoTrack?.enabled ?? false, true);
      };
      audioTrack.onended = () => {
        log.debug({ containerId: container.id }, 'Audio track ended');
        this.updateMediaState(container, videoTrack?.enabled ?? false, false);
      };
    }
  }

  /**
   * Updates the speaking indicators for a participant's container.
   * @param {HTMLElement} container - The participant's video container element
   * @param {boolean} speaking - Whether the participant is currently speaking
   */
  static updateSpeakingIndicators(container, speaking) {
    if (!container) {
      log.warn('No container provided for speaking indicators');
      return;
    }

    log.debug({
      containerId: container.id,
      speaking
    }, 'Updating speaking indicators');

    const speakingIndicator = container.querySelector('.peer-speaking');
    const statusDot = container.querySelector('.bg-emerald-500');

    if (speakingIndicator) {
      speakingIndicator.classList.toggle('active', speaking);
    }

    if (statusDot) {
      statusDot.classList.toggle('animate-pulse', speaking);
    }
  }

  /**
   * Updates any video container's visual state based on media states.
   * @param {HTMLElement} container - The video container element
   * @param {boolean} isVideoEnabled - Whether video is currently enabled
   * @param {boolean} isAudioEnabled - Whether audio is currently enabled
   */
  static updateMediaState(container, isVideoEnabled, isAudioEnabled) {
    if (!container) {
      log.warn('No container provided for media state update');
      return;
    }

    log.debug({
      containerId: container.id,
      isVideoEnabled,
      isAudioEnabled
    }, 'Updating container state');

    const audioIndicator = container.querySelector('[data-tooltip="Audio status"]');
    const videoIndicator = container.querySelector('[data-tooltip="Video status"]');
    
    if (!audioIndicator) {
      log.warn({ containerId: container.id }, 'Could not find audio indicator');
      return;
    }

    const micIcon = audioIndicator.querySelector('.mic-icon');
    const slashIcon = audioIndicator.querySelector('.slash');
    
    if (!micIcon || !slashIcon) {
      log.warn({ containerId: container.id }, 'Missing mic or slash icon');
      return;
    }

    // Handle audio state
    audioIndicator.classList.remove('mute-transition');
    void audioIndicator.offsetWidth; // Force reflow
    audioIndicator.classList.add('mute-transition');
    
    if (!isAudioEnabled) {
      micIcon.classList.remove('hidden');
      slashIcon.classList.remove('hidden');
      audioIndicator.classList.add('muted');
    } else {
      micIcon.classList.add('hidden');
      slashIcon.classList.add('hidden');
      audioIndicator.classList.remove('muted');
    }
    
    // Handle video state
    if (videoIndicator) {
      const videoSlash = videoIndicator.querySelector('.slash');
      if (videoSlash) {
        videoSlash.classList.toggle('hidden', isVideoEnabled);
      }
    }
    
    log.debug({ 
      containerId: container.id, 
      classes: container.classList.toString() 
    }, 'Container classes before update');
    
    container.classList.toggle('peer-video-off', !isVideoEnabled);
    container.classList.toggle('peer-muted', !isAudioEnabled);
    
    log.debug({ 
      containerId: container.id, 
      classes: container.classList.toString() 
    }, 'Container classes after update');
  }
} 