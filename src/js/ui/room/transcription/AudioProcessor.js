import { uiLogger as log } from '../../../utils/logger.js';

/**
 * Handles audio processing and analysis for transcription
 */
export class AudioProcessor {
    constructor(websocket, roomId) {
        this.websocket = websocket;
        this.roomId = roomId;
    }

    /**
     * Analyzes and sends audio for transcription if it meets quality thresholds
     */
    sendAudioForTranscription(base64AudioData, userId, language) {
        // Return if audio is too short or too quiet
        if (!this._isAudioValid(base64AudioData)) {
            return;
        }

        this.websocket.send({
            type: 'transcriptionRequest',
            audioData: base64AudioData,
            language: language || 'en',
            roomId: this.roomId,
            timestamp: new Date().toISOString(),
            userId: userId
        });
    }

    /**
     * Validates audio quality and duration
     * @private
     */
    _isAudioValid(base64AudioData) {
        try {
            const audioData = Uint8Array.from(atob(base64AudioData), c => c.charCodeAt(0));
            const samples = new Float32Array(audioData.buffer);
            
            // Calculate RMS energy of the audio
            let sumSquares = 0;
            for (let i = 0; i < samples.length; i++) {
                sumSquares += samples[i] * samples[i];
            }
            const rmsEnergy = Math.sqrt(sumSquares / samples.length);
            
            // Skip if energy is too low (likely just noise)
            if (rmsEnergy < 0.01) {
                log.debug({ rmsEnergy }, 'Skipping low energy audio');
                return false;
            }

            // Skip if audio is too short (likely just noise)
            if (samples.length / 16000 < 0.3) {  // Less than 300ms
                log.debug({ duration: samples.length / 16000 }, 'Skipping short audio');
                return false;
            }

            return true;
        } catch (error) {
            log.warn({ error }, 'Error analyzing audio before transcription');
            return false;
        }
    }
} 