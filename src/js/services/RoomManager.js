import { WebRTCService } from './WebRTC.js';
import { WebSocketService } from './WebSocket.js';
import { RoomEventHandler } from './RoomEventHandler.js';
import { roomLogger as log } from '../utils/logger.js';
import { 
    generateRoomId, 
    generateUserId, 
    getConnectionInfo, 
    handleConnectionError 
} from '../utils/roomUtils.js';

/**
 * Manages room state and coordinates WebRTC connections between participants.
 * Acts as a coordinator between WebRTC, WebSocket and UI events.
 */
export class RoomManager {
    constructor() {
        // Services
        this.webrtc = new WebRTCService();
        this.ws = new WebSocketService('ws://localhost:8080/ws');
        this.eventHandler = new RoomEventHandler(this);

        // State
        this.roomId = null;
        this.userId = null;
        this.userName = null;
        this.participants = new Map();
        this.isConnected = false;

        // UI Callbacks - These are set by RoomUI to handle UI updates
        this.onParticipantListUpdate = null;  // Called when participant list changes
        this.onStreamUpdate = null;           // Called when a new media stream is received
        this.onParticipantLeft = null;        // Called when a participant leaves

        this._setupEventHandlers();
    }

    /**
     * Sets up event handlers for both WebSocket and WebRTC events.
     * - WebSocket events handle room-level communication (join/leave/participants)
     * - WebRTC events handle peer-to-peer media connections
     * @private
     */
    _setupEventHandlers() {
        // WebSocket message handler - routes to appropriate event handler
        this.ws.onMessage = this._handleWsMessage.bind(this);

        // WebRTC event handlers - handle peer connection events
        this.webrtc.onParticipantLeft = (participantId) => {
            this.participants.delete(participantId);
            this.onParticipantLeft?.(participantId);
        };

        this.webrtc.onTrackStateChange = (participantId, trackKind, enabled) => {
            // Broadcast track state changes to all participants via WebSocket
            this.ws.send({
                type: 'trackStateChange',
                userId: participantId,
                roomId: this.roomId,
                trackKind,
                enabled
            });
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
     * @throws {Error} If room creation fails
     */
    async createRoom(userName, roomName = null) {
        try {
            await this.disconnectIfNeeded();

            this.userName = userName;
            this.userId = generateUserId();
            this.roomId = roomName || generateRoomId();
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
            handleConnectionError('Failed to create room', error);
            throw error;
        }
    }

    /**
     * Joins an existing room
     * @param {string} roomId - ID of the room to join
     * @returns {Promise<{roomId: string, localStream: MediaStream}>}
     * @throws {Error} If joining room fails
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
     * Gets current connection information
     * @returns {{roomId: string, localStream: MediaStream}}
     * @private
     */
    getConnectionInfo() {
        return getConnectionInfo(this.roomId, this.webrtc.localStream);
    }

    /**
     * Handles incoming WebSocket messages
     * @private
     */
    _handleWsMessage(msg) {
        const data = JSON.parse(msg);
        const handlers = {
            userJoined: this.eventHandler.handleUserJoined.bind(this.eventHandler),
            userLeft: this.eventHandler.handleUserLeft.bind(this.eventHandler),
            participants: this.eventHandler.handleParticipantsList.bind(this.eventHandler),
            trackStateChange: this.eventHandler.handleTrackStateChange.bind(this.eventHandler)
        };

        const handler = handlers[data.type];
        if (handler) handler(data);
    }
}