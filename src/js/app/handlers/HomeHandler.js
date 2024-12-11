import { ModalManager } from '../../ui/Modal.js';
import { ErrorModal } from '../../ui/components/ErrorModal.js';
import { appLogger as logger } from '../../utils/logger.js';
import { router } from '../../router/index.js';

export class HomeHandler {
    /**
     * @param {ServiceManager} serviceManager
     */
    constructor(serviceManager) {
        this.serviceManager = serviceManager;
        this.modal = null;
    }

    async initialize() {
        try {
            logger.debug('Initializing home page');
            // Check for existing session
            sessionStorage.setItem('lastPath', window.location.pathname);


            const pin = sessionStorage.getItem('PIN');
            const roomId = sessionStorage.getItem('roomId');
            if (pin && roomId) {
                logger.debug('Found existing session');
                await router.navigate(`/room/${roomId}`);
                return;
            }

            // Initialize modal only if the container exists
            const modalContainer = document.getElementById('createRoomModal');
            if (modalContainer) {
                const modal = new ModalManager(modalContainer);
                this.serviceManager.setService('modalManager', modal);

                this.serviceManager.getService('modalManager').onSubmit = async (userName, roomName, maxParticipants) => {
                    try {
                      const { localStream } = await this.serviceManager.getService('roomManager').createRoom(userName, maxParticipants, roomName);
                      logger.info({
                        hasVideo: localStream?.getVideoTracks().length > 0,
                        hasAudio: localStream?.getAudioTracks().length > 0
                      }, 'Room created');
                      sessionStorage.setItem('userName', userName);
                    } catch (error) {
                      logger.error({ error }, 'Failed to create room');
                      alert('Failed to create room. Please try again.');
                    }
                  };
            }
            else {
                throw new Error('Failed to initialize home page');
            }

            this.setupCreateRoomHandler();
        } catch (error) {
            logger.error({ error }, 'Failed to initialize home page');
            logger.error('Failed to initialize home page');
        }
    }

    setupCreateRoomHandler() {
        const createRoomBtn = document.getElementById('createRoomBtn');
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => this.serviceManager.getService('modalManager').show());
        }
    }
} 