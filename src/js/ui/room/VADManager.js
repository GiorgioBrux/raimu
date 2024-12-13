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
  constructor(transcriptionManager) {
    this.instances = new Map();
    this.muted = new Map();
    this.transcriptionManager = transcriptionManager;
    // Share the AudioContext with TranscriptionManager
    this.audioContext = transcriptionManager.audioContext;
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
      log.debug({ 
        containerId: container.id,
        hasAudioTrack: !!stream.getAudioTracks().length,
        audioTrack: stream.getAudioTracks()[0] ? {
          id: stream.getAudioTracks()[0].id,
          enabled: stream.getAudioTracks()[0].enabled,
          readyState: stream.getAudioTracks()[0].readyState,
          constraints: stream.getAudioTracks()[0].getConstraints()
        } : null
      }, 'Setting up VAD');

      // Reuse existing VAD instance if possible
      if (this.instances.has(container.id)) {
        log.debug({ containerId: container.id }, 'Destroying existing VAD instance');
        await this.instances.get(container.id).destroy();
      }

      const vad = await MicVAD.new({
        stream: stream,
        onSpeechStart: () => {
          // Only trigger speaking if not muted
          if (!this.muted.get(container.id)) {
            log.debug({ 
              containerId: container.id,
              audioTrackId: stream.getAudioTracks()[0]?.id
            }, 'Speech started');
            onSpeakingChange(container, true);
          }
          else {
            log.debug({ containerId: container.id }, 'Speech started but muted');
          }
        },
        onSpeechEnd: async (audioData) => {
          log.debug({ containerId: container.id }, 'Speech ended');
          onSpeakingChange(container, false);
          
          // Only process audio for transcription if not muted and transcription manager exists
          if (!this.muted.get(container.id) && 
              this.transcriptionManager && 
              !this.transcriptionManager.isAudioMuted()) {
            log.debug({ containerId: container.id }, 'Processing audio for transcription');
            const wavBuffer = this._encodeWAV(audioData);
            const base64 = this._arrayBufferToBase64(wavBuffer);
            
            this.transcriptionManager.sendAudioForTranscription(base64);
          }
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

  /**
   * Encodes audio data to WAV format
   * @private
   * @param {Float32Array} samples - Raw audio samples
   * @returns {ArrayBuffer} WAV encoded audio
   */
  _encodeWAV(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    // Write WAV header
    // "RIFF" identifier
    this._writeString(view, 0, 'RIFF');
    // File length
    view.setUint32(4, 36 + samples.length * 2, true);
    // "WAVE" identifier
    this._writeString(view, 8, 'WAVE');
    // "fmt " chunk identifier
    this._writeString(view, 12, 'fmt ');
    // Chunk length
    view.setUint32(16, 16, true);
    // Sample format (1 is PCM)
    view.setUint16(20, 1, true);
    // Mono channel
    view.setUint16(22, 1, true);
    // Sample rate (16000 for Whisper)
    view.setUint32(24, 16000, true);
    // Byte rate
    view.setUint32(28, 16000 * 2, true);
    // Block align
    view.setUint16(32, 2, true);
    // Bits per sample
    view.setUint16(34, 16, true);
    // "data" identifier
    this._writeString(view, 36, 'data');
    // Data chunk length
    view.setUint32(40, samples.length * 2, true);
    
    // Write audio data
    this._floatTo16BitPCM(view, 44, samples);
    
    return buffer;
  }

  /**
   * Writes a string to a DataView
   * @private
   */
  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Converts Float32Array to 16-bit PCM
   * @private
   */
  _floatTo16BitPCM(view, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  /**
   * Converts ArrayBuffer to base64 string
   * @private
   */
  _arrayBufferToBase64(buffer) {
    // Convert buffer to base64 in chunks to avoid call stack issues
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async _replaceAudioTrack(stream, audioBuffer) {
    const source = new AudioContext().createBufferSource();
    source.buffer = audioBuffer;
    const dest = new MediaStreamAudioDestinationNode(source.context);
    source.connect(dest);
    source.start();

    // Replace the audio track in the stream
    const [oldTrack] = stream.getAudioTracks();
    if (oldTrack) {
      stream.removeTrack(oldTrack);
    }
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }
} 