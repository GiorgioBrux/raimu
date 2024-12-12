import { MicVAD } from "@ricky0123/vad-web";
import { uiLogger as log } from '../../utils/logger.js';
import { ParticipantVideo } from './ParticipantVideo.js';

/**
 * Manages Voice Activity Detection (VAD) for participants in the room.
 */
export class VADManager {
  /**
   * Creates a new VADManager instance.
   */
  constructor() {
    this.instances = new Map();
    this.muted = new Map();  // Track mute state for each participant
  }

  /**
   * Sets up VAD for a participant's stream.
   * @param {MediaStream} stream - The participant's media stream
   * @param {HTMLElement} container - The participant's video container element
   * @param {Function} onSpeakingChange - Callback function when speaking state changes
   */
  async setupVAD(stream, container, onSpeakingChange) {
    if (!stream || !container) {
      log.warn('Missing stream or container for VAD setup');
      return;
    }
    
    try {
      log.debug({ containerId: container.id }, 'Setting up VAD');
      const vad = await MicVAD.new({
        stream: stream,
        onSpeechStart: () => {
          // Only trigger speaking if not muted
          if (!this.muted.get(container.id)) {
            log.debug({ containerId: container.id }, 'Speech started');
            onSpeakingChange(container, true);
          }
          else {
            log.debug({ containerId: container.id }, 'Speech started but muted');
          }
        },
        onSpeechEnd: () => {
          log.debug({ containerId: container.id }, 'Speech ended');
          onSpeakingChange(container, false);
        },
        modelURL: "v5",
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        minSpeechFrames: 0,
      });

      await vad.start();
      this.instances.set(container.id, vad);
      this.muted.set(container.id, false);  // Initialize as unmuted
      log.debug({ containerId: container.id }, 'VAD initialized');
    } catch (error) {
      log.error({ error, containerId: container.id }, 'Failed to setup VAD');
    }
  }

  /**
   * Updates the mute state for a participant.
   * @param {string} containerId - The ID of the participant's container
   * @param {boolean} isMuted - Whether the participant is muted
   */
  updateMuteState(containerId, isMuted) {
    log.debug({ containerId, isMuted }, 'Updating mute state');
    this.muted.set(containerId, isMuted);
    if (isMuted) {
      // Force speaking state to false when muted
      const container = document.getElementById(containerId);
      if (container) {
        ParticipantVideo.updateSpeakingIndicators(container, false);
      }
    }
  }

  /**
   * Cleans up VAD instances.
   * @param {string} [participantId] - Optional participant ID to clean up specific instance
   */
  cleanup(participantId = null) {
    if (participantId) {
      log.debug({ participantId }, 'Cleaning up VAD instance');
      const vad = this.instances.get(participantId);
      if (vad) {
        vad.destroy();
        this.instances.delete(participantId);
        this.muted.delete(participantId);
      }
    } else {
      log.debug('Cleaning up all VAD instances');
      this.instances.forEach(async (vad, id) => {
        try {
          await vad.destroy();
          log.debug({ participantId: id }, 'VAD instance destroyed');
        } catch (e) {
          log.warn({ error: e, participantId: id }, 'Error cleaning up VAD instance');
        }
      });
      this.instances.clear();
      this.muted.clear();
    }
  }
} 