/**
 * Main application entry point.
 * Sets up routing and initializes core services.
 */
import { router } from './router.js';
import { RoomManager } from './services/RoomManager.js';
import { RoomUI } from './ui/RoomUI.js';
import { ModalManager } from './ui/Modal.js';
import { logger as log } from './utils/logger.js';
const roomManager = new RoomManager();
let modalManager;
let roomUI;

// Make router globally available
window.appRouter = router;

// Initialize the router when the page loads
document.addEventListener('DOMContentLoaded', () => {
  router.init();
});

/**
 * Handles route changes and manages page-specific initialization.
 * @param {string} path - The current route path
 */
router.onRouteChange = async (path) => {
  if (path === '/') {
    // Clean up any existing room
    if (roomUI) {
      log.info('Cleaning up existing room');
      roomManager.leaveRoom();
      roomUI = null;
    }

    // Initialize modal on home page
    modalManager = new ModalManager();
    
    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
      createRoomBtn.addEventListener('click', () => {
        modalManager.onSubmit = async (userName, roomName) => {
          try {
            const { roomId, localStream } = await roomManager.createRoom(userName, roomName);
            log.info({
              roomId,
              hasVideo: localStream?.getVideoTracks().length > 0,
              hasAudio: localStream?.getAudioTracks().length > 0
            }, 'Room created');
            
            await window.appRouter.navigate(`/room/${roomId}`);
          } catch (error) {
            log.error({ error }, 'Failed to create room');
            alert('Failed to create room. Please try again.');
          }
        };
        modalManager.show();
      });
    }
  } 
  else if (path.startsWith('/room/')) {
    try {
      const roomId = path.split('/').pop();
      
      // Clean up any existing room UI
      if (roomUI) {
        log.debug('Cleaning up existing room UI');
        roomUI = null;
      }

      // Initialize room UI
      roomUI = new RoomUI(roomManager);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      await roomUI.initialize();
      
      log.debug('Room UI initialized');
      
      // Set up room manager callbacks
      roomManager.onParticipantListUpdate = () => {
        // Update UI as needed
      };
      
      roomManager.onStreamUpdate = (participantId, stream) => {
        log.info({
          participantId,
          hasVideo: stream.getVideoTracks().length > 0,
          hasAudio: stream.getAudioTracks().length > 0
        }, 'Stream received from participant');
        roomUI.addParticipantVideo(participantId, stream);
      };
      
      // Only join room if we're not already connected
      if (!roomManager.isConnected) {
        log.info({ roomId }, 'Joining room');
        const { localStream } = await roomManager.joinRoom(roomId);
        log.debug('Setting up local stream');
        roomUI.setLocalStream(localStream);
      } else {
        log.debug('Using existing stream');
        roomUI.setLocalStream(roomManager.webrtc.localStream);
      }
    } catch (error) {
      log.error({ error }, 'Failed to join room');
      alert('Failed to join room. Returning to home page.');
      await window.appRouter.navigate('/');
    }
  }
}; 