import { router } from './router.js';
import { RoomManager } from './services/RoomManager.js';
import { RoomUI } from './ui/RoomUI.js';
import { ModalManager } from './ui/Modal.js';

const roomManager = new RoomManager();
let modalManager;
let roomUI;

// Make router globally available
window.appRouter = router;

// Initialize the router when the page loads
document.addEventListener('DOMContentLoaded', () => {
  router.init();
});

// Handle route changes
router.onRouteChange = async (path) => {
  if (path === '/') {
    // Clean up any existing room
    if (roomUI) {
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
            const { roomId } = await roomManager.createRoom(userName, roomName);
            await window.appRouter.navigate(`/room/${roomId}`);
          } catch (error) {
            console.error('Failed to create room:', error);
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
      
      // Clean up any existing room
      if (roomUI) {
        roomManager.leaveRoom();
        roomUI = null;
      }

      // Initialize room UI first
      roomUI = new RoomUI(roomManager);
      
      // Wait a bit longer for the DOM to be ready
      await new Promise(resolve => setTimeout(resolve, 200));
      await roomUI.initialize();
      
      // Set up room manager callbacks
      roomManager.onParticipantListUpdate = () => {
        // Update UI as needed
      };
      
      roomManager.onStreamUpdate = (participantId, stream) => {
        roomUI.addParticipantVideo(participantId, stream);
      };
      
      // Join room and set up local video
      const { localStream } = await roomManager.joinRoom(roomId);
      roomUI.setLocalStream(localStream);
    } catch (error) {
      console.error('Failed to join room:', error);
      alert('Failed to join room. Returning to home page.');
      await window.appRouter.navigate('/');
    }
  }
}; 