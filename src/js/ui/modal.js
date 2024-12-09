import { generateRoomName } from '../utils/nameGenerator.js';

export class ModalManager {
    constructor() {
        this.modal = document.getElementById('createRoomModal');
        this.form = document.getElementById('createRoomForm');
        this.cancelBtn = document.getElementById('cancelCreateRoom');
        this.generateBtn = document.getElementById('generateRoomName');
        this.userNameInput = document.getElementById('userName');
        this.roomNameInput = this.form.querySelector('input[name="roomName"]');
        this.maxParticipantsSelect = this.form.querySelector('select[name="maxParticipants"]');
        
        this.onSubmit = null; // Will be set by the caller
        this.setupListeners();
    }

    setupListeners() {
        if (!this.modal || !this.form || !this.cancelBtn) {
            console.error('Modal elements not found');
            return;
        }

        this.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = this.form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            
            try {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Connecting...';
                
                await this.onSubmit?.(
                    this.userNameInput.value,
                    this.roomNameInput.value || null,
                    {
                        maxParticipants: parseInt(this.maxParticipantsSelect.value)
                    }
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

    show() {
        this.modal.classList.add('opacity-100', 'pointer-events-auto');
        this.modal.classList.remove('opacity-0', 'pointer-events-none');
        this.userNameInput.focus();
    }

    hide() {
        this.modal.classList.remove('opacity-100', 'pointer-events-auto');
        this.modal.classList.add('opacity-0', 'pointer-events-none');
        this.form.reset();
    }

    isVisible() {
        return this.modal.classList.contains('opacity-100');
    }
} 