import { uiLogger as log } from '../../utils/logger.js';

/**
 * Manages the grid of video elements in the room.
 */
export class VideoGrid {
  /**
   * Creates a new VideoGrid instance.
   * @param {HTMLElement} gridElement - The container element for the video grid
   * @param {HTMLTemplateElement} remoteTemplate - Template for remote participant videos
   */
  constructor(gridElement, remoteTemplate) {
    this.gridElement = gridElement;
    this.remoteTemplate = remoteTemplate;
    log.debug('Video grid initialized');
  }

  /**
   * Adds a new video element to the grid.
   * @param {string} participantId - Unique identifier for the participant
   * @param {string} participantName - Name of the participant
   * @param {MediaStream} stream - The participant's media stream
   * @param {Function} setupCallbacks - Function to set up event handlers for the video container
   * @returns {HTMLElement} The created video container element
   */
  addVideo(participantId, participantName, stream, setupCallbacks) {
    if (!this.gridElement || !this.remoteTemplate) {
      log.error({ participantId }, 'Missing grid element or template');
      return;
    }

    log.debug({ 
      participantId,
      hasVideo: stream.getVideoTracks().length > 0,
      hasAudio: stream.getAudioTracks().length > 0
    }, 'Adding video to grid');

    const clone = this.remoteTemplate.content.cloneNode(true);
    const container = clone.querySelector('div');
    container.id = `participant-${participantId}`;
    
    const video = clone.querySelector('video');
    video.srcObject = stream;
    
    // Mute local video to prevent echo
    if (participantId === 'local') {
        video.muted = true;
        log.debug('Muted local video to prevent echo');
    }
    
    // Find the name element and update it safely
    const nameElement = container.querySelector('.participant-name');
    if (nameElement) {
      nameElement.textContent = participantName;
    } else {
      log.warn({ participantId }, 'Could not find name element in video container');
    }
    
    setupCallbacks(container, stream);
    
    // For local video, insert at the beginning of the grid
    if (participantId === 'local') {
      this.gridElement.insertBefore(clone, this.gridElement.firstChild);
    } else {
      this.gridElement.appendChild(clone);
    }
    
    log.debug({ participantId, containerId: container.id }, 'Video added to grid');
    return container;
  }

  /**
   * Removes a video element from the grid.
   * @param {string} participantId - Unique identifier for the participant to remove
   */
  removeVideo(participantId) {
    const containerId = `participant-${participantId}`;
    log.debug({ participantId, containerId }, 'VideoGrid.removeVideo called');
    
    const container = document.getElementById(containerId);
    if (container) {
        log.debug({ participantId }, 'Found container, removing video');
        
        // Clean up media tracks
        const video = container.querySelector('video');
        if (video) {
            log.debug({ participantId }, 'Found video element');
            if (video.srcObject) {
                log.debug({ participantId }, 'Stopping video tracks');
                video.srcObject.getTracks().forEach(track => {
                    track.stop();
                    log.debug({ participantId, trackKind: track.kind }, 'Track stopped');
                });
                video.srcObject = null;
            }
        }
        
        // Remove the container
        container.remove();
        log.debug({ participantId }, 'Container removed from DOM');
    } else {
        log.warn({ participantId, containerId }, 'Video container not found for removal');
    }
  }
} 