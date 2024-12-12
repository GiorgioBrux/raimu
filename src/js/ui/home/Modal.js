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
        this.maxParticipantsSelect = this.form.querySelector('select[name="maxParticipants"]');
        
        this.onSubmit = onSubmit; // Optional callback for form submission
        this.setupListeners();
    }

    setupListeners() {
        if (!this.modal || !this.form || !this.cancelBtn) {
            console.error('Modal elements not found');
            return;
        }

        this.form.addEventListener('submit', async (e) => {
            logger.debug('Home page form submitted');
            e.preventDefault();
            const submitBtn = this.form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Connecting...';
                
                await this.onSubmit?.(
                    this.userNameInput.value,
                    this.roomNameInput.value || null,
                    parseInt(this.maxParticipantsSelect.value)
                );
                
                this.hide();
            } catch (error) {
                console.error('Form submission error:', error);
                alert('Failed to create room. Please try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
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
        
        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    /**
     * Shows the modal by adding visibility classes and focusing the username input
     */
    show() {
        this.modal.classList.add('opacity-100', 'pointer-events-auto');
        this.modal.classList.remove('opacity-0', 'pointer-events-none');
        this.userNameInput.focus();
    }

    /**
     * Hides the modal by removing visibility classes and resetting the form
     */
    hide() {
        this.modal.classList.remove('opacity-100', 'pointer-events-auto');
        this.modal.classList.add('opacity-0', 'pointer-events-none');
        this.form.reset();
    }

    /**
     * Checks if the modal is currently visible
     * @returns {boolean} True if modal is visible, false otherwise
     */
    isVisible() {
        return this.modal.classList.contains('opacity-100');
    }
} 