import { WebRTCService } from './WebRTC.js';
import { WebSocketService } from './WebSocket.js';
import { RoomEventHandler } from './RoomEventHandler.js';
import { roomLogger as log } from '../utils/logger.js';
import { 
    generateUserId, 
    getConnectionInfo, 
    handleConnectionError 
} from '../utils/roomUtils.js';

/**
 * Manages room state and coordinates WebRTC connections between participants.
 * Acts as a coordinator between WebRTC, WebSocket and UI events.
 * @class
 */
export class RoomManager {
    /**
     * Creates a new RoomManager instance
     * @param {WebSocketService} websocketService - WebSocket service instance for room communication
     */
    constructor(websocketService) {
        /** @type {WebRTCService} WebRTC service for peer connections */
        this.webrtc = new WebRTCService();

        /** @type {WebSocketService} WebSocket service for signaling */
        this.ws = websocketService;

        /** @type {RoomEventHandler} Handler for room-related events */
        this.eventHandler = new RoomEventHandler(this);

        // Explicitly bind the message handler
        this.ws.onMessage = this._handleWsMessage.bind(this);
        log.debug('WebSocket message handler bound');

        /** @type {string|null} Current user's ID */
        this.userId = null;

        /** @type {string|null} Room PIN code */
        this.PIN = null;

        /** @type {string|null} User's display name */
        this.userName = null;

        /** @type {string|null} Room name */
        this.roomName = null;

        /** @type {Map<string, {id: string, name: string}>} Map of participant IDs to participant info */
        this.participants = new Map();

        /** @type {boolean} Whether connected to room */
        this.isConnected = false;

        // Initialize roomId from sessionStorage if available
        /** @type {string|null} Current room ID */
        this.roomId = sessionStorage.getItem('roomId');
        if (this.roomId) {
            this.webrtc.setRoomId(this.roomId);
            log.debug({ roomId: this.roomId }, 'Initialized room ID from session storage');
        }

        /** @type {Function|null} Callback when participant list changes */
        this.onParticipantListUpdate = null;

        /** @type {Function|null} Callback when media streams update */
        this.onStreamUpdate = null;
        
        /** @type {Function|null} Callback when participant leaves */
        this.onParticipantLeft = null;

        this._setupEventHandlers();
    }

    /**
     * Sets up event handlers for both WebSocket and WebRTC events.
     * @private
     */
    _setupEventHandlers() {
        // WebSocket message handler - routes to appropriate event handler
        this.ws.onMessage = this._handleWsMessage.bind(this);
    }

    /**
     * Gets list of participants in a room
     * @param {string} roomId - Room ID to get participants for
     * @returns {Promise<string[]>} List of participant IDs
     */
    async getParticipantsInRoom(roomId) {
        return new Promise((resolve) => {
            const handler = (msg) => {
                try {
                    const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
                    log.debug({ roomId, participants: data.participants }, 'Received participants list');
                    
                    if (data.type === 'participants' && data.roomId === roomId) {
                        this.ws.onMessage = this._handleWsMessage.bind(this);  // Restore normal handler
                        // Extract just the IDs if participants are objects
                        const participantIds = data.participants.map(p => 
                            typeof p === 'object' ? p.id : p
                        );
                        resolve(participantIds);
                    }
                } catch (error) {
                    log.error({ error }, 'Failed to handle participants message');
                    resolve([]);
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
     * @returns {Promise<{localStream: MediaStream}>}
     * @throws {Error} If room creation fails
     */
    async createRoom(userName, maxParticipants, roomName = null) {
        try {
            await this.disconnectIfNeeded();

            this.userName = userName;
            this.userId = generateUserId();
            this.roomName = roomName;

            // Initialize WebRTC and get local stream first
            if (!this.isConnected) {
                await this.initializeConnection(this.userId);
            }

            log.info({ roomName: this.roomName, maxParticipants: maxParticipants, userId: this.userId }, 'Creating room');
            
            // Notify WebSocket server about new room
            this.ws.send({
                type: 'createRoom',
                roomName: this.roomName,
                userId: this.userId,
                userName: this.userName,
                maxParticipants: maxParticipants
            });
            
            // Make sure we return the local stream
            return {
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
            log.debug({ 
                joiningRoomId: roomId,
                currentRoomId: this.roomId,
                storedRoomId: sessionStorage.getItem('roomId')
            }, 'Joining room - initial state');

            await this.disconnectIfNeeded();

            log.debug({ 
                beforeSet: { 
                    roomId: this.roomId, 
                    webrtcRoomId: this.webrtc.roomId 
                }
            }, 'Room IDs before setting');

            // Store roomId in both RoomManager and sessionStorage
            this.roomId = roomId;
            sessionStorage.setItem('roomId', roomId);
            this.webrtc.setRoomId(roomId);

            log.debug({ 
                afterSet: { 
                    managerRoomId: this.roomId,
                    webrtcRoomId: this.webrtc.roomId,
                    sessionStorageRoomId: sessionStorage.getItem('roomId')
                }
            }, 'Room IDs after setting');

            if (!this.userId) {
                this.userId = generateUserId();
            }

            log.info({ 
                roomId, 
                userId: this.userId,
                connectionState: this.isConnected ? 'connected' : 'disconnected'
            }, 'Joining room');

            if (!this.isConnected) {
                await this.initializeConnection(this.userId);
            }

            // Get existing participants before joining
            const existingParticipants = await this.getParticipantsInRoom(roomId);
            log.debug({ 
                participants: existingParticipants,
                participantCount: existingParticipants.length,
                ourId: this.userId
            }, 'Found existing participants');

            // Join room via WebSocket
            this.ws.send({
                type: 'joinRoom',
                roomId: this.roomId,
                userId: this.userId,
                userName: this.userName
            });

            // Connect to each participant with better error handling
            const connectionPromises = existingParticipants
                .filter(participantId => {
                    // Make sure we're working with the ID string
                    const id = typeof participantId === 'object' ? participantId.id : participantId;
                    return id !== this.userId;
                })
                .map(async participantId => {
                    try {
                        // Extract ID if it's an object
                        const id = typeof participantId === 'object' ? participantId.id : participantId;
                        log.debug({ participantId: id }, 'Attempting to connect to participant');
                        await this.webrtc.connectToParticipant(id);
                        log.debug({ participantId: id }, 'Successfully connected to participant');
                    } catch (error) {
                        log.error({ 
                            error,
                            participantId: typeof participantId === 'object' ? participantId.id : participantId,
                            errorType: error.type,
                            errorMessage: error.message,
                            stack: error.stack
                        }, 'Failed to connect to participant');
                    }
                });

            await Promise.allSettled(connectionPromises);

            return this.getConnectionInfo();
        } catch (error) {
            log.error({ 
                error,
                roomId,
                userId: this.userId,
                connectionState: this.isConnected,
                webrtcState: this.webrtc?.peer?.disconnected ? 'disconnected' : 'connected'
            }, 'Failed to join room');
            throw error;
        }
    }

    /**
     * Updates the PIN of the room
     * @param {string} PIN - PIN of the room
     */
    async updatePIN(PIN) {
        this.PIN = PIN;
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

        this.webrtc.onStreamUpdate = (participantId, stream) => {
            this.onStreamUpdate?.(participantId, stream);
        };

        this.webrtc.onTrackStateChange = (participantId, trackKind, enabled, roomId) => {
            log.debug({ 
                participantId,
                trackKind,
                enabled,
                callbackRoomId: roomId,
                managerRoomId: this.roomId,
                webrtcRoomId: this.webrtc.roomId
            }, 'Track state change triggered');

            this.ws.send({
                type: 'trackStateChange',
                userId: participantId,
                roomId: roomId || this.roomId,
                trackKind,
                enabled
            });
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
            log.debug({ roomId: this.roomId }, 'Leaving room');
            sessionStorage.removeItem('roomId');  // Clear the roomId from sessionStorage
            this.webrtc.disconnect();
            this.cleanup();
        }
    }

    /**
     * Cleans up room state
     * @private
     */
    cleanup() {
        log.debug({ 
            beforeCleanup: { 
                roomId: this.roomId, 
                webrtcRoomId: this.webrtc.roomId 
            }
        }, 'Room IDs before cleanup');

        this.participants.clear();
        // Don't clear roomId during cleanup anymore
        this.userName = null;
        this.isConnected = false;

        log.debug({ 
            afterCleanup: { 
                roomId: this.roomId, 
                webrtcRoomId: this.webrtc.roomId 
            }
        }, 'Room IDs after cleanup');
    }

    /**
     * Gets current connection information
     * @returns {{roomId: string, localStream: MediaStream}}
     */
    getConnectionInfo() {
        return getConnectionInfo(this.roomId, this.webrtc.localStream);
    }

    /**
     * Handles incoming WebSocket messages
     * @private
     */
    _handleWsMessage(msg) {
        try {
            const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
            log.debug({ 
                messageType: data.type,
                messageData: data,
                hasEventHandler: !!this.eventHandler
            }, 'Handling WebSocket message');
            
            const handlers = {
                userJoined: this.eventHandler.handleUserJoined.bind(this.eventHandler),
                userLeft: this.eventHandler.handleUserLeft.bind(this.eventHandler),
                participants: this.eventHandler.handleParticipantsList.bind(this.eventHandler),
                trackStateChange: this.eventHandler.handleTrackStateChange.bind(this.eventHandler),
                roomCreated: this.eventHandler.handleRoomCreated.bind(this.eventHandler)
            };

            const handler = handlers[data.type];
            if (handler) {
                log.debug({ messageType: data.type }, 'Found handler, executing');
                handler(data);
            } else {
                log.warn({ messageType: data.type }, 'No handler found for message type');
            }
        } catch (error) {
            log.error({ error, rawMessage: msg }, 'Error handling WebSocket message');
        }
    }

    set roomId(id) {
        this._roomId = id;
        this.webrtc.setRoomId(id);
        log.debug({ 
            newRoomId: id, 
            webrtcRoomId: this.webrtc.roomId 
        }, 'RoomManager roomId updated');
    }

    get roomId() {
        return this._roomId;
    }
}