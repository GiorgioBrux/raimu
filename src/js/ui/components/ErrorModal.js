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
        window.appRouter.navigate('/join');
      });
    }
  }

  show(message) {
    log.debug({ message }, 'Showing error modal');
    
    this.modal.classList.remove('hidden');
  }

  hide() {
    this.modal.classList.add('hidden');
  }

  destroy() {
    if (this.goHomeBtn) {
      this.goHomeBtn.removeEventListener('click');
    }
  }
}
