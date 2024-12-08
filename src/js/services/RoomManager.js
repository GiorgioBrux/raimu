import { WebRTCService } from './WebRTC.js';
import { WebSocketService } from './WebSocket.js';
import { roomLogger as log } from '../utils/logger.js';

/**
 * Manages room state and coordinates WebRTC connections between participants
 */
export class RoomManager {
    constructor() {
      this.webrtc = new WebRTCService();
      this.ws = new WebSocketService('ws://localhost:8080/ws');
      this.roomId = null;
      this.roomName = null;
      this.userId = null;
      this.userName = null;
      this.participants = new Map();
      this.isConnected = false;
  
      // Callbacks that can be set by consumers
      this.onParticipantListUpdate = null;
      this.onStreamUpdate = null;

      // Set up WebSocket message handler
      this.ws.onMessage = this._handleWsMessage.bind(this);

      this.webrtc.onParticipantLeft = (participantId) => {
        // Clean up participant from our list
        this.participants.delete(participantId);
        // Notify UI
        this.onParticipantLeft?.(participantId);
      };
    }
  
    /**
     * Gets list of participants in a room
     * @param {string} roomId - Room ID to get participants for
     * @returns {Promise<string[]>} List of participant IDs
     */
    async getParticipantsInRoom(roomId) {
      return new Promise((resolve) => {
        // Set up one-time handler for participant list
        const handler = (msg) => {
          try {
            const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
            log.debug({ roomId, participants: data.participants }, 'Received participants list');
            
            if (data.type === 'participants' && data.roomId === roomId) {
              this.ws.onMessage = this._handleWsMessage.bind(this);  // Restore normal handler
              resolve(data.participants);
            }
          } catch (error) {
            log.error({ error }, 'Failed to handle participants message');
            resolve([]);  // Return empty array on error
          }
        };
        
        this.ws.onMessage = handler;
        this.ws.send({
          type: 'getParticipants',
          roomId: roomId
        });
      });
    }
  
    /**
     * Creates a new room with the given user name
     * @param {string} userName - Name of the user creating the room
     * @param {string} [roomName=null] - Optional custom room name
     * @returns {Promise<{roomId: string, localStream: MediaStream}>}
     */
    async createRoom(userName, roomName = null) {
      try {
        await this.disconnectIfNeeded();
  
        this.userName = userName;
        this.userId = this.generateUserId();
        this.roomId = roomName || this.generateRoomId();
        this.roomName = roomName;

        // Initialize WebRTC and get local stream first
        if (!this.isConnected) {
          await this.initializeConnection(this.userId);
          // Add this line to ensure we get the stream
          const localStream = await this.webrtc.initializeMedia();
        }

        log.info({ roomId: this.roomId, userId: this.userId }, 'Creating room');
        
        // Notify WebSocket server about new room
        this.ws.send({
          type: 'createRoom',
          roomId: this.roomId,
          userId: this.userId,
          userName: this.userName
        });
        
        // Make sure we return the local stream
        return {
          roomId: this.roomId,
          localStream: this.webrtc.localStream  // Make sure this is set
        };
      } catch (error) {
        log.error({ error }, 'Failed to create room');
        throw error;
      }
    }
  
    /**
     * Joins an existing room
     * @param {string} roomId - ID of the room to join
     * @returns {Promise<{roomId: string, localStream: MediaStream}>}
     */
    async joinRoom(roomId) {
      try {
        await this.disconnectIfNeeded();

        this.roomId = roomId;
        
        // Only generate new userId if we don't have one
        if (!this.userId) {
          this.userId = this.generateUserId();
        }

        log.info({ roomId, userId: this.userId }, 'Joining room');

        // Initialize WebRTC only once
        if (!this.isConnected) {
          await this.initializeConnection(this.userId);
        }

        // Then join the room via WebSocket to discover other participants
        this.ws.send({
          type: 'joinRoom',
          roomId: this.roomId,
          userId: this.userId,
          userName: this.userName
        });

        // Get and connect to existing participants
        const existingParticipants = await this.getParticipantsInRoom(roomId);
        log.debug({ participants: existingParticipants }, 'Found existing participants');

        // Connect to each participant except ourselves
        for (const participantId of existingParticipants) {
          if (participantId !== this.userId) {
            try {
              await this.webrtc.connectToParticipant(participantId);
            } catch (error) {
              log.error({ error, participantId }, 'Failed to connect to participant');
            }
          }
        }

        return this.getConnectionInfo();
      } catch (error) {
        log.error({ error }, 'Failed to join room');
        throw error;
      }
    }
  
    /**
     * Initializes WebRTC connection and sets up callbacks
     * @param {string} id - Connection ID to initialize with
     * @private
     */
    async initializeConnection(id) {
      await this.webrtc.initialize(id);
      this._setupWebRTCCallbacks();
      this.isConnected = true;
    }
  
    /**
     * Sets up WebRTC event callbacks
     * @private
     */
    _setupWebRTCCallbacks() {
      this.webrtc.onParticipantJoined = (participantId) => {
        if (!this.participants.has(participantId)) {
          this.participants.set(participantId, {
            id: participantId,
            name: 'Anonymous'
          });
          this.onParticipantListUpdate?.();
        }
      };
  
      this.webrtc.onParticipantLeft = (participantId) => {
        if (this.participants.has(participantId)) {
          this.participants.delete(participantId);
          this.onParticipantListUpdate?.();
        }
      };
  
      this.webrtc.onStreamUpdate = (participantId, stream) => {
        this.onStreamUpdate?.(participantId, stream);
      };
    }
  
    /**
     * Disconnects from current room if connected
     * @private
     */
    async disconnectIfNeeded() {
      if (this.isConnected) {
        await this.leaveRoom();
      }
    }
  
    /**
     * Leaves the current room and cleans up connections
     */
    leaveRoom() {
      if (this.isConnected) {
        this.webrtc.disconnect();
        this.cleanup();
      }
    }
  
    /**
     * Cleans up room state
     * @private
     */
    cleanup() {
      this.participants.clear();
      this.roomId = null;
      this.userName = null;
      this.isConnected = false;
    }
  
    /**
     * Generates a unique room ID
     * @returns {string}
     * @private
     */
    generateRoomId() {
      return crypto.randomUUID();
    }
  
    /**
     * Generates a unique user ID for a room
     * @returns {string}
     * @private
     */
    generateUserId() {
      return crypto.randomUUID();
    }
  
    /**
     * Gets current connection information
     * @returns {{roomId: string, localStream: MediaStream}}
     * @private
     */
    getConnectionInfo() {
      return {
        roomId: this.roomId,
        localStream: this.webrtc.localStream
      };
    }
  
    /**
     * Handles connection errors
     * @param {string} message - Error message prefix
     * @param {Error} error - Error object
     * @private
     */
    handleConnectionError(message, error) {
      this.isConnected = false;
      console.error(message, error);
    }
  
    /**
     * Handles incoming WebSocket messages
     * @private
     */
    _handleWsMessage(msg) {
      const data = JSON.parse(msg);

      switch (data.type) {
        case 'userJoined':
          if (data.roomId === this.roomId && data.userId !== this.userId) {
            log.info({ userId: data.userId }, 'New participant joined');
            this.participants.set(data.userId, {
              id: data.userId,
              name: data.userName
            });
            this.onParticipantListUpdate?.();
          }
          break;

        case 'userLeft':
          if (data.roomId === this.roomId) {
            log.info({ userId: data.userId }, 'Participant left');
            this.participants.delete(data.userId);
            this.webrtc.removeConnection(data.userId);
            this.onParticipantListUpdate?.();
          }
          break;

        case 'participants':
          log.debug({ participants: data.participants }, 'Updating participants list');
          this.participants.clear();
          for (const participantId of data.participants) {
            if (participantId !== this.userId) {
              this.participants.set(participantId, {
                id: participantId,
                name: 'Anonymous'
              });
            }
          }
          this.onParticipantListUpdate?.();
          break;
      }
    }
  }