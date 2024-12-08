import { MicVAD } from "@ricky0123/vad-web";

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
    if (!stream || !container) return;
    
    try {
      const vad = await MicVAD.new({
        stream: stream,
        onSpeechStart: () => {
          // Only trigger speaking if not muted
          if (!this.muted.get(container.id)) {
            onSpeakingChange(container, true);
          }
        },
        onSpeechEnd: () => onSpeakingChange(container, false),
        modelURL: "v5",
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        minSpeechFrames: 0,
      });

      await vad.start();
      this.instances.set(container.id, vad);
      this.muted.set(container.id, false);  // Initialize as unmuted
    } catch (error) {
      console.error('Error setting up VAD:', error);
    }
  }

  /**
   * Updates the mute state for a participant.
   * @param {string} containerId - The ID of the participant's container
   * @param {boolean} isMuted - Whether the participant is muted
   */
  updateMuteState(containerId, isMuted) {
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
      const vad = this.instances.get(participantId);
      if (vad) {
        vad.destroy();
        this.instances.delete(participantId);
        this.muted.delete(participantId);
      }
    } else {
      this.instances.forEach(async (vad) => {
        try {
          await vad.destroy();
        } catch (e) {
          console.warn('Error cleaning up VAD instance:', e);
        }
      });
      this.instances.clear();
      this.muted.clear();
    }
  }
} 