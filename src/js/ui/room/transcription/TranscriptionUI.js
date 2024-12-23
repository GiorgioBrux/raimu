import { uiLogger as log } from '../../../utils/logger.js';

/**
 * Manages the transcription UI elements and display
 */
export class TranscriptionUI {
    constructor(uiElements, roomManager) {
        const elements = uiElements.getElements();
        this.transcriptionEnabled = elements.transcriptionEnabled;
        this.transcriptionLang = elements.transcriptionLang;
        this.voiceTTSEnabled = elements.voiceTTSEnabled;
        this.transcriptionText = elements.transcriptionText;
        this.roomManager = roomManager;
        this.hasTranscriptions = false;
        this.isTranscriptionHost = false;

        // Initially disable TTS switch
        this.voiceTTSEnabled.disabled = true;
        this.voiceTTSEnabled.checked = false;
        this.voiceTTSEnabled.parentElement?.classList.add('opacity-50', 'cursor-not-allowed');

        // Set up transcription toggle handler
        this.transcriptionEnabled.addEventListener('change', () => {
            const enabled = this.transcriptionEnabled.checked;
            this.roomManager.ws.send({
                type: 'transcriptionEnabled',
                enabled: enabled
            });
        });

        // Set up TTS toggle handler
        this.voiceTTSEnabled.addEventListener('change', () => {
            const enabled = this.voiceTTSEnabled.checked;
            this.roomManager.ws.send({
                type: 'TTSStatus',
                enabled: enabled
            });
        });
    }

    /**
     * Handles transcription status updates from the server
     */
    handleTranscriptionStatusUpdate(data) {
        const { enabled, userId, userName } = data;

        // Update the transcription toggle
        this.transcriptionEnabled.checked = enabled;
        
        // Show message about who changed the transcription state
        if (userId !== this.roomManager.userId) {
            if (enabled) {
                this.addSystemMessage(`${userName} enabled transcription for everyone`);
            } else {
                this.addSystemMessage(`${userName} disabled transcription`);
            }
        }

        // Update TTS state (only enable if transcription is enabled)
        this.updateTTSState(enabled);
    }

    /**
     * Adds a system message to the transcription panel
     */
    addSystemMessage(message) {
        if (!this.hasTranscriptions) {
            const placeholder = this.transcriptionText.querySelector('.opacity-30');
            if (placeholder) {
                placeholder.remove();
            }
            this.hasTranscriptions = true;
        }

        const messageElement = document.createElement('div');
        messageElement.className = 'p-1 text-center text-sm text-slate-400 italic';
        messageElement.textContent = message;
        this.transcriptionText.appendChild(messageElement);
        this.transcriptionText.scrollTop = this.transcriptionText.scrollHeight;
    }

    /**
     * Adds a transcription message to the UI
     */
    addTranscription(text, userId, timestamp, translatedText = null, originalLanguage = null) {
        // Ignore transcriptions if transcription is disabled
        if (!this.transcriptionEnabled.checked) {
            return;
        }

        if (!this.hasTranscriptions) {
            const placeholder = this.transcriptionText.querySelector('.opacity-30');
            if (placeholder) {
                placeholder.remove();
            }
            this.hasTranscriptions = true;
        }

        const transcriptionElement = document.createElement('div');
        transcriptionElement.className = 'p-3 bg-slate-800/30 rounded-lg mb-2';

        const headerRow = document.createElement('div');
        headerRow.className = 'flex justify-between items-center mb-1';

        // Get username from room manager based on userId
        let username;
        if (userId === 'local' || userId === this.roomManager.userId) {
            username = 'You';
        } else {
            const participant = this.roomManager.participants.get(userId);
            username = participant?.name || 'Unknown User';
        }
        
        const nameEl = document.createElement('span');
        nameEl.className = 'text-xs text-slate-500';
        nameEl.textContent = username;

        const timeEl = document.createElement('span');
        timeEl.className = 'text-xs text-slate-500';
        const time = new Date(timestamp);
        timeEl.textContent = time.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        headerRow.appendChild(nameEl);
        headerRow.appendChild(timeEl);

        // Create container for original text with language label
        const originalContainer = document.createElement('div');
        originalContainer.className = 'mb-1';
        
        if (originalLanguage && originalLanguage !== 'en' && userId === 'local') {
            const originalLabel = document.createElement('span');
            originalLabel.className = 'text-xs text-slate-500 mb-1';
            const languageName = this._getLanguageName(originalLanguage);
            originalLabel.textContent = languageName;
            originalContainer.appendChild(originalLabel);
        }

        const transcriptionText = document.createElement('p');
        transcriptionText.className = 'text-sm text-slate-300';
        transcriptionText.textContent = text;
        originalContainer.appendChild(transcriptionText);

        transcriptionElement.appendChild(headerRow);
        transcriptionElement.appendChild(originalContainer);

        // Add translated text if available
        if (translatedText && userId === 'local') {
            const translationContainer = document.createElement('div');
            translationContainer.className = 'mt-2 pt-2 border-t border-slate-700/50';
            
            const translationLabel = document.createElement('span');
            translationLabel.className = 'text-xs text-slate-500';
            translationLabel.textContent = 'English';
            
            const translatedTextEl = document.createElement('p');
            translatedTextEl.className = 'text-sm text-slate-400';
            translatedTextEl.textContent = translatedText;
            
            translationContainer.appendChild(translationLabel);
            translationContainer.appendChild(translatedTextEl);
            transcriptionElement.appendChild(translationContainer);
        }

        this.transcriptionText.appendChild(transcriptionElement);
        this.transcriptionText.scrollTop = this.transcriptionText.scrollHeight;
    }

    /**
     * Updates the TTS switch state based on transcription state
     */
    updateTTSState(transcriptionEnabled) {
        if (transcriptionEnabled) {
            this.voiceTTSEnabled.disabled = false;
            this.voiceTTSEnabled.parentElement?.classList.remove('opacity-50', 'cursor-not-allowed');
            log.debug('Enabled TTS switch');
        } else {
            if (this.voiceTTSEnabled.checked) {
                this.voiceTTSEnabled.click();
            }
            this.voiceTTSEnabled.disabled = true;
            this.voiceTTSEnabled.parentElement?.classList.add('opacity-50', 'cursor-not-allowed');
            log.debug('Disabled TTS switch');
        }
    }

    /**
     * Convert language code to full name
     * @private
     */
    _getLanguageName(code) {
        const languages = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'nl': 'Dutch',
            'pl': 'Polish',
            'ru': 'Russian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese',
            'ar': 'Arabic',
            'hi': 'Hindi',
            'tr': 'Turkish',
            'vi': 'Vietnamese',
            'th': 'Thai',
            'id': 'Indonesian',
            'ms': 'Malay',
            'fa': 'Persian'
        };
        return languages[code] || code.toUpperCase();
    }

    /**
     * Gets the current selected language
     */
    getSelectedLanguage() {
        return this.transcriptionLang.value;
    }

    /**
     * Gets the transcription enabled state
     */
    isTranscriptionEnabled() {
        return this.transcriptionEnabled.checked;
    }

    /**
     * Gets the TTS enabled state
     */
    isTTSEnabled() {
        return this.voiceTTSEnabled.checked;
    }
} 