import { Peer } from 'peerjs';
import { webrtcLogger as log } from '../utils/logger.js';

/**
 * Manages WebRTC peer connections and media streams.
 * Handles peer-to-peer connections, media streaming, and participant events.
 */
export class WebRTCService {
  /**
   * Creates a new WebRTCService instance.
   */
  constructor(webrtcConfig) {
    /** @type {Peer|null} The PeerJS connection instance */
    this.peer = null;

    /** @type {MediaStream|null} Local audio/video stream */
    this.localStream = null;

    /** @type {Map<string, RTCPeerConnection>} Map of peer connections */
    this.connections = new Map();

    /** @type {Function|null} Callback when new participant joins */
    this.onParticipantJoined = null;

    /** @type {Function|null} Callback when participant leaves */
    this.onParticipantLeft = null;

    /** @type {Function|null} Callback when media streams update */
    this.onStreamUpdate = null;

    /** @type {Function|null} Callback when track state changes */
    this.onTrackStateChange = null;

    /** @type {string|null} Current room identifier */
    this.roomId = null;

    /** @type {Object} WebRTC configuration */
    this.config = webrtcConfig;
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
    try {
      const support = await this._checkWebRTCSupport();
      log.debug({ 
        support,
        userAgent: navigator.userAgent 
      }, 'Checking WebRTC support');

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
            host: window.location.hostname,
            port: window.location.port,
            path: '/peerjs',
            debug: 2,
            config: this.config
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
    } catch (error) {
      log.error({ error }, 'WebRTC support check failed');
      throw error;
    }
  }

  _checkWebRTCSupport() {
    return new Promise((resolve, reject) => {
      const support = {
        webRTC: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
        audioContext: !!(window.AudioContext || window.webkitAudioContext),
        screenSharing: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
        isWebKit: /WebKit/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent),
        isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      };

      if (!support.webRTC) {
        reject(new Error('WebRTC is not supported in this browser'));
        return;
      }

      resolve(support);
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
      if (!this.localStream) {
        log.debug('Initializing media devices');
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { max: 30 },
            aspectRatio: { ideal: 1.7777777778 }
          },
          audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
            sampleSize: { ideal: 16 },
            latency: { ideal: 0.01 },
            suppressLocalAudioPlayback: true
          }
        };

        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
          
          // Make sure audio track is initially enabled so VAD can process it
          const audioTrack = this.localStream.getAudioTracks()[0];
          if (audioTrack) {
            // We need the track enabled for VAD to process it, but we'll control transmission differently
            audioTrack.enabled = true;
            log.debug({
              trackId: audioTrack.id,
              enabled: audioTrack.enabled,
              muted: audioTrack.muted,
              readyState: audioTrack.readyState,
              constraints: audioTrack.getConstraints()
            }, 'Audio track initialized');
          }
          
          // Create a new audio context
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          
          // Create source from the stream
          const source = audioContext.createMediaStreamSource(this.localStream);
          
          // Create and configure dynamics compressor
          const compressor = audioContext.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-50, audioContext.currentTime);
          compressor.knee.setValueAtTime(40, audioContext.currentTime);
          compressor.ratio.setValueAtTime(12, audioContext.currentTime);
          compressor.attack.setValueAtTime(0, audioContext.currentTime);
          compressor.release.setValueAtTime(0.25, audioContext.currentTime);
          
          // Create gain node for volume control
          const gainNode = audioContext.createGain();
          gainNode.gain.setValueAtTime(0.8, audioContext.currentTime);
          
          // Create noise gate
          const noiseGate = audioContext.createGain();
          noiseGate.gain.setValueAtTime(1.0, audioContext.currentTime);
          
          // Create destination for the processed audio
          const destination = audioContext.createMediaStreamDestination();
          
          // Connect the audio processing chain
          source
            .connect(compressor)
            .connect(gainNode)
            .connect(noiseGate)
            .connect(destination);
          
          // Get the original video track
          const videoTrack = this.localStream.getVideoTracks()[0];
          
          // Create a new MediaStream with the processed audio and original video
          const processedStream = new MediaStream();
          
          // Add the processed audio track
          processedStream.addTrack(destination.stream.getAudioTracks()[0]);
          
          // Add the original video track if it exists
          if (videoTrack) {
            processedStream.addTrack(videoTrack);
          }
          
          // Replace the local stream with the processed stream
          this.localStream = processedStream;
          
          log.debug('Applied audio processing chain');
        } catch (mediaError) {
          log.warn({ error: mediaError }, 'Failed with initial constraints, trying fallback');
          this.localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        }

        log.info({
          tracks: this.localStream.getTracks().map(t => ({
            kind: t.kind,
            label: t.label,
            settings: t.getSettings()
          }))
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
      log.debug({ 
        localId: this.peer?.id, 
        remoteId: participantId,
        peerState: this.peer?.disconnected ? 'disconnected' : 'connected'
      }, 'Attempting to connect to participant');

      if (!this.peer || this.peer.disconnected) {
        throw new Error('Local peer is not initialized or disconnected');
      }

      // Check if we already have a connection to this participant
      if (this.connections.has(participantId)) {
        log.warn({ participantId }, 'Connection already exists, skipping');
        return;
      }

      // Create the connection with detailed logging
      log.debug({ participantId }, 'Creating new peer connection');
      const connection = this.peer.connect(participantId, {
        reliable: true,
        metadata: { type: 'data' }
      });

      if (!connection) {
        throw new Error(`Failed to create connection to ${participantId}`);
      }

      // Set up connection event handlers with improved logging
      connection.on('open', async () => {
        log.info({ participantId }, 'Peer connection opened successfully');
        this.connections.set(participantId, connection);
        
        // Set up media connection after data connection is established
        try {
          if (!this.localStream) {
            await this.initializeMedia();
          }
          
          log.debug({ participantId }, 'Setting up media connection');
          const call = this.peer.call(participantId, this.localStream);
          
          if (!call) {
            throw new Error('Failed to create media call');
          }
          
          await this._handleConnection(call);
          log.debug({ participantId }, 'Media connection established');
        } catch (error) {
          log.error({ error, participantId }, 'Failed to setup media connection');
        }

        // After successful connection, notify RoomUI to update peer connections
        this.roomManager?.roomUI?.updatePeerConnections();
      });

      connection.on('error', (error) => {
        log.error({ 
          error,
          participantId,
          errorType: error.type,
          errorMessage: error.message
        }, 'Peer connection error occurred');
      });

      connection.on('close', () => {
        log.info({ participantId }, 'Peer connection closed');
        this.connections.delete(participantId);
        this.onParticipantLeft?.(participantId);
      });

      // Add timeout to detect connection failures
      const timeout = setTimeout(() => {
        if (!this.connections.has(participantId)) {
          log.error({ participantId }, 'Connection attempt timed out');
          connection.close();
        }
      }, 10000); // 10 second timeout

      return new Promise((resolve, reject) => {
        connection.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        connection.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      log.error({
        error,
        participantId,
        localPeerId: this.peer?.id,
        connectionCount: this.connections.size,
        activeConnections: Array.from(this.connections.keys()),
        peerState: this.peer?.disconnected ? 'disconnected' : 'connected'
      }, 'Failed to connect to participant');
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
      log.debug({ 
        currentRoomId: this.roomId,
        action: 'toggleAudio',
        muted: forceMute
      }, 'Toggling audio');
      this.onTrackStateChange?.(this.peer.id, 'audio', !forceMute, this.roomId);
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
      log.debug({ 
        currentRoomId: this.roomId,
        action: 'toggleVideo',
        disabled: forceDisable
      }, 'Toggling video');
      this.onTrackStateChange?.(this.peer.id, 'video', !forceDisable, this.roomId);
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

    // After disconnect, notify RoomUI to update peer connections
    this.roomManager?.roomUI?.updatePeerConnections();
  }

  /**
   * Removes a connection with a remote participant.
   * @param {string} participantId - ID of the remote participant
   */
  removeConnection(participantId) {
    log.debug({ participantId }, 'Removing WebRTC connection');
    const connection = this.connections.get(participantId);
    if (connection) {
        try {
            connection.close();
            this.connections.delete(participantId);
            log.debug({ participantId }, 'WebRTC connection removed');
        } catch (error) {
            log.error({ error, participantId }, 'Error removing WebRTC connection');
        }
    }
  }

  /**
   * Sets the room ID.
   * @param {string} roomId - The room ID
   */
  setRoomId(roomId) {
    log.debug({ 
      oldRoomId: this.roomId, 
      newRoomId: roomId 
    }, 'Setting WebRTC roomId');
    this.roomId = roomId;
  }

  /**
   * Updates the local stream with a new one
   * @param {MediaStream} newStream - The new stream to use
   */
  async updateLocalStream(newStream) {
    log.debug({
        newStreamTracks: newStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
            id: t.id
        })),
        oldStreamTracks: this.localStream?.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
            id: t.id
        }))
    }, 'Starting stream update');
    
    try {
        const oldStream = this.localStream;
        
        // Only update tracks that have actually changed
        const oldTracks = oldStream?.getTracks() || [];
        const newTracks = newStream.getTracks();
        const tracksToStop = oldTracks.filter(oldTrack => 
            !newTracks.some(newTrack => 
                newTrack.id === oldTrack.id
            )
        );

        this.localStream = newStream;

        // Update all peer connections
        const updatePromises = [];
        for (const [peerId, connection] of this.connections) {
            if (connection.type === 'media' && connection.peerConnection) {
                try {
                    const pc = connection.peerConnection;
                    const senders = pc.getSenders();
                    
                    log.debug({
                        peerId,
                        senders: senders.map(s => ({
                            kind: s.track?.kind,
                            trackEnabled: s.track?.enabled,
                            trackId: s.track?.id
                        }))
                    }, 'Current senders state');

                    // Replace only tracks that have changed
                    for (const track of newTracks) {
                        const sender = senders.find(s => s.track?.kind === track.kind);
                        if (sender && sender.track?.id !== track.id) {
                            log.debug({ 
                                peerId, 
                                trackKind: track.kind,
                                trackEnabled: track.enabled,
                                trackId: track.id,
                                senderTrackId: sender.track?.id
                            }, 'Replacing track');
                            
                            updatePromises.push(
                                sender.replaceTrack(track)
                                    .then(() => {
                                        log.debug({ 
                                            peerId, 
                                            trackKind: track.kind,
                                            newTrackId: track.id,
                                            senderTrackId: sender.track?.id,
                                            trackEnabled: track.enabled,
                                            trackReadyState: track.readyState
                                        }, 'Track replaced successfully');
                                    })
                            );
                        }
                    }
                } catch (error) {
                    log.error({ error, peerId }, 'Failed to update connection');
                }
            }
        }

        // Wait for all track replacements to complete
        await Promise.all(updatePromises);

        // Now stop only the tracks that were actually replaced
        for (const track of tracksToStop) {
            try {
                track.stop();
                log.debug({ 
                    trackKind: track.kind,
                    trackId: track.id,
                    enabled: track.enabled,
                    readyState: track.readyState
                }, 'Old track stopped');
            } catch (error) {
                log.error({ 
                    error, 
                    trackKind: track.kind,
                    trackId: track.id
                }, 'Failed to stop old track');
            }
        }

        // Update track states
        newStream.getTracks().forEach(track => {
            this.onTrackStateChange?.(
                this.peer.id, 
                track.kind, 
                track.enabled, 
                this.roomId
            );
        });

        log.debug({
            hasVideo: newStream.getVideoTracks().length > 0,
            hasAudio: newStream.getAudioTracks().length > 0,
            videoEnabled: newStream.getVideoTracks()[0]?.enabled,
            audioEnabled: newStream.getAudioTracks()[0]?.enabled,
            videoTrackState: newStream.getVideoTracks()[0]?.readyState,
            audioTrackState: newStream.getAudioTracks()[0]?.readyState,
            videoTrackId: newStream.getVideoTracks()[0]?.id,
            audioTrackId: newStream.getAudioTracks()[0]?.id
        }, 'Local stream update completed');

    } catch (error) {
        log.error({ error }, 'Failed to update local stream');
        throw error;
    }
  }
} 