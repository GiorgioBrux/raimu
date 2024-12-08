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
    
    container.classList.toggle('peer-video-off', !videoTrack?.enabled);
    container.classList.toggle('peer-muted', !audioTrack?.enabled);
    
    if (videoTrack) {
      videoTrack.onmute = () => container.classList.add('peer-video-off');
      videoTrack.onunmute = () => container.classList.remove('peer-video-off');
      videoTrack.onended = () => container.classList.add('peer-video-off');
    }
    
    if (audioTrack) {
      audioTrack.onmute = () => container.classList.add('peer-muted');
      audioTrack.onunmute = () => container.classList.remove('peer-muted');
      audioTrack.onended = () => container.classList.add('peer-muted');
    }
  }

  /**
   * Updates the speaking indicators for a participant's container.
   * @param {HTMLElement} container - The participant's video container element
   * @param {boolean} speaking - Whether the participant is currently speaking
   */
  static updateSpeakingIndicators(container, speaking) {
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
   * Updates the local video container's visual state based on media states.
   * @param {HTMLElement} container - The local video container element
   * @param {boolean} isVideoEnabled - Whether video is currently enabled
   * @param {boolean} isAudioEnabled - Whether audio is currently enabled
   */
  static updateLocalVideoContainer(container, isVideoEnabled, isAudioEnabled) {
    if (!container) {
        console.warn('No container provided to updateLocalVideoContainer');
        return;
    }

    const audioIndicator = container.querySelector('[data-tooltip="Audio status"]');
    const videoIndicator = container.querySelector('[data-tooltip="Video status"]');
    
    if (!audioIndicator) {
        console.warn('Could not find audio indicator');
        return;
    }

    const micIcon = audioIndicator.querySelector('.mic-icon');
    const slashIcon = audioIndicator.querySelector('.slash');
    
    if (!micIcon || !slashIcon) {
        console.warn('Missing mic or slash icon', { micIcon, slashIcon });
        return;
    }

    const shouldShow = !isAudioEnabled;
    
    // Remove any existing transition classes
    audioIndicator.classList.remove('mute-transition');
    
    // Add transition class to trigger animation
    void audioIndicator.offsetWidth; // Force reflow
    audioIndicator.classList.add('mute-transition');
    
    if (shouldShow) {
        micIcon.classList.remove('hidden');
        slashIcon.classList.remove('hidden');
        audioIndicator.classList.add('muted');
    } else {
        micIcon.classList.add('hidden');
        slashIcon.classList.add('hidden');
        audioIndicator.classList.remove('muted');
    }
    
    if (videoIndicator) {
        const videoSlash = videoIndicator.querySelector('.slash');
        if (videoSlash) {
            videoSlash.classList.toggle('hidden', isVideoEnabled);
        }
    }
    
    container.classList.toggle('peer-video-off', !isVideoEnabled);
    container.classList.toggle('peer-muted', !isAudioEnabled);
  }
} 