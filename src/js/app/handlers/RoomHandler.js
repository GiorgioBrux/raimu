import { RoomUI } from '../../services/RoomUI.js';
import { ErrorModal } from '../../ui/room/ErrorModal.js';
import { logger } from '../../utils/logger.js';
import { router } from '../../router/index.js';
import { MediaSettings } from '../../ui/components/mediaSettings/index.js';
import { MediaControls } from '../../ui/room/MediaControls.js';

/**
 * @class
 * @classdesc Handles the room page
 */
export class RoomHandler {
    /**
     * @param {ServiceManager} serviceManager
     * @constructor
     */
    constructor(serviceManager) {
        this.serviceManager = serviceManager;
    }

    /**
     * Initializes the room page
     * @param {string} roomId
     */
    async initialize(roomId) {

        // Validate error modal exists for room page
        const errorModal = document.getElementById('errorModal');
        if (!errorModal) {
            logger.error('Error modal not found');
            throw new Error('Missing error modal element');
        }

        // Check for PIN before proceeding
        if (sessionStorage.getItem('PIN') == null) {
            new ErrorModal(errorModal).show();
            return;
        }

        sessionStorage.setItem('lastPath', window.location.pathname);

        try {
            await this.setupRoom(roomId);
            await this.joinRoom(roomId);
            logger.debug({ roomId }, 'Room page initialized');
        } catch (error) {
            logger.error({ error, roomId }, 'Failed to initialize room');
            this.handleError(error);
        }
    }

    /**
     * Sets up room services and UI
     * @private
     */
    async setupRoom(roomId) {
        /** @type {import('../../services/RoomManager.js').RoomManager} */
        const roomManager = this.serviceManager.getService('roomManager');
        
        // Update RoomManager's roomId to match the current room
        roomManager.roomId = roomId;
        roomManager.webrtc.setRoomId(roomId);

        roomManager.PIN = sessionStorage.getItem('PIN');
        roomManager.userName = sessionStorage.getItem('userName');
        roomManager.roomName = sessionStorage.getItem('roomName');

        logger.debug({ 
            updatedRoomId: roomId,
            managerRoomId: roomManager.roomId,
            webrtcRoomId: roomManager.webrtc.roomId,
            sessionStorageRoomId: sessionStorage.getItem('roomId')
        }, 'Updated room IDs before UI initialization');

        // Initialize room UI
        const roomUI = new RoomUI(roomManager);
        await roomUI.initialize();
        roomManager.setRoomUI(roomUI);
        this.serviceManager.setService('roomUI', roomUI);

        this.setupRoomCallbacks(roomManager);


        logger.debug('Room page initialized');
    }

    /**
     * Joins the room and sets up streams
     * @private
     */
    async joinRoom(roomId) {
        const roomManager = this.serviceManager.getService('roomManager');
        const roomUI = this.serviceManager.getService('roomUI');

        // Only join room if we're not already connected
        if (!roomManager.isConnected) {
            logger.info({ roomId }, 'Joining room');
            // We should get media settings here
            const mediaSettings = this.serviceManager.getService('mediaSettings');
            const settings = mediaSettings ? await mediaSettings.getSettings() : null;
            
            // Pass settings to joinRoom
            const { localStream } = await roomManager.joinRoom(roomId, settings);
            logger.debug('Setting up local stream');
            roomUI.setLocalStream(localStream);
        } else {
            logger.debug('Using existing stream');
            roomUI.setLocalStream(roomManager.webrtc.localStream);
        }
    }

    /**
     * Sets up room event callbacks
     * @private
     */
    setupRoomCallbacks(roomManager) {
        // Add participant tracking
        /** @type {Set<string>} */
        this.participants = new Set();

        const roomUI = this.serviceManager.getService('roomUI');

        roomManager.onJoinError = () => {
            logger.debug('Join error received, redirecting to home');
            sessionStorage.clear();
            window.appRouter.navigate('/');
        };

        roomManager.onStreamUpdate = (participantId, stream) => {
            const participantName = roomManager.participants.get(participantId)?.name || 'Anonymous';
            logger.info({
                participantId,
                participantName,
                hasVideo: stream.getVideoTracks().length > 0,
                hasAudio: stream.getAudioTracks().length > 0
            }, 'Stream received from participant');
            roomUI.addParticipantVideo(participantId, participantName, stream);
        };

        roomManager.onParticipantJoined = (participant) => {
            this.participants.add(participant.id);
            logger.info({ 
                participant,
                totalParticipants: this.participants.size 
            }, 'Participant joined');
        };

        roomManager.onParticipantLeft = (participant) => {
            this.participants.delete(participant);
            roomUI.removeParticipantVideo(participant);
            logger.info({ 
                participant,
                remainingParticipants: this.participants.size 
            }, 'Participant left');
        };

        // Add connection state handling
        roomManager.onConnectionStateChange = (state) => {
            logger.info({ state }, 'WebRTC connection state changed');
            if (state === 'failed' || state === 'disconnected') {
                this.handleError(new Error('Connection lost'));
            }
        };

        roomManager.onError = (error) => {
            logger.error({ error }, 'Room error occurred');
            this.handleError(error);
        };
    }

    async cleanup() {
        const roomUI = this.serviceManager.getService('roomUI');
        if (roomUI) {
            await roomUI.cleanup();
            logger.debug('Room UI cleaned up');
        }

        // Clear session storage
        sessionStorage.clear();
    }

    handleError(error) {
        const errorModal = document.getElementById('errorModal');
        if (errorModal) {
            new ErrorModal(errorModal).show();
        } else {
            logger.error({ error }, 'Room error occurred');
        }
        router.navigate('/');
    }
} 