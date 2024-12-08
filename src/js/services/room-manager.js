import { WebRTCService } from './webrtc';

/**
 * Manages room state and coordinates WebRTC connections between participants
 */
export class RoomManager {
    constructor() {
      this.webrtc = new WebRTCService();
      this.roomId = null;
      this.userName = null;
      this.participants = new Map();
      this.isConnected = false;
  
      // Callbacks that can be set by consumers
      this.onParticipantListUpdate = null;
      this.onStreamUpdate = null;
    }
  
    /**
     * Creates a new room with the given user name
     * @param {string} userName - Name of the user creating the room
     * @param {string} [roomName=''] - Optional custom room name
     * @returns {Promise<{roomId: string, localStream: MediaStream}>}
     */
    async createRoom(userName, roomName = '') {
      try {
        await this.disconnectIfNeeded();
  
        this.userName = userName;
        this.roomId = roomName || this.generateRoomId();
        
        await this.initializeConnection(this.roomId);
        
        return this.getConnectionInfo();
      } catch (error) {
        this.handleConnectionError('Error creating room:', error);
        throw error;
      }
    }
  
    /**
     * Joins an existing room
     * @param {string} roomId - ID of the room to join
     * @param {string} userName - Name of the user joining
     * @returns {Promise<{roomId: string, localStream: MediaStream}>}
     */
    async joinRoom(roomId, userName) {
      try {
        await this.disconnectIfNeeded();
  
        this.roomId = roomId;
        this.userName = userName;
        
        const userId = this.generateUserId(roomId);
        await this.initializeConnection(userId);
        await this.webrtc.connectToParticipant(roomId);
        
        return this.getConnectionInfo();
      } catch (error) {
        this.handleConnectionError('Error joining room:', error);
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
     * @param {string} roomId - Room ID to generate user ID for
     * @returns {string}
     * @private
     */
    generateUserId(roomId) {
      return `${roomId}-${crypto.randomUUID()}`;
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
  }