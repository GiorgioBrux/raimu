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

        // Set up language change handler
        this.transcriptionLang.addEventListener('change', () => {
            const language = this.transcriptionLang.value;
            this.roomManager.ws.send({
                type: 'languageChanged',
                language: language
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

        // Always update TTS state when transcription status changes
        this.updateTTSState(enabled);

        if(!userName) {
            // This is the update we get when we join a room with transcription enabled
            this.addSystemMessage(`Transcription was already enabled when you joined the room`);
            return;
        }
        
        // Show message about who changed the transcription state
        if (userId !== this.roomManager.userId) {
            if (enabled) {
                this.addSystemMessage(`${userName} enabled transcription for everyone`);
            } else {
                this.addSystemMessage(`${userName} disabled transcription`);
            }
        }
    }

    /**
     * Handles language change updates from the server
     */
    handleLanguageChanged(data) {
        const { userId, userName, language } = data;
        
        // Don't show message for own language changes
        if (userId === this.roomManager.userId) {
            return;
        }

        // Get the language name from the select options
        const languageOption = this.transcriptionLang.querySelector(`option[value="${language}"]`);
        const languageName = languageOption ? languageOption.textContent : language;

        this.addSystemMessage(`${userName} is now speaking in ${languageName}`);
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
     * Gets the display name for a language code
     */
    _getLanguageName(langCode) {
        const option = this.transcriptionLang.querySelector(`option[value="${langCode}"]`);
        return option ? option.textContent : langCode;
    }

    /**
     * Adds a transcription message to the UI
     */
    addTranscription(text, userId, timestamp, translatedText = null, originalLanguage = null, translatedLanguage = null, hasTTS = false, ttsDuration = 0) {
        // Ignore transcriptions if transcription is disabled
        if (!this.transcriptionEnabled.checked) {
            return;
        }

        // Replace empty or whitespace-only text with <noise>
        const displayText = (!text || text.trim() === '' || text == '\n') ? '<noise>' : text;
        const displayTranslatedText = (!translatedText || translatedText.trim() === '') ? '<noise>' : translatedText;

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
        
        // Create left side container for name and TTS icon
        const leftContainer = document.createElement('div');
        leftContainer.className = 'flex items-center gap-2';
        
        const nameEl = document.createElement('span');
        nameEl.className = 'text-xs text-slate-500';
        nameEl.textContent = username;
        
        // Add TTS icon if audio is available
        if (hasTTS) {
            const ttsIcon = document.createElement('div');
            ttsIcon.className = 'text-slate-500 transition-opacity';
            ttsIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clip-rule="evenodd" />
                </svg>`;

            // Add pulsing animation while TTS is playing
            ttsIcon.classList.add('animate-pulse');
            
            // Remove animation after duration
            if (ttsDuration > 0) {
                setTimeout(() => {
                    ttsIcon.classList.remove('animate-pulse');
                    ttsIcon.classList.add('opacity-50');
                }, ttsDuration * 1000);
            }
            
            leftContainer.appendChild(ttsIcon);
        }
        
        leftContainer.appendChild(nameEl);
        headerRow.appendChild(leftContainer);

        const timeEl = document.createElement('span');
        timeEl.className = 'text-xs text-slate-500';
        const time = new Date(timestamp);
        timeEl.textContent = time.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        headerRow.appendChild(timeEl);

        // Create container for original text with language label
        const originalContainer = document.createElement('div');
        originalContainer.className = 'mb-1';
        
        if (originalLanguage) {
            const originalLabel = document.createElement('span');
            originalLabel.className = 'text-xs text-slate-500 mb-1';
            const languageName = this._getLanguageName(originalLanguage);
            originalLabel.textContent = `Original (${languageName})`;
            originalContainer.appendChild(originalLabel);
        }

        const transcriptionText = document.createElement('p');
        transcriptionText.className = 'text-sm text-slate-300';
        transcriptionText.textContent = displayText;
        originalContainer.appendChild(transcriptionText);

        transcriptionElement.appendChild(headerRow);
        transcriptionElement.appendChild(originalContainer);

        // Add translated text if available
        if (translatedText) {
            const translationContainer = document.createElement('div');
            translationContainer.className = 'mt-2 pt-2 border-t border-slate-700/50';
            
            const translationLabel = document.createElement('span');
            translationLabel.className = 'text-xs text-slate-500';
            const translatedToLang = translatedLanguage || this.transcriptionLang.value;
            const translatedLanguageName = this._getLanguageName(translatedToLang);
            translationLabel.textContent = `Translated to ${translatedLanguageName}`;
            
            const translatedTextEl = document.createElement('p');
            translatedTextEl.className = 'text-sm text-slate-400';
            translatedTextEl.textContent = displayTranslatedText;
            
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
            // When transcription is disabled, turn off TTS if it was on
            if (this.voiceTTSEnabled.checked) {
                this.voiceTTSEnabled.checked = false;
                // Send TTS status update
                this.roomManager.ws.send({
                    type: 'TTSStatus',
                    enabled: false
                });
            }
            this.voiceTTSEnabled.disabled = true;
            this.voiceTTSEnabled.parentElement?.classList.add('opacity-50', 'cursor-not-allowed');
            log.debug('Disabled TTS switch');
        }
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