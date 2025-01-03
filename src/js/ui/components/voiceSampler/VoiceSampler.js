import { appLogger as logger } from '../../../utils/logger.js';

export class VoiceSampler {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.isRecording = false;
        this.hasRecording = false;
        this.isPlaying = false;
        this.currentAudio = null;
        this.recordingStartTime = null;
        this.recordingDuration = 0;
        this.MIN_DURATION_SEC = 10;
        this.STORAGE_KEY = 'lastVoiceSample';

        this.recordButton = document.getElementById('voiceSampleRecord');
        this.playButton = document.getElementById('voiceSamplePlay');
        this.playIcon = document.getElementById('voiceSamplePlayIcon');
        this.stopIcon = document.getElementById('voiceSampleStopIcon');
        this.playingIcon = document.getElementById('voiceSamplePlayingIcon');
        this.playText = document.getElementById('voiceSamplePlayText');
        this.statusContainer = document.getElementById('voiceSampleStatus');
        this.initialStatus = document.getElementById('voiceSampleInitialStatus');
        this.updateStatus = document.getElementById('voiceSampleUpdateStatus');
        this.durationWarning = document.getElementById('voiceSampleDurationWarning');
        this.initialText = document.getElementById('voiceSampleInitialText');
        this.updateText = document.getElementById('voiceSampleUpdateText');

        if (this.recordButton) {
            this.recordButton.addEventListener('click', () => this.toggleRecording());
        }
        if (this.playButton) {
            this.playButton.addEventListener('click', () => this.togglePlayback());
        }

        // Custom event for sample validity
        this.validityChangeEvent = new CustomEvent('voiceSampleValidityChange', {
            detail: { isValid: false }
        });

        // Try to restore previous sample
        this.restoreLastSample();
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.recordingStartTime = Date.now();

            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                this.audioChunks.push(event.data);
            });

            this.mediaRecorder.addEventListener('stop', () => {
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.recordingDuration = (Date.now() - this.recordingStartTime) / 1000;
                this.updateRecordingStatus();
                this.saveCurrentSample();
                stream.getTracks().forEach(track => track.stop());
            });

            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordButton.classList.add('bg-red-500/10', 'border-red-500/20');
            this.recordButton.querySelector('span').textContent = 'Stop Recording';
            logger.debug('Started recording voice sample');
        } catch (error) {
            logger.error({ error }, 'Failed to start recording');
            alert('Could not access microphone. Please ensure you have granted microphone permissions.');
        }
    }

    async saveCurrentSample() {
        if (!this.audioBlob || !this.isValid()) return;

        try {
            const base64Data = await this.getVoiceSample();
            const sampleData = {
                audio: base64Data,
                duration: this.recordingDuration,
                timestamp: Date.now()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sampleData));
            logger.debug('Voice sample saved to storage');
        } catch (error) {
            logger.error({ error }, 'Failed to save voice sample');
        }
    }

    async restoreLastSample() {
        try {
            const savedData = localStorage.getItem(this.STORAGE_KEY);
            if (!savedData) return;

            const { audio, duration, timestamp } = JSON.parse(savedData);
            if (!audio || !duration) return;

            // Convert base64 back to Blob
            const response = await fetch(`data:audio/wav;base64,${audio}`);
            this.audioBlob = await response.blob();
            this.recordingDuration = duration;
            this.hasRecording = true;

            // Show restore message with timestamp
            const date = new Date(timestamp);
            const timeAgo = this.getTimeAgo(date);
            this.initialStatus.classList.remove('hidden');
            this.initialText.textContent = `Previous sample restored (${Math.round(duration)}s, recorded ${timeAgo})`;
            this.playButton.classList.remove('hidden');
            this.playButton.classList.add('flex');

            // Emit validity event
            this.validityChangeEvent.detail.isValid = this.isValid();
            document.dispatchEvent(this.validityChangeEvent);

            logger.debug({ duration, timestamp }, 'Restored previous voice sample');
        } catch (error) {
            logger.error({ error }, 'Failed to restore voice sample');
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
            }
        }

        return 'just now';
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.recordButton.classList.remove('bg-red-500/10', 'border-red-500/20');
            this.recordButton.querySelector('span').textContent = 'Record Sample';
            logger.debug('Stopped recording voice sample');
        }
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    updateRecordingStatus() {
        if (this.audioBlob) {
            this.playButton.classList.remove('hidden');
            this.playButton.classList.add('flex');

            const isValidDuration = this.recordingDuration >= this.MIN_DURATION_SEC;
            const durationText = ` (${Math.round(this.recordingDuration)}s)`;

            // Show appropriate status message
            if (!this.hasRecording) {
                // First recording
                this.initialStatus.classList.remove('hidden');
                this.updateStatus.classList.add('hidden');
                this.initialText.textContent = `Sample recorded${durationText}`;
                this.hasRecording = true;
            } else {
                // Subsequent recording
                this.initialStatus.classList.add('hidden');
                this.updateStatus.classList.remove('hidden');
                this.updateText.textContent = `Previous sample replaced${durationText}`;
                
                // Animate the update status
                this.updateStatus.classList.add('animate-pulse');
                setTimeout(() => {
                    this.updateStatus.classList.remove('animate-pulse');
                }, 1000);
            }

            // Show/hide duration warning
            if (!isValidDuration) {
                this.durationWarning.classList.remove('hidden');
            } else {
                this.durationWarning.classList.add('hidden');
            }

            // Emit validity change event
            this.validityChangeEvent.detail.isValid = isValidDuration;
            document.dispatchEvent(this.validityChangeEvent);
            
            logger.debug({
                duration: this.recordingDuration,
                isValid: isValidDuration
            }, 'Voice sample recorded');
        }
    }

    setPlayingState(isPlaying) {
        this.isPlaying = isPlaying;
        
        if (isPlaying) {
            this.playIcon.classList.add('hidden');
            this.stopIcon.classList.remove('hidden');
            this.playingIcon.classList.add('hidden');
            this.playText.textContent = 'Stop';
            this.playButton.classList.add('bg-lime-500/10', 'border-lime-500/20');
        } else {
            this.playIcon.classList.remove('hidden');
            this.stopIcon.classList.add('hidden');
            this.playingIcon.classList.add('hidden');
            this.playText.textContent = 'Play';
            this.playButton.classList.remove('bg-lime-500/10', 'border-lime-500/20');
        }
    }

    stopPlayback() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
            this.setPlayingState(false);
            logger.debug('Stopped playing voice sample');
        }
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.playRecording();
        }
    }

    playRecording() {
        if (this.audioBlob && !this.isPlaying) {
            const audio = new Audio(URL.createObjectURL(this.audioBlob));
            this.currentAudio = audio;
            
            this.setPlayingState(true);
            
            audio.addEventListener('ended', () => {
                this.currentAudio = null;
                this.setPlayingState(false);
                logger.debug('Finished playing voice sample');
            });

            audio.addEventListener('error', (error) => {
                logger.error({ error }, 'Error playing voice sample');
                this.currentAudio = null;
                this.setPlayingState(false);
            });

            audio.play().catch((error) => {
                logger.error({ error }, 'Failed to play voice sample');
                this.currentAudio = null;
                this.setPlayingState(false);
            });

            logger.debug('Started playing voice sample');
        }
    }

    isValid() {
        return this.audioBlob && this.recordingDuration >= this.MIN_DURATION_SEC;
    }

    async getVoiceSample() {
        if (!this.isValid()) {
            return null;
        }

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Audio = reader.result.split(',')[1];
                resolve(base64Audio);
            };
            reader.readAsDataURL(this.audioBlob);
        });
    }

    destroy() {
        if (this.mediaRecorder && this.isRecording) {
            this.stopRecording();
        }
        if (this.currentAudio) {
            this.stopPlayback();
        }
        if (this.recordButton) {
            this.recordButton.removeEventListener('click', () => this.toggleRecording());
        }
        if (this.playButton) {
            this.playButton.removeEventListener('click', () => this.togglePlayback());
        }
    }
} 