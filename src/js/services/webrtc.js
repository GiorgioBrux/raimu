import { Peer } from 'peerjs';
import { webrtcLogger as log } from '../utils/logger.js';

/**
 * Manages WebRTC peer connections and media streams.
 */
export class WebRTCService {
  /**
   * Creates a new WebRTCService instance.
   */
  constructor() {
    this.peer = null;
    this.localStream = null;
    this.connections = new Map();
    this.onParticipantJoined = null;
    this.onParticipantLeft = null;
    this.onStreamUpdate = null;
    this.onTrackStateChange = null;
  }

  /**
   * Initializes the WebRTC peer connection.
   * @param {string} userId - Unique identifier for the local peer
   * @returns {Promise<Peer>} The initialized peer object
   * @throws {Error} If peer initialization fails
   */
  async initialize(userId) {
    try {
      await this.disconnect();
      await this._createPeer(userId);
      await this.initializeMedia();
      return this.peer;
    } catch (error) {
      log.error({ error }, 'Failed to initialize peer');
      throw error;
    }
  }

  /**
   * Creates a new peer connection with retry mechanism.
   * @param {string} userId - Unique identifier for the local peer
   * @param {number} [retries=3] - Maximum number of connection attempts
   * @returns {Promise<Peer>} The created peer object
   * @private
   */
  async _createPeer(userId, retries = 3) {
    return new Promise((resolve, reject) => {
      let attemptCount = 0;
      
      const attempt = () => {
        if (attemptCount >= retries) {
          reject(new Error('Failed to connect to server after multiple attempts'));
          return;
        }

        attemptCount++;
        log.debug({ attempt: attemptCount, retries }, 'Connection attempt');

        this.peer = new Peer(userId, {
          host: 'localhost',
          port: 9000,
          path: '/peerjs',
          debug: 2,
          config: {
            iceServers: [
              { urls: 'stun:localhost:9000' },
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        const timeout = setTimeout(() => {
          this.peer.destroy();
          attempt();
        }, 5000);

        this.peer.on('open', (id) => {
          log.info({ id }, 'Connected to PeerJS server');
          clearTimeout(timeout);
          this._setupPeerEvents();
          resolve(this.peer);
        });

        this.peer.on('error', (error) => {
          log.error({ error }, 'PeerJS connection error');
          clearTimeout(timeout);
          if (error.type === 'network' || error.type === 'server-error') {
            attempt();
          } else {
            reject(error);
          }
        });
      };

      attempt();
    });
  }

  /**
   * Sets up event handlers for the peer connection.
   * @private
   */
  _setupPeerEvents() {
    this.peer.on('connection', (conn) => {
      // Handle new peer connections
      const participantId = conn.peer;
      this.onParticipantJoined?.(participantId);
    });

    this.peer.on('call', async (call) => {
      // Auto-answer all incoming calls with our stream
      await this._handleIncomingCall(call);
    });

    this.peer.on('error', (error) => {
      console.error('[WebRTC] Connection error:', error);
      // Handle reconnection if needed
    });
  }

  /**
   * Initializes local media stream with audio and video.
   * @returns {Promise<MediaStream>} The local media stream
   * @throws {Error} If media access fails
   */
  async initializeMedia() {
    try {
      if (!this.localStream) {  // Only initialize if we don't have a stream
        log.debug('Initializing media devices');
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        log.info({
          tracks: this.localStream.getTracks().map(t => t.kind)
        }, 'Media initialized');
      }
      return this.localStream;
    } catch (error) {
      log.error({ error }, 'Failed to access media devices');
      throw error;
    }
  }

  /**
   * Establishes a connection with a remote participant.
   * @param {string} participantId - ID of the remote participant
   * @returns {Promise<void>}
   */
  async connectToParticipant(participantId) {
    try {
      log.debug({ participantId }, 'Attempting to connect to participant');
      
      if (!this.localStream) {
        await this.initializeMedia();
      }

      const call = this.peer.call(participantId, this.localStream);
      
      if (!call) {
        throw new Error(`Failed to create call to ${participantId}`);
      }

      await this._handleConnection(call);
      log.info({ participantId }, 'Successfully connected to participant');
    } catch (error) {
      log.error({ error, participantId }, 'Failed to connect to participant');
      throw error;
    }
  }

  /**
   * Handles incoming call from a remote participant.
   * @param {MediaConnection} call - The incoming call object
   * @returns {Promise<void>}
   * @private
   */
  _handleIncomingCall(call) {
    log.debug({ peerId: call.peer }, 'Handling incoming call');
    if (!this.connections.has(call.peer)) {
      call.answer(this.localStream);
      return this._handleConnection(call);
    } else {
      log.debug({ peerId: call.peer }, 'Ignoring duplicate call');
    }
  }

  /**
   * Sets up media connection with a participant.
   * @param {MediaConnection} call - The media connection object
   * @returns {Promise<void>}
   * @private
   */
  _handleConnection(call) {
    return new Promise((resolve) => {
      const participantId = call.peer;
      log.debug({ participantId }, 'Setting up connection');
      
      this.connections.set(participantId, call);

      let streamHandled = false;
      call.on('stream', (remoteStream) => {
        // Only handle the stream once
        if (streamHandled) {
          log.debug({ participantId }, 'Stream already handled');
          return;
        }
        streamHandled = true;

        log.debug({ participantId }, 'Received stream');
        
        remoteStream.getTracks().forEach(track => {
          track.onmute = () => {
            log.debug({ participantId, track: track.kind }, 'Track muted');
            this.onTrackStateChange?.(participantId, track.kind, false);
          };
          track.onunmute = () => {
            log.debug({ participantId, track: track.kind }, 'Track unmuted');
            this.onTrackStateChange?.(participantId, track.kind, true);
          };
        });
        
        this.onStreamUpdate?.(participantId, remoteStream);
        resolve();
      });

      call.on('close', () => {
        log.info({ participantId }, 'Connection closed');
        this.connections.delete(participantId);
        this.onParticipantLeft?.(participantId);
      });

      call.on('error', (error) => {
        log.error({ error, participantId }, 'Call error');
        this.connections.delete(participantId);
        this.onParticipantLeft?.(participantId);
      });
    });
  }

  /**
   * Toggles the local audio track state.
   * @param {boolean} forceMute - Whether to force mute the audio
   */
  async toggleAudio(forceMute) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !forceMute;
      });
      // Notify about track state change
      this.onTrackStateChange?.(this.peer.id, 'audio', !forceMute);
    }
  }

  /**
   * Toggles the local video track state.
   * @param {boolean} forceDisable - Whether to force disable the video
   */
  async toggleVideo(forceDisable) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = !forceDisable;
      });
      // Notify about track state change
      this.onTrackStateChange?.(this.peer.id, 'video', !forceDisable);
    }
  }

  /**
   * Initiates screen sharing.
   * @returns {Promise<void>}
   */
  async shareScreen() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      });
      
      // Replace video track
      const videoTrack = screenStream.getVideoTracks()[0];
      const senders = this.connections.forEach(connection => {
        const sender = connection.peerConnection.getSenders()
          .find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      // Handle stop sharing
      videoTrack.onended = () => {
        const originalTrack = this.localStream.getVideoTracks()[0];
        this.connections.forEach(connection => {
          const sender = connection.peerConnection.getSenders()
            .find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(originalTrack);
          }
        });
      };
    } catch (error) {
      log.error({ error }, 'Failed to share screen');
    }
  }

  /**
   * Disconnects from all peers and cleans up resources.
   */
  disconnect() {
    if (this.peer) {
      this.connections.forEach(connection => {
        try {
          connection.close();
        } catch (e) {
          log.warn('Error closing connection:', e);
        }
      });
      this.connections.clear();

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      try {
        this.peer.destroy();
      } catch (e) {
        log.warn('Error destroying peer:', e);
      }
      this.peer = null;
    }
  }

  /**
   * Removes a connection with a remote participant.
   * @param {string} participantId - ID of the remote participant
   */
  removeConnection(participantId) {
    log.debug({ participantId }, 'Removing connection');
    const connection = this.connections.get(participantId);
    if (connection) {
      connection.close();
      this.connections.delete(participantId);
      this.onParticipantLeft?.(participantId);
    }
  }
} 