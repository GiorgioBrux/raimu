export class InfoModals {
  constructor() {
    this.transcriptionModal = null;
    this.ttsModal = null;
    this.initialized = false;
  }

  initialize() {
    // Get modal elements
    this.transcriptionModal = document.getElementById('transcriptionInfoModal');
    this.ttsModal = document.getElementById('ttsInfoModal');

    this.setupEventListeners();
    this.initialized = true;
  }

  setupEventListeners() {
    // Setup info icon click handlers
    document.querySelectorAll('[data-modal-type]').forEach(btn => {
      btn.addEventListener('click', () => this.showModal(btn.dataset.modalType));
    });

    // Close modals on close button
    [this.transcriptionModal, this.ttsModal].forEach(modal => {
      if (!modal) return;

      const closeBtn = modal.querySelector('.close-modal');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hideModal(modal));
      }
    });

    // Close modals on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideAllModals();
      }
    });
  }

  showModal(type) {
    const modal = type === 'transcription' ? this.transcriptionModal : this.ttsModal;
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  hideModal(modal) {
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  hideAllModals() {
    [this.transcriptionModal, this.ttsModal].forEach(modal => {
      if (modal) {
        modal.classList.add('hidden');
      }
    });
  }

  destroy() {
    // No need to remove modals since they're part of the HTML
    // Just remove event listeners by letting them be garbage collected
    this.transcriptionModal = null;
    this.ttsModal = null;
  }
} 