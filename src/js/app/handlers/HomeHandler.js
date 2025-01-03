import { ModalManager } from '../../ui/home/Modal.js';
import { ErrorModal } from '../../ui/room/ErrorModal.js';
import { VoiceSampler } from '../../ui/components/voiceSampler/VoiceSampler.js';
import { appLogger as logger } from '../../utils/logger.js';
import { router } from '../../router/index.js';

export class HomeHandler {
    /**
     * @param {ServiceManager} serviceManager
     */
    constructor(serviceManager) {
        this.serviceManager = serviceManager;
        this.modal = null;
        this.voiceSampler = null;
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

                // Initialize voice sampler
                this.voiceSampler = new VoiceSampler();
                this.serviceManager.setService('voiceSampler', this.voiceSampler);
                logger.debug('Voice sampler initialized');

                this.serviceManager.getService('modalManager').onSubmit = async (userName, roomName) => {
                    try {
                        const voiceSample = await this.voiceSampler.getVoiceSample();
                        if (!voiceSample) {
                            throw new Error('Please record a voice sample of at least 10 seconds before creating the room');
                        }

                        const { localStream } = await this.serviceManager.getService('roomManager').createRoom(userName, roomName, voiceSample);
                        logger.info({
                            hasVideo: localStream?.getVideoTracks().length > 0,
                            hasAudio: localStream?.getAudioTracks().length > 0
                        }, 'Room created');
                        sessionStorage.setItem('userName', userName);
                    } catch (error) {
                        logger.error({ error }, 'Failed to create room');
                        throw error; // Let the modal handle the error display
                    }
                };
            }
            else {
                throw new Error('Cannot find modal container');
            }

            this.setupCreateRoomHandler();
        } catch (error) {
            logger.error({ error }, 'Failed to initialize home page');
        }
    }

    setupCreateRoomHandler() {
        const createRoomBtn = document.getElementById('createRoomBtn');
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => this.serviceManager.getService('modalManager').show());
        }
    }
} 