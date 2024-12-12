/**
 * Manages the transcription functionality for a room
 * @class
 */
export class TranscriptionManager {
    /**
     * Creates a new TranscriptionManager instance
     * @param {import('./UIElements.js').UIElements} uiElements - UI elements manager
     * @param {WebSocket} websocket - WebSocket connection for sending transcriptions
     * @param {string} roomId - ID of the current room
     */
    constructor(uiElements, websocket, roomId) {
        const elements = uiElements.getElements();
        this.transcriptionEnabled = elements.transcriptionEnabled;
        this.transcriptionLang = elements.transcriptionLang;
        this.transcriptionText = elements.transcriptionText;
        this.websocket = websocket;
        this.roomId = roomId;
        this.enabled = false;
        this.language = 'en';
        this.hasTranscriptions = false;

        this.setupEventListeners();
    }

    /**
     * Sets up event listeners for transcription controls
     * @private
     */
    setupEventListeners() {
        this.transcriptionEnabled.addEventListener('change', () => {
            this.enabled = this.transcriptionEnabled.checked;
        });

        this.transcriptionLang.addEventListener('change', () => {
            this.language = this.transcriptionLang.value;
        });
    }

    /**
     * Adds a new transcription to the display
     * @param {string} text - The transcribed text
     * @param {string} userId - ID of the user who spoke
     * @param {string} timestamp - ISO timestamp of the transcription
     */
    addTranscription(text, userId, timestamp) {
        if (!this.hasTranscriptions) {
            const placeholder = this.transcriptionText.querySelector('.opacity-30');
            if (placeholder) {
                placeholder.remove();
            }
            this.hasTranscriptions = true;
        }

        const transcriptionElement = document.createElement('div');
        transcriptionElement.className = 'p-3 bg-slate-800/30 rounded-lg mb-2';

        const timeEl = document.createElement('span');
        timeEl.className = 'text-xs text-slate-500 block mb-1';
        const time = new Date(timestamp);
        timeEl.textContent = time.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const transcriptionText = document.createElement('p');
        transcriptionText.className = 'text-sm text-slate-300';
        transcriptionText.textContent = text;

        transcriptionElement.appendChild(timeEl);
        transcriptionElement.appendChild(transcriptionText);
        this.transcriptionText.appendChild(transcriptionElement);
        this.transcriptionText.scrollTop = this.transcriptionText.scrollHeight;
    }

    isEnabled() {
        return this.enabled;
    }

    sendAudioForTranscription(base64AudioData) {
        if (!this.enabled) return;

        this.websocket.send({
            type: 'transcriptionRequest',
            audioData: base64AudioData,
            language: this.language,
            roomId: this.roomId,
            timestamp: new Date().toISOString()
        });
    }
} 