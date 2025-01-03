import { generateRoomName } from '../../utils/nameGenerator.js';
import { appLogger as logger } from '../../utils/logger.js';
/**
 * @class
 * @classdesc Manages the modal for creating a room
 */
export class ModalManager {
    /**
     * @param {HTMLElement} modalContainer - The modal container element
     * @param {Function} onSubmit - The function to call when the form is submitted
     */
    constructor(modalContainer, onSubmit = null) {
        this.modal = modalContainer;
        this.form = this.modal.querySelector('form');
        this.cancelBtn = this.modal.querySelector('#cancelCreateRoom');
        this.generateBtn = this.modal.querySelector('#generateRoomName');
        this.userNameInput = this.modal.querySelector('#userName');
        this.roomNameInput = this.form.querySelector('input[name="roomName"]');
        this.submitBtn = this.form.querySelector('button[type="submit"]');
        
        this.onSubmit = onSubmit; // Optional callback for form submission
        this.hasValidVoiceSample = false;
        
        this.setupListeners();
        this.updateSubmitButton();
    }

    setupListeners() {
        if (!this.modal || !this.form || !this.cancelBtn) {
            logger.error({ modal: this.modal, form: this.form, cancelBtn: this.cancelBtn }, 'Modal elements not found');
            return;
        }

        // Listen for voice sample validity changes
        document.addEventListener('voiceSampleValidityChange', (event) => {
            this.hasValidVoiceSample = event.detail.isValid;
            this.updateSubmitButton();
        });

        // Listen for username changes
        this.userNameInput.addEventListener('input', () => {
            this.updateSubmitButton();
        });

        this.form.addEventListener('submit', async (e) => {
            logger.debug('Home page form submitted');
            e.preventDefault();
            const originalText = this.submitBtn.textContent;
            
            try {
                this.submitBtn.disabled = true;
                this.submitBtn.textContent = 'Connecting...';
                
                await this.onSubmit?.(
                    this.userNameInput.value,
                    this.roomNameInput.value || null,
                );
                
                this.hide();
            } catch (error) {
                logger.error({ error }, 'Form submission error');
                alert(error.message || 'Failed to create room. Please try again.');
            } finally {
                this.submitBtn.disabled = !this.isFormValid();
                this.submitBtn.textContent = originalText;
            }
        });

        // Generate random room name
        this.generateBtn.addEventListener('click', () => {
            const randomName = generateRoomName();
            this.roomNameInput.value = randomName;
            
            // Quick flash animation
            this.roomNameInput.classList.remove('flash-once');  // Reset animation
            void this.roomNameInput.offsetWidth;  // Force reflow
            this.roomNameInput.classList.add('flash-once');
        });

        // Close modal handlers
        this.cancelBtn.addEventListener('click', () => this.hide());

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    isFormValid() {
        return this.userNameInput.value.trim().length > 0 && this.hasValidVoiceSample;
    }

    updateSubmitButton() {
        if (this.submitBtn) {
            const isValid = this.isFormValid();
            this.submitBtn.disabled = !isValid;
            
            if (isValid) {
                this.submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                this.submitBtn.classList.add('hover:bg-lime-500');
            } else {
                this.submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
                this.submitBtn.classList.remove('hover:bg-lime-500');
            }
        }
    }

    /**
     * Shows the modal by adding visibility classes and focusing the username input
     */
    show() {
        this.modal.classList.add('opacity-100', 'pointer-events-auto');
        this.modal.classList.remove('opacity-0', 'pointer-events-none');
        this.userNameInput.focus();
        this.updateSubmitButton();
    }

    /**
     * Hides the modal by removing visibility classes and resetting the form
     */
    hide() {
        this.modal.classList.remove('opacity-100', 'pointer-events-auto');
        this.modal.classList.add('opacity-0', 'pointer-events-none');
        this.form.reset();
        this.hasValidVoiceSample = false;
        this.updateSubmitButton();
    }

    /**
     * Checks if the modal is currently visible
     * @returns {boolean} True if modal is visible, false otherwise
     */
    isVisible() {
        return this.modal.classList.contains('opacity-100');
    }
}

// Error modal

export function showError(message, details = '', shouldRefresh = false) {
    const errorModal = document.getElementById('errorModal');
    const messageEl = document.getElementById('errorMessage');
    const detailsEl = document.getElementById('errorDetails');
    const okBtn = document.getElementById('errorModalOkBtn');
    
    messageEl.textContent = message;
    detailsEl.textContent = details;
    
    // Remove any existing click handlers
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    // Add click handler
    newOkBtn.addEventListener('click', () => {
        hideError();
        if (shouldRefresh) {
            window.location.reload();
        }
    });
    
    errorModal.classList.remove('opacity-0', 'pointer-events-none');
    errorModal.querySelector('.scale-95').classList.remove('scale-95');
}

export function hideError() {
    const errorModal = document.getElementById('errorModal');
    errorModal.classList.add('opacity-0', 'pointer-events-none');
    errorModal.querySelector('div').classList.add('scale-95');
}

// Update the close button handler to also handle refresh
document.getElementById('closeErrorModal')?.addEventListener('click', () => {
    hideError();
});