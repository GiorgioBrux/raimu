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
        this.ttsIcons = new Map(); // Store TTS icons by message ID

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
     * Gets the flag emoji for a language code
     */
    _getLanguageFlag(langCode) {
        const flagMap = {
            'en': '🇺🇸 🇬🇧',
            'es': '🇪🇸',
            'fr': '🇫🇷',
            'de': '🇩🇪',
            'it': '🇮🇹',
            'pt': '🇵🇹',
            'ru': '🇷🇺',
            'ja': '🇯🇵',
            'ko': '🇰🇷',
            'zh': '🇨🇳',
            'ar': '🇸🇦',
            'hi': '🇮🇳',
            'tr': '🇹🇷',
            'nl': '🇳🇱',
            'pl': '🇵🇱',
            'vi': '🇻🇳',
            'th': '🇹🇭',
            'cs': '🇨🇿',
            'da': '🇩🇰',
            'fi': '🇫🇮',
            'el': '🇬🇷',
            'he': '🇮🇱',
            'hu': '🇭🇺',
            'id': '🇮🇩',
            'sv': '🇸🇪',
            'uk': '🇺🇦'
        };
        return flagMap[langCode] || '🌐';
    }

    /**
     * Gets the display name for a language code with flag
     */
    _getLanguageNameWithFlag(langCode) {
        const flag = this._getLanguageFlag(langCode);
        const name = this._getLanguageName(langCode);
        const flagSpan = document.createElement('span');
        flagSpan.className = 'language-flag';
        flagSpan.setAttribute('role', 'img');
        flagSpan.setAttribute('aria-label', `${name} flag`);
        flagSpan.innerHTML = flag;
        
        const container = document.createElement('span');
        container.appendChild(flagSpan);
        container.appendChild(document.createTextNode(` ${name}`));
        return container;
    }

    /**
     * Updates TTS icons based on queue state
     */
    updateTTSIcons(queueState) {
        const { currentlyPlaying, queued } = queueState;
        
        log.debug({
            currentlyPlaying,
            queuedMessages: queued,
            totalTrackedIcons: this.ttsIcons.size,
            lastPlayingId: this.lastPlayingId
        }, 'Starting TTS icons update');
        
        // Only update icons that are either currently playing, queued, or were just completed
        const relevantIds = new Set([
            currentlyPlaying,
            ...queued,
            this.lastPlayingId // Track the last playing message to update it when it completes
        ].filter(Boolean)); // Remove null/undefined values
        
        log.debug({
            relevantIds: Array.from(relevantIds),
            lastUpdatedIds: this.lastUpdatedIds ? Array.from(this.lastUpdatedIds) : null
        }, 'Relevant message IDs for update');
        
        // Store current playing ID for next update
        this.lastPlayingId = currentlyPlaying;
        
        // Update only relevant icons
        for (const [messageId, iconData] of this.ttsIcons.entries()) {
            // Skip icons that don't need updating
            if (!relevantIds.has(messageId) && !this.lastUpdatedIds?.has(messageId)) {
                continue;
            }
            
            const { icon, clockIcon, speakerIcon } = iconData;
            
            // Determine the state
            let state = 'completed';
            if (messageId === currentlyPlaying) {
                state = 'playing';
            } else if (queued.includes(messageId)) {
                state = 'queued';
            }
            
            const previousState = icon.dataset.ttsState || 'unknown';
            log.debug({
                messageId,
                previousState,
                newState: state,
                isQueued: queued.includes(messageId),
                isPlaying: messageId === currentlyPlaying,
                clockVisible: clockIcon.style.display === 'block',
                speakerVisible: speakerIcon.style.display === 'block'
            }, 'TTS icon state transition');
            
            // Update icon state
            icon.dataset.ttsState = state;
            
            // Update visibility and animation based on state
            if (state === 'queued') {
                clockIcon.style.display = 'block';
                speakerIcon.style.display = 'none';
                clockIcon.classList.add('animate-pulse');
                speakerIcon.classList.remove('animate-pulse');
                icon.classList.remove('opacity-50');
            } else if (state === 'playing') {
                clockIcon.style.display = 'none';
                speakerIcon.style.display = 'block';
                clockIcon.classList.remove('animate-pulse');
                speakerIcon.classList.add('animate-pulse');
                icon.classList.remove('opacity-50');
            } else { // completed
                clockIcon.style.display = 'none';
                speakerIcon.style.display = 'block';
                clockIcon.classList.remove('animate-pulse');
                speakerIcon.classList.remove('animate-pulse');
                icon.classList.add('opacity-50');
            }
        }
        
        // Store current set of updated IDs for next update
        this.lastUpdatedIds = relevantIds;
    }

    /**
     * Adds a transcription message to the UI
     */
    addTranscription(text, userId, timestamp, translatedText = null, originalLanguage = null, translatedLanguage = null, hasTTS = false, ttsDuration = 0) {
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
        
        // Create left side container for name and TTS icon
        const leftContainer = document.createElement('div');
        leftContainer.className = 'flex items-center gap-3';
        
        // Add TTS icon if audio is available
        if (hasTTS) {
            // Convert timestamp string to Date if it's not already
            const timestampDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
            const messageId = `${userId}-${timestampDate.getTime()}`; // Create unique message ID using timestamp in milliseconds
            
            log.debug({
                messageId,
                userId,
                timestamp,
                hasTTS
            }, 'Creating TTS icon for message');
            
            const ttsIcon = document.createElement('div');
            ttsIcon.className = 'text-slate-500 transition-opacity relative w-3 h-3';
            
            // Create the speaker icon for playing state
            const speakerIcon = document.createElement('div');
            speakerIcon.className = 'absolute inset-0'; // Initially hidden
            speakerIcon.style.display = 'none';
            speakerIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clip-rule="evenodd" />
                </svg>`;
            
            // Create the clock icon for queued state
            const clockIcon = document.createElement('div');
            clockIcon.className = 'absolute inset-0'; // Initially visible
            clockIcon.style.display = 'block';
            clockIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                </svg>`;
            
            // Add both icons to the container
            ttsIcon.appendChild(clockIcon);
            ttsIcon.appendChild(speakerIcon);
            
            // Store the icon references
            this.ttsIcons.set(messageId, { icon: ttsIcon, clockIcon, speakerIcon });
            
            leftContainer.appendChild(ttsIcon);
        }
        
        const nameEl = document.createElement('span');
        nameEl.className = 'text-xs text-slate-500';
        nameEl.textContent = username;
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
        transcriptionElement.appendChild(headerRow);

        // Add translated text if available
        if (translatedText) {
            const translationContainer = document.createElement('div');
            translationContainer.className = 'mt-2';
            
            const translationLabel = document.createElement('span');
            translationLabel.className = 'text-xs text-slate-500 flex items-center gap-2';
            
            const sourceLangWithFlag = this._getLanguageNameWithFlag(originalLanguage);
            const arrow = document.createElement('span');
            arrow.textContent = '→';
            const targetLangWithFlag = this._getLanguageNameWithFlag(translatedLanguage || this.transcriptionLang.value);
            
            translationLabel.appendChild(sourceLangWithFlag);
            translationLabel.appendChild(arrow);
            translationLabel.appendChild(targetLangWithFlag);
            
            const translatedTextEl = document.createElement('p');
            translatedTextEl.className = 'text-sm text-slate-300';
            translatedTextEl.textContent = translatedText;
            
            translationContainer.appendChild(translationLabel);
            translationContainer.appendChild(translatedTextEl);
            transcriptionElement.appendChild(translationContainer);
        } else {
            // If no translation, show original text
            const textEl = document.createElement('p');
            textEl.className = 'text-sm text-slate-300';
            textEl.textContent = text;
            transcriptionElement.appendChild(textEl);
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