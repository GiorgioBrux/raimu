/**
 * Main application entry point.
 * Sets up routing and initializes core services.
 */
import { router } from './router.js';
import { RoomManager } from './services/RoomManager.js';
import { RoomUI } from './ui/RoomUI.js';
import { ModalManager } from './ui/Modal.js';
import { MediaSettings } from './ui/components/mediaSettings/index.js';
import { RoomCodeInput } from './ui/components/RoomCodeInput.js';
import { logger as log } from './utils/logger.js';
import { RoomStatusManager } from './ui/components/JoinRoomStatusManager.js';
import { WebSocketService } from './services/WebSocket.js';
import { ErrorModal } from './ui/components/ErrorModal.js';
// Create shared WebSocket service
const ws = new WebSocketService('ws://localhost:8080/ws');
log.debug('WebSocket service created');

const roomManager = new RoomManager(ws);
log.debug('RoomManager created with WebSocket service');
let modalManager;
let roomUI;
let mediaSettings;

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
    // Set initial path
    sessionStorage.setItem('lastPath', window.location.pathname);
    log.debug({ 
      initialPath: window.location.pathname 
    }, 'Initial path set');

    // Clean up any existing room or media settings
    if (roomUI) {
      log.info('Cleaning up existing room');
      roomManager.leaveRoom();
      roomUI = null;
    }
    if (mediaSettings) {
      log.debug('Cleaning up media settings');
      mediaSettings.destroy();
      mediaSettings = null;
    }

    // Initialize modal on home page
    modalManager = new ModalManager();
    
    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
      createRoomBtn.addEventListener('click', () => {
        modalManager.onSubmit = async (userName, roomName, maxParticipants) => {
          try {
            const { localStream } = await roomManager.createRoom(userName, maxParticipants, roomName);
            log.info({
              hasVideo: localStream?.getVideoTracks().length > 0,
              hasAudio: localStream?.getAudioTracks().length > 0
            }, 'Room created');
            sessionStorage.setItem('userName', userName);
          } catch (error) {
            log.error({ error }, 'Failed to create room');
            alert('Failed to create room. Please try again.');
          }
        };
        modalManager.show();
      });
    }

    // Store the original message handler
    const originalHandler = roomManager.ws.onMessage;

    // Wait for roomCreated message on websocket
    ws.onMessage = (message) => {
      const data = JSON.parse(message);
      if (data.type === 'roomCreated') {
        log.info({ room: data.room }, 'Got info about created room');
        sessionStorage.setItem('PIN', data.room.PIN);
        sessionStorage.setItem('roomName', data.room.name);
        sessionStorage.setItem('roomId', data.room.id);
        
        log.debug({ 
            newRoomId: data.room.id,
            storedRoomId: sessionStorage.getItem('roomId'),
            currentRoomManagerId: roomManager.roomId
        }, 'Room ID set in sessionStorage');
        
        // Restore the original handler before navigating
        ws.onMessage = originalHandler;
        
        window.appRouter.navigate(`/room/${data.room.id}`);
      } else {
        // Pass other messages to the original handler
        originalHandler?.(message);
      }
    };
  } 
  else if (path === '/join') {
    // Set initial path
    sessionStorage.setItem('lastPath', window.location.pathname);
    log.debug({ 
      initialPath: window.location.pathname 
    }, 'Initial path set');

    // Clean up any existing instances
    if (mediaSettings) {
      log.debug('Cleaning up previous media settings');
      mediaSettings.destroy();
    }

    // Initialize media settings with the container element
    const mediaSettingsContainer = document.querySelector('#mediaSettings');
    if (mediaSettingsContainer) {
      log.debug('Initializing media settings for join page');
      mediaSettings = new MediaSettings(mediaSettingsContainer);
    }

    // Initialize room status manager with shared WebSocket service
    const statusContainer = document.querySelector('[data-room-status]');
    const roomStatus = new RoomStatusManager(statusContainer, ws);

    // Initialize room code input with status check callback
    const roomCodeInput = new RoomCodeInput((roomCode) => {
      roomStatus.checkRoom(roomCode);
    });

    // Clean up on route change
    router.cleanupHandlers['/join'] = () => {
      if (roomStatus) roomStatus.destroy();
      if (mediaSettings) mediaSettings.destroy();
    };

    // Handle form submission
    const joinForm = document.querySelector('form');
    if (joinForm) {
      joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const displayName = document.querySelector('#displayName')?.value;
        
        if (!mediaSettings) {
          log.error('Media settings not initialized');
          return;
        }

        try {
          const settings = await mediaSettings.getSettings();
          // Get room code from the three input fields
          const roomCodeParts = Array.from(document.querySelectorAll('[data-room-code-part]'))
            .map(input => input.value)
            .join('-');
          
          if (!roomCodeParts) {
            log.error('No room code provided');
            return;
          }

          // Store settings and name in sessionStorage for use in room
          sessionStorage.setItem('userSettings', JSON.stringify({
            displayName,
            videoEnabled: settings.videoEnabled,
            audioEnabled: settings.audioEnabled,
            selectedDevices: settings.selectedDevices
          }));

          log.info({ roomId: roomCodeParts, displayName }, 'Joining room');
          await router.navigate(`/room/${roomCodeParts}`);
        } catch (error) {
          log.error({ error }, 'Error joining room');
        }
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

      if(sessionStorage.getItem('PIN') == null) {
        new ErrorModal(document.getElementById('errorModal')).show();
        return;
      }

      // Update RoomManager's roomId to match the current room
      roomManager.roomId = roomId;
      roomManager.webrtc.setRoomId(roomId);
      
      log.debug({ 
          updatedRoomId: roomId,
          managerRoomId: roomManager.roomId,
          webrtcRoomId: roomManager.webrtc.roomId,
          sessionStorageRoomId: sessionStorage.getItem('roomId')
      }, 'Updated room IDs before UI initialization');

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

// Remove all the refresh detection code and replace with this simpler approach

window.addEventListener('beforeunload', () => {
  const currentPath = window.location.pathname;
  const lastPath = sessionStorage.getItem('lastPath');

  // If we're on the same path as before, it's a refresh
  if (currentPath === lastPath) {
    sessionStorage.clear();
    log.debug('Session storage cleared on page refresh');
    // Reset the last path to the current path for error modal
    sessionStorage.setItem('lastPath', currentPath);
  } else {
    // If paths are different, just update the last path
    sessionStorage.setItem('lastPath', currentPath);
  }

  // Always clean up WebSocket
  if (ws) {
    ws.disconnect();
    log.debug('WebSocket disconnected');
  }
});