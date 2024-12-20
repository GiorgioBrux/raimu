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
    /** @type {Map<string, { vad: MicVAD, stream: MediaStream }>} VAD instances and their streams */
    this.instances = new Map();
    
    /** @type {Map<string, boolean>} Mute states for each participant */
    this.muted = new Map();
    
    /** @type {TranscriptionManager} Reference to transcription manager */
    this.transcriptionManager = transcriptionManager;
    
    /** @type {AudioContext} Shared audio context */
    this.audioContext = transcriptionManager.audioContext;
  }

  /**
   * Creates a new VAD instance for a participant
   * @private
   */
  async _createVADInstance(stream, container, onSpeakingChange) {
    try {
      const vad = await MicVAD.new({
        stream,
        onSpeechStart: () => this._handleSpeechStart(container, onSpeakingChange),
        onSpeechEnd: (audioData) => this._handleSpeechEnd(container, audioData, onSpeakingChange),
        modelURL: "v5",
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        minSpeechFrames: 0,
      });

      await vad.start();
      return vad;
    } catch (error) {
      log.error({ error, containerId: container.id }, 'Failed to create VAD instance');
      throw error;
    }
  }

  /**
   * Handles speech start event
   * @private
   */
  _handleSpeechStart(container, onSpeakingChange) {
    if (!this.muted.get(container.id)) {
      log.debug({ containerId: container.id }, 'Speech started');
      onSpeakingChange(container, true);
    } else {
      log.debug({ containerId: container.id }, 'Speech started but muted');
    }
  }

  /**
   * Handles speech end event
   * @private
   */
  async _handleSpeechEnd(container, audioData, onSpeakingChange) {
    log.debug({ containerId: container.id }, 'Speech ended');
    onSpeakingChange(container, false);
    
    if (!this.muted.get(container.id) && 
        this.transcriptionManager) {
      await this._processAudioForTranscription(container.id, audioData);
    }
  }

  /**
   * Process audio data for transcription
   * @private
   */
  async _processAudioForTranscription(containerId, audioData) {
    log.debug({ containerId }, 'Processing audio for transcription');
    const wavBuffer = this._encodeWAV(audioData);
    const base64 = this._arrayBufferToBase64(wavBuffer);
    
    // Extract userId from container ID (format: participant-{userId})
    const userId = containerId.replace('participant-', '');
    await this.transcriptionManager.sendAudioForTranscription(base64, userId);
  }

  /**
   * Safely destroys a VAD instance
   * @private
   */
  async _destroyVADInstance(containerId) {
    const instance = this.instances.get(containerId);
    if (instance) {
      try {
        await instance.vad.destroy();
        instance.stream.getTracks().forEach(track => track.stop());
        this.instances.delete(containerId);
        log.debug({ containerId }, 'VAD instance destroyed');
      } catch (error) {
        log.error({ error, containerId }, 'Error destroying VAD instance');
      }
    }
  }

  /**
   * Sets up VAD for a participant's stream.
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

      // Clean up existing instance if any
      await this._destroyVADInstance(container.id);

      // Create new VAD instance with cloned stream
      const vadStream = stream.clone();
      const vad = await this._createVADInstance(vadStream, container, onSpeakingChange);
      
      // Store instance with its stream
      this.instances.set(container.id, { vad, stream: vadStream });
      
      // Initialize mute state
      const isMuted = this.muted.get(container.id) ?? false;
      this.updateMuteState(container.id, isMuted);
      
      log.debug({ containerId: container.id }, 'VAD initialized');
    } catch (error) {
      log.error({ error, containerId: container.id }, 'Failed to setup VAD');
      throw error;
    }
  }

  /**
   * Updates the mute state for a participant.
   */
  updateMuteState(containerId, isMuted) {
    log.debug({ containerId, isMuted }, 'Updating mute state');
    this.muted.set(containerId, isMuted);

    // Update stream state
    const instance = this.instances.get(containerId);
    if (instance) {
      const audioTrack = instance.stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMuted;
      }
    }

    // Update UI if muted
    if (isMuted) {
      const container = document.getElementById(containerId);
      if (container) {
        ParticipantVideo.updateSpeakingIndicators(container, false);
      }
    }
  }

  /**
   * Cleans up VAD instances.
   */
  async cleanup(participantId = null) {
    if (participantId) {
      log.debug({ participantId }, 'Cleaning up VAD instance');
      await this._destroyVADInstance(participantId);
      this.muted.delete(participantId);
    } else {
      log.debug('Cleaning up all VAD instances');
      for (const [id] of this.instances) {
        await this._destroyVADInstance(id);
      }
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