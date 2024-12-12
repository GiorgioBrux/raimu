import { MediaSettings } from '../../ui/components/mediaSettings/index.js';
import { RoomCodeInput } from '../../ui/room/RoomCodeInput.js';
import { RoomStatusManager } from '../../ui/join/RoomStatusManager.js';
import { appLogger as logger } from '../../utils/logger.js';
import { router } from '../../router/index.js';

/**
 * @class
 * @classdesc Handles the join page
 */
export class JoinHandler {
    /**
     * @param {ServiceManager} serviceManager
     */
    constructor(serviceManager) {
        this.serviceManager = serviceManager;
        this.mediaSettings = null;
        this.roomStatus = null;
        this.roomCodeInput = null;
    }

    /**
     * Initializes the join page
     */
    async initialize() {
        try {
            // Set initial path
            sessionStorage.setItem('lastPath', window.location.pathname);
            logger.debug({ 
                initialPath: window.location.pathname 
            }, 'Initial path set');

            await this.initializeMediaSettings();
            await this.initializeRoomComponents();

            logger.debug('Join page initialized');
        } catch (error) {
            logger.error({ error }, 'Failed to initialize join page');
            this.handleError(error);
        }
    }

    /**
     * Initializes media settings component
     * @private
     */
    async initializeMediaSettings() {
        const container = document.querySelector('#mediaSettings');
        if (!container) {
            logger.error('Media settings container not found');
            throw new Error('Missing media settings container');
        }

        try {
            this.mediaSettings = new MediaSettings(container);
            this.serviceManager.setService('mediaSettings', this.mediaSettings);
            logger.debug('Media settings initialized');
        } catch (error) {
            logger.error({ error }, 'Failed to initialize media settings');
            throw error;
        }
    }

    /**
     * Initializes room status and code input components
     * @private
     */
    async initializeRoomComponents() {
        const statusContainer = document.querySelector('[data-room-status]');
        if (statusContainer) {
            this.roomStatus = new RoomStatusManager(
                statusContainer, 
                this.serviceManager.getService('ws')
            );
        }

        this.roomCodeInput = new RoomCodeInput((roomCode) => {
            this.roomStatus?.checkRoom(roomCode);
        });
    }

    /**
     * Cleans up the join page
     */
    async cleanup() {
        if (this.mediaSettings) {
            await this.mediaSettings.destroy();
        }
        if (this.roomStatus) {
            this.roomStatus.destroy();
        }
        logger.debug('Join page cleaned up');
    }

    /**
     * Handles page-specific errors
     * @private
     */
    handleError(error) {
        logger.error({ error }, 'Join page error');
        // Show error to user (you might want to add an error display component)
    }
} 