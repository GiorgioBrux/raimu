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
    this.hasValidVoiceSample = false;
    // Let's keep the old message handler, restore if the user goes back to home
    this.oldMessageHandler = this.ws.onMessage;
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

    // Listen for voice sample validity changes
    document.addEventListener('voiceSampleValidityChange', (event) => {
      this.hasValidVoiceSample = event.detail.isValid;
      this.validateJoinButton();
    });

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

    this.setupEventListeners();
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
    
    // Update participant list with count
    this.elements.participantList.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <span class="text-slate-300">Current Participants:</span>
            <span class="font-semibold ${roomData.participantCount >= roomData.maxParticipants ? 'text-red-400' : 'text-lime-400'}">
                ${roomData.participantCount}/${roomData.maxParticipants}
            </span>
        </div>
        <div class="pl-4 space-y-1">
            ${roomData.participants.map(p => `
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-lime-500"></div>
                    <span class="text-slate-300">${p.name}</span>
                    ${p.joinedAt ? `<span class="text-xs text-slate-500">joined ${new Date(p.joinedAt).toLocaleTimeString()}</span>` : ''}
                </div>
            `).join('')}
        </div>`;
    
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
      this.ws.onMessage = this.oldMessageHandler;
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
      const canJoin = isValidName && this.hasValidVoiceSample && this.currentRoomData?.active && 
                     this.currentRoomData?.participantCount < this.currentRoomData?.maxParticipants;
      
      this.elements.joinButton.disabled = !canJoin;
      
      // Update button tooltip based on validation state
      if (!isValidName) {
        this.elements.joinButton.title = 'Please enter a valid display name';
      } else if (!this.hasValidVoiceSample) {
        this.elements.joinButton.title = 'Please record a voice sample of at least 10 seconds';
      } else if (this.currentRoomData?.participantCount >= this.currentRoomData?.maxParticipants) {
        this.elements.joinButton.title = 'Room is full';
      } else if (!this.currentRoomData?.active) {
        this.elements.joinButton.title = 'Room is no longer active';
      } else {
        this.elements.joinButton.title = 'Join Room';
      }
      
      // Optionally add visual feedback for name
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

  setupEventListeners() {
    const pasteButton = document.querySelector('[data-paste-code]');
    const pasteStatus = document.querySelector('[data-paste-status]');
    let isPasting = false;
    let hideTimeout = null;  // Track the current timeout
    
    const isValidPIN = (text) => {
      // Remove any non-digits
      const digitsOnly = text.replace(/[^0-9]/g, '');
      // Check if it's exactly 12 digits
      return digitsOnly.length === 12;
    };

    const showStatus = (message, isError = false) => {
      if (pasteStatus) {
        // Clear any existing timeout
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }

        pasteStatus.textContent = message;
        pasteStatus.className = `ml-2 text-sm ${isError ? 'text-red-400' : 'text-lime-400'}`;
        pasteStatus.classList.remove('hidden');
        
        hideTimeout = setTimeout(() => {
          pasteStatus.classList.add('hidden');
          hideTimeout = null;
        }, 2000);
      }
    };
    
    if (pasteButton) {
      pasteButton.addEventListener('click', async () => {
        if (isPasting) return;
        
        try {
          isPasting = true;
          pasteButton.disabled = true;
          
          if (pasteStatus) {
            pasteStatus.textContent = 'Reading clipboard...';
            pasteStatus.className = 'ml-2 text-sm text-slate-400';
            pasteStatus.classList.remove('hidden');
          }

          const text = await navigator.clipboard.readText();
          
          if (!text.trim()) {
            showStatus('✗ Clipboard is empty', true);
            return;
          }

          if (!isValidPIN(text)) {
            showStatus('✗ Invalid PIN', true);
            return;
          }

          // Extract just the digits and group them
          const code = text.replace(/[^0-9]/g, '');
          const parts = code.match(/.{1,4}/g);
          const inputs = document.querySelectorAll('[data-room-code-part]');
          
          // First set all values without triggering events
          inputs.forEach((input, index) => {
            input.value = parts[index];
          });
          
          // Then trigger a single input event on the last field
          const lastInput = inputs[inputs.length - 1];
          lastInput?.dispatchEvent(new Event('input'));

          showStatus('✓ PIN pasted');
        } catch (err) {
          showStatus('✗ Could not access clipboard', true);
          console.error('Failed to paste room code:', err);
        } finally {
          isPasting = false;
          pasteButton.disabled = false;
        }
      });
    }
  }
} 