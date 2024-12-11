import { uiLogger as log } from '../../utils/logger.js';

export class RoomStatusManager {
  constructor(statusContainer, websocketService) {
    this.container = statusContainer;
    this.states = {
      loading: this.container.querySelector('[data-status="loading"]'),
      error: this.container.querySelector('[data-status="error"]'),
      success: this.container.querySelector('[data-status="success"]'),
      skeleton: this.container.querySelector('[data-status="skeleton"]')
    };
    
    this.elements = {
      roomName: this.container.querySelector('[data-room-name]'),
      participantList: this.container.querySelector('[data-participant-list]'),
      joinButton: this.container.querySelector('[data-join-button]'),
      inputs: Array.from(document.querySelectorAll('[data-room-code-part]')),
      displayName: document.querySelector('#displayName'),
    };

    this.ws = websocketService;
    this.currentRoomCode = null;
    this.messageHandler = this.handleMessage.bind(this);
    this.ws.onMessage = this.messageHandler;

    // Hide all states except skeleton initially
    Object.values(this.states).forEach(el => {
      if (el !== this.states.skeleton) {
        el.classList.add('hidden');
      }
    });

    // Add input validation
    if (this.elements.joinButton && this.elements.displayName) {
      this.elements.displayName.maxLength = 30;  // Set max length
      this.elements.displayName.addEventListener('input', () => {
        this.validateJoinButton();
      });
    }

    // Initial validation state
    this.validateJoinButton();

    // Add click handler for join button
    if (this.elements.joinButton) {
      this.elements.joinButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleJoinRoom();
      });
    }

    this.currentRoomData = null; // Add this to store room data
  }

  async checkRoom(roomCode) {
    try {
      this.showState('loading');
      this.currentRoomCode = roomCode;

      // Wait 400ms for better visual feedback
      await new Promise(resolve => setTimeout(resolve, 400));

      this.ws.send({
        type: 'checkRoom',
        PIN: roomCode
      });
      
      log.debug({ roomCode }, 'Room check requested');
    } catch (error) {
      log.error({ error, roomCode }, 'Failed to check room');
      this.showState('error');
    }
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    log.debug({ message }, 'Room status message received');
    
    switch (message.type) {
      case 'roomCreated':
      case 'roomStatus':
        if (message.status && message.status.PIN === this.currentRoomCode) {
          if (!message.status.active) {
            this.showState('error');
            this.updateErrorMessage('Room is no longer active');
            if (this.elements.joinButton) {
              this.elements.joinButton.disabled = true;
            }
          } else {
            this.updateRoomInfo(message.status);
            this.showState('success');
          }
        } else {
          this.showState('error');
          this.updateErrorMessage('Room not found or no longer active');
        }
        break;

      case 'roomNotFound':
        if (message.roomId === this.currentRoomCode || !message.roomId) {
          log.debug('Room not found, showing error state');
          this.showState('error');
          this.updateErrorMessage(message.message || 'Room not found');
          if (this.elements.joinButton) {
            this.elements.joinButton.disabled = true;
          }
        }
        break;

      case 'userJoined':
      case 'userLeft':
        if (message.roomId === this.currentRoomCode) {
          this.ws.send({
            type: 'checkRoom',
            PIN: this.currentRoomCode
          });
        }
        break;

      case 'roomClosed':
        if (message.PIN === this.currentRoomCode) {
          log.debug('Room closed, showing error state');
          this.showState('error');
          this.updateErrorMessage('Room has been closed');
          if (this.elements.joinButton) {
            this.elements.joinButton.disabled = true;
          }
        }
        break;
    }
  }

  updateRoomInfo(roomData) {
    // Store the current room data
    this.currentRoomData = roomData;

    this.elements.roomName.textContent = roomData.name;
    this.elements.participantList.innerHTML = roomData.participants
      .map(p => `<div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-lime-500"></div>
        <span class="text-slate-300">${p.name}</span>
        ${p.joinedAt ? `<span class="text-xs text-slate-500">joined ${new Date(p.joinedAt).toLocaleTimeString()}</span>` : ''}
      </div>`)
      .join('');
    
    // Update join button state considering both room state and display name
    const isRoomFull = roomData.participantCount >= roomData.maxParticipants;
    const displayName = this.elements.displayName?.value.trim() || '';
    const isValidName = displayName.length > 0 && displayName.length <= 30;
    
    this.elements.joinButton.disabled = !roomData.active || isRoomFull || !isValidName;
    
    if (isRoomFull) {
      this.updateErrorMessage('Room is full');
      this.showState('error');
    }
  }

  showState(state) {
    log.debug({ state }, 'Showing state');
    Object.values(this.states).forEach(el => el.classList.add('hidden'));
    if (this.states[state]) {
      this.states[state].classList.remove('hidden');
      this.container.classList.remove('hidden');
    }

    // Update input states
    this.elements.inputs.forEach(input => {
      input.dataset.loading = state === 'loading' ? 'true' : 'false';
    });
  }

  destroy() {
    if (this.ws) {
      this.ws.onMessage = null;
    }
    this.currentRoomCode = null;
  }

  updateErrorMessage(message) {
    const errorContainer = this.states.error.querySelector('[data-error-message]');
    if (errorContainer) {
      errorContainer.textContent = message;
    }
  }

  validateJoinButton() {
    if (this.elements.joinButton && this.elements.displayName) {
      const displayName = this.elements.displayName.value.trim();
      const isValidName = displayName.length > 0 && displayName.length <= 30;
      
      this.elements.joinButton.disabled = !isValidName;
      
      // Optionally add visual feedback
      if (!isValidName && displayName.length > 0) {
        this.elements.displayName.classList.add('border-red-500');
      } else {
        this.elements.displayName.classList.remove('border-red-500');
      }
    }
  }

  handleJoinRoom() {
    if (!this.currentRoomData || !this.elements.displayName) return;
    
    const displayName = this.elements.displayName.value.trim();
    if (!displayName) return;

    // Store data in sessionStorage
    sessionStorage.setItem('PIN', this.currentRoomData.PIN);
    sessionStorage.setItem('roomId', this.currentRoomData.id);
    sessionStorage.setItem('roomName', this.currentRoomData.name);
    sessionStorage.setItem('userName', displayName);

    // Redirect to the room page (only with roomId in URL)
    window.appRouter.navigate(`/room/${this.currentRoomData.id}`);
  }
} 