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
   * @param {MediaStream} stream - The participant's media stream
   * @param {Function} setupCallbacks - Function to set up event handlers for the video container
   * @returns {HTMLElement} The created video container element
   */
  addVideo(participantId, stream, setupCallbacks) {
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
    
    setupCallbacks(container, stream);
    this.gridElement.appendChild(clone);
    
    log.debug({ participantId, containerId: container.id }, 'Video added to grid');
    return container;
  }

  /**
   * Removes a video element from the grid.
   * @param {string} participantId - Unique identifier for the participant to remove
   */
  removeVideo(participantId) {
    const container = document.getElementById(`participant-${participantId}`);
    if (container) {
      log.debug({ participantId }, 'Removing video from grid');
      container.remove();
    } else {
      log.warn({ participantId }, 'Video container not found for removal');
    }
  }
} 