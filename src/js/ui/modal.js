import { generateRoomName } from '../utils/nameGenerator';

export class ModalManager {
  constructor() {
    this.modal = document.getElementById('createRoomModal');
    this.form = document.getElementById('createRoomForm');
    this.cancelBtn = document.getElementById('cancelCreateRoom');
    this.generateBtn = document.getElementById('generateRoomName');
    this.roomNameInput = document.getElementById('roomName');
    
    this.setupListeners();
  }

  setupListeners() {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userName = document.getElementById('userName').value;
      const roomName = document.getElementById('roomName').value;
      
      const submitBtn = this.form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connecting...';
        await this.onSubmit?.(userName, roomName);
        this.hide();
      } catch (error) {
        console.error('Form submission error:', error);
        alert('Failed to create room. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    this.cancelBtn.addEventListener('click', () => this.hide());
    
    // Add generate button handler
    this.generateBtn.addEventListener('click', () => {
      const randomName = generateRoomName();
      this.roomNameInput.value = randomName;
      
      // Add a little animation to the input
      this.roomNameInput.classList.add('animate-pulse');
      setTimeout(() => {
        this.roomNameInput.classList.remove('animate-pulse');
      }, 750);
    });
  }

  show() {
    this.modal.classList.remove('opacity-0', 'pointer-events-none');
    this.modal.classList.add('opacity-100', 'pointer-events-auto');
    document.getElementById('userName').focus();
  }

  hide() {
    this.modal.classList.add('opacity-0', 'pointer-events-none');
    this.modal.classList.remove('opacity-100', 'pointer-events-auto');
    this.form.reset();
  }
} 