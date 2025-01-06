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
    /** @type {Map<string, { vad: MicVAD, stream: MediaStream, webrtcStream: MediaStream }>} VAD instances and their streams */
    this.instances = new Map();
    
    /** @type {Map<string, boolean>} Mute states for each participant */
    this.muted = new Map();
    
    /** @type {Map<string, { audio?: boolean, video?: boolean }>} Pending track states for participants */
    this.pendingTrackStates = new Map();
    
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
      log.debug({ 
        containerId: container.id,
        streamTracks: stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted
        }))
      }, 'Creating VAD instance');

      const vad = await MicVAD.new({
        stream,
        onSpeechStart: () => this._handleSpeechStart(container, onSpeakingChange),
        onSpeechEnd: (audioData) => this._handleSpeechEnd(container, audioData, onSpeakingChange),
        onVADMisfire: () => {
          log.debug({ containerId: container.id }, 'VAD misfire occurred');
          // Reset speaking state and WebRTC track on misfire
          this.handleSpeakingChange(container, false);
          
          // Only control WebRTC track for local participant
          const instance = this.instances.get(container.id);
          const isLocalParticipant = container.id === 'participant-local';
          if (isLocalParticipant && instance && instance.webrtcStream) {
            const audioTrack = instance.webrtcStream.getAudioTracks()[0];
            if (audioTrack) {
              audioTrack.enabled = false;
              log.debug({ containerId: container.id }, 'WebRTC audio track disabled due to VAD misfire');
            }
          }
        },
        modelURL: "v5",
        baseAssetPath: "/",
        onnxWASMBasePath: "/",
        minSpeechFrames: 4,
        frameSamples: 512,
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.4,
        redemptionFrames: 8,
        preSpeechPadFrames: 25,
        minSilenceFrames: 12,
        maxSpeechFrames: 2000
      });

      log.debug({ containerId: container.id }, 'VAD instance created, starting...');
      await vad.start();
      log.debug({ containerId: container.id }, 'VAD instance started successfully');
      return vad;
    } catch (error) {
      log.error({ error, containerId: container.id }, 'Failed to create VAD instance');
      throw error;
    }
  }

  /**
   * Handles speaking state changes from both VAD and TTS
   */
  handleSpeakingChange(container, isSpeaking) {
    if (!container) return;
    
    // Don't show speaking state if muted
    if (this.muted.get(container.id) && isSpeaking) {
      return;
    }

    ParticipantVideo.updateSpeakingIndicators(container, isSpeaking);
  }

  /**
   * Handles speech start event
   * @private
   */
  _handleSpeechStart(container, onSpeakingChange) {
    if (!this.muted.get(container.id)) {
      log.debug({ containerId: container.id }, 'Speech started');
      this.handleSpeakingChange(container, true);
      
      // Only control WebRTC track for local participant
      const instance = this.instances.get(container.id);
      const isLocalParticipant = container.id === 'participant-local';
      if (isLocalParticipant && instance && instance.webrtcStream) {
        const audioTrack = instance.webrtcStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
          log.debug({ containerId: container.id }, 'WebRTC audio track enabled due to speech');
        }
      }
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
    this.handleSpeakingChange(container, false);
    
    // Only control WebRTC track for local participant
    const instance = this.instances.get(container.id);
    const isLocalParticipant = container.id === 'participant-local';
    if (isLocalParticipant && instance && instance.webrtcStream) {
      const audioTrack = instance.webrtcStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        log.debug({ containerId: container.id }, 'WebRTC audio track disabled due to speech end');
      }
    }
    
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

    // Only send our own transcription
    if (userId === 'local') {
      await this.transcriptionManager.sendAudioForTranscription(base64, userId);
    }
  }

  /**
   * Safely destroys a VAD instance
   * @private
   */
  async _destroyVADInstance(containerId) {
    // Clean up audio nodes
    const nodes = this.audioNodes?.get(containerId);
    if (nodes) {
      try {
        nodes.context.close();
      } catch (e) {
        log.warn({ error: e }, 'Error closing audio context');
      }
      this.audioNodes.delete(containerId);
    }
    
    const instance = this.instances.get(containerId);
    if (instance) {
      try {
        log.debug({ containerId }, 'Destroying VAD instance');
        if (instance.vad) {
          await instance.vad.destroy();
        }
        if (instance.stream) {
          instance.stream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (e) {
              log.warn({ error: e, trackId: track.id }, 'Error stopping VAD track');
            }
          });
        }
        if (instance.webrtcStream) {
          instance.webrtcStream.getTracks().forEach(track => {
            // Only stop audio tracks, as video tracks are shared
            if (track.kind === 'audio') {
              try {
                track.stop();
              } catch (e) {
                log.warn({ error: e, trackId: track.id }, 'Error stopping WebRTC track');
              }
            }
          });
        }
        this.instances.delete(containerId);
        log.debug({ containerId }, 'VAD instance destroyed successfully');
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
      const isLocalParticipant = container.id === 'participant-local';
      const originalAudioTrack = stream.getAudioTracks()[0];
      const participantId = container.id.replace('participant-', '');
      const pendingState = this.pendingTrackStates.get(participantId);
      const existingMuteState = this.muted.get(container.id);
      
      log.debug({ 
        containerId: container.id,
        isLocalParticipant,
        hasAudioTrack: !!originalAudioTrack,
        existingMuteState,
        pendingState,
        audioTrack: originalAudioTrack ? {
          id: originalAudioTrack.id,
          enabled: originalAudioTrack.enabled,
          readyState: originalAudioTrack.readyState,
          muted: originalAudioTrack.muted,
          constraints: originalAudioTrack.getConstraints()
        } : null,
        streamTracks: stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted
        }))
      }, 'Setting up VAD');

      // Clean up existing instance if any
      await this._destroyVADInstance(container.id);

      // Create streams for both local and remote participants
      const vadStream = new MediaStream();
      const webrtcStream = new MediaStream();
      
      if (originalAudioTrack) {
        // Clone the audio tracks
        const vadAudioTrack = originalAudioTrack.clone();
        const webrtcAudioTrack = originalAudioTrack.clone();

        // Keep VAD stream's audio track always enabled for processing
        vadAudioTrack.enabled = true;
        vadStream.addTrack(vadAudioTrack);
        log.debug({ 
          containerId: container.id,
          trackId: vadAudioTrack.id,
          enabled: vadAudioTrack.enabled,
          muted: vadAudioTrack.muted
        }, 'VAD audio track prepared');

        // For local participant, respect existing mute state
        // For remote participants, always keep enabled
        const shouldBeEnabled = isLocalParticipant ? 
          (existingMuteState !== undefined ? !existingMuteState : originalAudioTrack.enabled) : 
          true;
        webrtcAudioTrack.enabled = shouldBeEnabled;
        webrtcStream.addTrack(webrtcAudioTrack);

        log.debug({ 
          containerId: container.id,
          trackId: webrtcAudioTrack.id,
          enabled: webrtcAudioTrack.enabled,
          muted: webrtcAudioTrack.muted,
          isLocalParticipant,
          originalTrackEnabled: originalAudioTrack.enabled,
          existingMuteState,
          shouldBeEnabled
        }, 'WebRTC audio track prepared');
      }
      
      const vad = await this._createVADInstance(vadStream, container, onSpeakingChange);
      
      // Store both streams with the instance
      this.instances.set(container.id, { vad, stream: vadStream, webrtcStream });
      
      // Initialize mute state:
      // For remote participants, use pending state if available
      const isMuted = isLocalParticipant ? 
        (existingMuteState ?? false) : 
        (pendingState?.audio !== undefined ? !pendingState.audio : !originalAudioTrack?.enabled);

      log.debug({
        containerId: container.id,
        isLocalParticipant,
        originalTrackEnabled: originalAudioTrack?.enabled,
        existingMuteState,
        pendingState,
        calculatedMuteState: isMuted,
        webrtcTrackEnabled: webrtcStream.getAudioTracks()[0]?.enabled
      }, 'Calculating initial mute state');

      this.muted.set(container.id, isMuted);
      
      // Update UI for mute state
      if (isMuted) {
        ParticipantVideo.updateSpeakingIndicators(container, false);
      } else if (!isLocalParticipant) {
        // For non-muted remote participants, initialize speaking state as false
        ParticipantVideo.updateSpeakingIndicators(container, false);
      }
      
      // For remote participants, ensure WebRTC track state matches mute state
      if (!isLocalParticipant && webrtcStream) {
        const audioTrack = webrtcStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !isMuted;
          log.debug({ 
            containerId: container.id,
            trackEnabled: audioTrack.enabled,
            isMuted
          }, 'Updated remote WebRTC track state');
        }
      }
      
      // Clear pending state after setup
      if (!isLocalParticipant) {
        this.pendingTrackStates.delete(participantId);
      }
      
      log.debug({ 
        containerId: container.id, 
        isMuted,
        isLocalParticipant,
        trackEnabled: originalAudioTrack?.enabled,
        webrtcTrackEnabled: webrtcStream.getAudioTracks()[0]?.enabled,
        vadTrackEnabled: vadStream.getAudioTracks()[0]?.enabled
      }, 'VAD initialized');

      // Return the WebRTC stream for use in the connection
      return webrtcStream;
    } catch (error) {
      log.error({ error, containerId: container.id }, 'Failed to setup VAD');
      throw error;
    }
  }

  /**
   * Updates the mute state for a participant.
   */
  updateMuteState(containerId, isMuted) {
    const isLocalParticipant = containerId === 'participant-local';
    const instance = this.instances.get(containerId);
    const participantId = containerId.replace('participant-', '');
    
    log.debug({ 
      containerId, 
      isMuted, 
      isLocalParticipant,
      hasInstance: !!instance,
      currentTrackState: instance?.webrtcStream?.getAudioTracks()[0]?.enabled,
      currentMuteState: this.muted.get(containerId)
    }, 'Updating mute state');

    // Store state if container doesn't exist yet
    if (!document.getElementById(containerId)) {
      let pendingState = this.pendingTrackStates.get(participantId) || {};
      pendingState.audio = !isMuted;
      this.pendingTrackStates.set(participantId, pendingState);
      log.debug({ 
        containerId,
        participantId,
        pendingState
      }, 'Stored pending track state');
      return;
    }

    // For remote participants, update their track state based on the incoming mute state
    if (!isLocalParticipant && instance?.webrtcStream) {
      const audioTrack = instance.webrtcStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMuted;
        log.debug({ 
          containerId,
          trackEnabled: audioTrack.enabled,
          newMuteState: isMuted
        }, 'Remote participant track state updated');
      }
    }
    
    this.muted.set(containerId, isMuted);

    // Only modify WebRTC stream for local participant
    if (isLocalParticipant && instance?.webrtcStream) {
      const audioTrack = instance.webrtcStream.getAudioTracks()[0];
      if (audioTrack) {
        // If muted, ensure track is disabled
        if (isMuted) {
          audioTrack.enabled = false;
          log.debug({ containerId }, 'WebRTC audio track disabled due to mute');
        }
      }
    }

    // Update UI for all participants
    const container = document.getElementById(containerId);
    if (container) {
      if (isMuted) {
        ParticipantVideo.updateSpeakingIndicators(container, false);
      } else if (!isLocalParticipant && instance?.webrtcStream) {
        // For non-muted remote participants, initialize speaking state as false
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
      const cleanupPromises = Array.from(this.instances.keys()).map(id => 
        this._destroyVADInstance(id)
      );
      await Promise.all(cleanupPromises);
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