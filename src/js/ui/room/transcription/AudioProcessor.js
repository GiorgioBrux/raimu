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
            // Decode base64 to binary
            const binaryStr = atob(base64AudioData);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

            // Skip WAV header (44 bytes) and convert to 16-bit PCM samples
            const samples = new Float32Array((bytes.length - 44) / 2);
            for (let i = 0; i < samples.length; i++) {
                // Convert two bytes to 16-bit integer
                const int16 = (bytes[44 + i * 2] | (bytes[45 + i * 2] << 8));
                // Convert to float32 (-1 to 1 range)
                samples[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
            }
            
            // Skip if audio is too short
            if (samples.length / 16000 < 0.5) {  // Less than 500ms
                log.debug({ duration: samples.length / 16000 }, 'Skipping short audio');
                return false;
            }

            // Initialize analysis variables
            let sumSquares = 0;
            let peaks = 0;
            let zeroCrossings = 0;
            let previousSample = 0;
            let maxPeak = 0;
            
            // Window size for local analysis (50ms = 800 samples at 16kHz)
            const windowSize = 800;
            let windowEnergies = [];
            let currentWindowEnergy = 0;
            let samplesInWindow = 0;
            
            // Analyze samples
            for (let i = 0; i < samples.length; i++) {
                const sample = samples[i];
                sumSquares += sample * sample;
                
                // Count peaks (local maxima)
                if (i > 0 && i < samples.length - 1) {
                    if (sample > samples[i-1] && 
                        sample > samples[i+1] && 
                        Math.abs(sample) > 0.1) {
                        peaks++;
                        maxPeak = Math.max(maxPeak, Math.abs(sample));
                    }
                }
                
                // Count zero crossings
                if (previousSample * sample < 0) {
                    zeroCrossings++;
                }
                previousSample = sample;
                
                // Calculate energy in windows
                currentWindowEnergy += sample * sample;
                samplesInWindow++;
                
                if (samplesInWindow === windowSize) {
                    windowEnergies.push(currentWindowEnergy / windowSize);
                    currentWindowEnergy = 0;
                    samplesInWindow = 0;
                }
            }
            
            // Handle any remaining samples in the last window
            if (samplesInWindow > 0) {
                windowEnergies.push(currentWindowEnergy / samplesInWindow);
            }
            
            const rmsEnergy = Math.sqrt(sumSquares / samples.length);
            const zeroCrossingRate = zeroCrossings / samples.length;
            
            // Calculate energy variation between windows
            let maxEnergyVariation = 0;
            let totalEnergyVariation = 0;
            for (let i = 1; i < windowEnergies.length; i++) {
                const variation = Math.abs(windowEnergies[i] - windowEnergies[i-1]);
                maxEnergyVariation = Math.max(maxEnergyVariation, variation);
                totalEnergyVariation += variation;
            }
            
            const avgEnergyVariation = windowEnergies.length > 1 ? 
                totalEnergyVariation / (windowEnergies.length - 1) : 0;
            
            // Calculate peak density per second
            const durationSeconds = samples.length / 16000;
            const peakDensity = peaks / durationSeconds;
            
            // Log analysis results for debugging
            log.debug({
                rmsEnergy,
                zeroCrossingRate,
                peakCount: peaks,
                maxPeak,
                maxEnergyVariation,
                avgEnergyVariation,
                duration: durationSeconds,
                peakDensity
            }, 'Audio analysis results');

            // 1. Very sudden energy variations indicate non-speech sounds
            if (maxEnergyVariation > 0.8 && avgEnergyVariation > 0.2) {
                log.debug({ maxEnergyVariation, avgEnergyVariation }, 'Skipping audio with sudden energy variation');
                return false;
            }

            // 2. High zero-crossing rate with high peak density indicates noise
            if (zeroCrossingRate > 0.3 && peakDensity > 300) {
                log.debug({ zeroCrossingRate, peakDensity }, 'Skipping noisy audio');
                return false;
            }

            // 3. Skip if single very loud peak dominates with high variation
            if (maxPeak > 0.9 && peaks < 10 && maxEnergyVariation > 0.5) {
                log.debug({ maxPeak, peaks, maxEnergyVariation }, 'Skipping audio with dominant single peak');
                return false;
            }

            return true;
        } catch (error) {
            log.warn({ error }, 'Error analyzing audio before transcription');
            return false;
        }
    }
} 