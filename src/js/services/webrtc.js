import { Peer } from 'peerjs';

export class WebRTCService {
  constructor() {
    this.peer = null;
    this.localStream = null;
    this.connections = new Map();
    this.onParticipantJoined = null;
    this.onParticipantLeft = null;
    this.onStreamUpdate = null;
    this.onTrackStateChange = null;
  }

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

  async connectToParticipant(participantId) {
    if (!this.localStream) {
      await this.initializeMedia();
    }

    const call = this.peer.call(participantId, this.localStream);
    await this._handleConnection(call);
  }

  _handleIncomingCall(call) {
    call.answer(this.localStream);
    return this._handleConnection(call);
  }

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

  async toggleAudio(forceMute) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !forceMute;
      });
    }
  }

  async toggleVideo(forceDisable) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = !forceDisable;
      });
    }
  }

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