import { Peer } from 'peerjs';

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
      // Clean up any existing connections
      await this.disconnect();
      
      await this._createPeer(userId);
      await this.initializeMedia();
      return this.peer;
    } catch (error) {
      console.error('Failed to initialize peer:', error);
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
        console.log(`Connection attempt ${attemptCount}...`);

        this.peer = new Peer(userId, {
          host: 'localhost',
          port: 9000,
          path: '/myapp',
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          },
          retries: 0
        });

        const timeout = setTimeout(() => {
          this.peer.destroy();
          attempt();
        }, 5000);

        this.peer.on('open', (id) => {
          console.log('Connected with ID:', id);
          clearTimeout(timeout);
          this._setupPeerEvents();
          resolve(this.peer);
        });

        this.peer.on('error', (error) => {
          console.error('PeerJS error:', error);
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
    this.peer.on('open', (id) => {
      console.log('Connected with ID:', id);
    });

    this.peer.on('call', async (call) => {
      await this._handleIncomingCall(call);
    });

    this.peer.on('error', (error) => {
      console.error('PeerJS error:', error);
    });
  }

  /**
   * Initializes local media stream with audio and video.
   * @returns {Promise<MediaStream>} The local media stream
   * @throws {Error} If media access fails
   */
  async initializeMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }

  /**
   * Establishes a connection with a remote participant.
   * @param {string} participantId - ID of the remote participant
   * @returns {Promise<void>}
   */
  async connectToParticipant(participantId) {
    if (!this.localStream) {
      await this.initializeMedia();
    }

    const call = this.peer.call(participantId, this.localStream);
    await this._handleConnection(call);
  }

  /**
   * Handles incoming call from a remote participant.
   * @param {MediaConnection} call - The incoming call object
   * @returns {Promise<void>}
   * @private
   */
  _handleIncomingCall(call) {
    call.answer(this.localStream);
    return this._handleConnection(call);
  }

  /**
   * Sets up media connection with a participant.
   * @param {MediaConnection} call - The media connection object
   * @returns {Promise<void>}
   * @private
   */
  _handleConnection(call) {
    const participantId = call.peer;
    this.connections.set(participantId, call);

    call.on('stream', (remoteStream) => {
      // Listen for track state changes
      remoteStream.getTracks().forEach(track => {
        track.onmute = () => this.onTrackStateChange?.(participantId, track.kind, false);
        track.onunmute = () => this.onTrackStateChange?.(participantId, track.kind, true);
      });
      
      this.onStreamUpdate?.(participantId, remoteStream);
    });

    call.on('close', () => {
      this.connections.delete(participantId);
      this.onParticipantLeft?.(participantId);
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
      console.error('Error sharing screen:', error);
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
          console.warn('Error closing connection:', e);
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
        console.warn('Error destroying peer:', e);
      }
      this.peer = null;
    }
  }
} 