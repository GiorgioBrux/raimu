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
    log.debug({ participantId, participantName, hasStream: !!stream }, 'Adding video with name');
    
    if (!this.gridElement || !this.remoteTemplate) {
      log.error({ participantId }, 'Missing grid element or template');
      return;
    }

    const clone = this.remoteTemplate.content.cloneNode(true);
    const container = clone.querySelector('div');
    container.id = `participant-${participantId}`;
    
    const nameElement = container.querySelector('.participant-name');
    if (nameElement) {
      nameElement.textContent = participantName;
    }

    const video = clone.querySelector('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x-webkit-airplay', 'allow');
    
    // Safari-specific attributes
    video.playsInline = true;
    video.autoplay = true;
    
    if (participantId === 'local') {
      video.muted = true;
      log.debug('Muted local video to prevent echo');
    }

    // Use Safari-friendly playback setup
    const setupPlayback = async () => {
      try {
        log.debug({ 
          participantId,
          streamTracks: stream?.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id }))
        }, 'Setting up video playback');

        // For Safari, we need to ensure tracks are enabled before setting srcObject
        stream.getTracks().forEach(track => {
          track.enabled = true;
        });

        // First set the srcObject
        video.srcObject = stream;
        
        log.debug({ 
          participantId,
          readyState: video.readyState,
          networkState: video.networkState,
          error: video.error?.message
        }, 'Video state after setting srcObject');

        // Safari needs a load() call
        video.load();

        // Wait for metadata with a shorter timeout for Safari
        await Promise.race([
          new Promise((resolve) => {
            const checkState = () => {
              if (video.readyState >= 1) { // Changed from 2 to 1 for Safari
                resolve();
              } else {
                video.addEventListener('loadedmetadata', resolve, { once: true });
              }
            };
            checkState();
          }),
          new Promise((_, reject) => setTimeout(() => 
            reject(new Error('Metadata loading timeout')), 2000))
        ]);

        log.debug({ participantId }, 'Metadata loaded, attempting playback');

        // For Safari, we need to mute before playing
        const wasMuted = video.muted;
        video.muted = true;
        
        // Try to play
        await video.play();
        
        // Restore original mute state
        if (!wasMuted && participantId !== 'local') {
          video.muted = false;
        }
        
        log.debug({ participantId, containerId: container.id }, 'Video playback started');
        
      } catch (error) {
        log.warn({ 
          error, 
          participantId,
          videoState: {
            readyState: video.readyState,
            networkState: video.networkState,
            error: video.error?.message
          }
        }, 'Initial playback failed, retrying with click handler');
        
        // For Safari, we need to recreate the video element
        const newVideo = document.createElement('video');
        Object.assign(newVideo, {
          playsInline: true,
          autoplay: true,
          muted: true,
          className: video.className
        });
        video.parentNode.replaceChild(newVideo, video);
        
        newVideo.srcObject = stream;
        newVideo.load();
        
        const playOnClick = async () => {
          try {
            await newVideo.play();
            if (participantId !== 'local') {
              newVideo.muted = false;
            }
            log.debug({ participantId }, 'Click-to-play succeeded');
            document.removeEventListener('click', playOnClick);
            newVideo.removeEventListener('click', playOnClick);
          } catch (retryError) {
            log.error({ 
              error: retryError,
              videoState: {
                readyState: newVideo.readyState,
                networkState: newVideo.networkState,
                error: newVideo.error?.message
              }
            }, 'Click-to-play failed');
          }
        };

        document.addEventListener('click', playOnClick);
        newVideo.addEventListener('click', playOnClick);
      }
    };

    setupPlayback();
    setupCallbacks(container, stream);
    
    if (participantId === 'local') {
      this.gridElement.insertBefore(clone, this.gridElement.firstChild);
    } else {
      this.gridElement.appendChild(clone);
    }
    
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

  /**
   * Updates a participant's name in their video container
   * @param {string} participantId - The ID of the participant
   * @param {string} newName - The new name to display
   * @returns {boolean} Whether the update was successful
   */
  updateParticipantName(participantId, newName) {
    const containerId = `participant-${participantId}`;
    const container = document.getElementById(containerId);
    if (container) {
      const nameElement = container.querySelector('.participant-name');
      if (nameElement) {
        log.debug({ participantId, newName }, 'Updating participant name in video container');
        nameElement.textContent = newName;
        return true;
      }
    }
    log.debug({ participantId, newName }, 'Could not find video container to update name');
    return false;
  }
} 