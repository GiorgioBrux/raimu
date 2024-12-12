import { uiLogger as log } from '../../utils/logger.js';

export class ErrorModal {
  constructor(modalElement) {
    if (!modalElement) {
      throw new Error('Modal element is required');
    }
    
    this.modal = modalElement;
    this.goHomeBtn = this.modal.querySelector('#goHomeBtn');
    
    if (this.goHomeBtn) {
      this.goHomeBtn.addEventListener('click', () => {
        this.hide();
        window.appRouter.navigate('/');
      });
    }
  }

  show() {
    // Check if user was in a room before (refreshed)
    const lastPath = sessionStorage.getItem('lastPath');
    const wasInRoom = lastPath?.startsWith('/room/');
    
    if (wasInRoom) {
      // Replace default message with refresh-specific message
      const messageElement = this.modal.querySelector('.modal-message');
      if (messageElement) {
        messageElement.textContent = "Looks like you refreshed the page. You'll need to join again or create a new room.";
      }
    }
    // Otherwise keep the default message from room.html
    
    this.modal.classList.remove('hidden');
    log.debug({ wasRefresh: wasInRoom }, 'Showing error modal');
  }

  hide() {
    // Reset to default message when hiding
    const messageElement = this.modal.querySelector('.modal-message');
    if (messageElement) {
      messageElement.textContent = "To join a room, please use the join page and enter the room code. Direct URL access is not supported.";
    }
    
    this.modal.classList.add('hidden');
  }

  destroy() {
    if (this.goHomeBtn) {
      this.goHomeBtn.removeEventListener('click');
    }
  }
}
