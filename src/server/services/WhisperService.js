import OpenAI from 'openai';
import dotenv from 'dotenv';
import { pipeline } from '@huggingface/transformers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Readable } from 'stream';
import { File } from 'buffer';

// Suppress ONNX warnings
process.env.ONNX_DISABLE_UNUSED_INITIALIZER_WARNINGS = '1';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

let localTranscriber = null;
let instance = null;

export class WhisperService {
    constructor() {
        if (instance) return instance;
        
        this.useOpenAI = !!process.env.OPENAI_API_KEY;
        if (this.useOpenAI) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
        
        instance = this;
    }

    async initializeLocalModel() {
        try {
            if (!localTranscriber) {
                console.log('Initializing local Whisper model...');
                localTranscriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-large-v3', {
                    device: 'cuda',
                    quantize: true,
                    chunk_length_s: 30,
                    batch_size: 8
                });
                console.log('Local Whisper model initialized successfully on GPU');
            }
        } catch (error) {
            console.error('Failed to initialize local Whisper model:', error);
            throw error;
        }
    }

    /**
     * Extracts raw audio samples from WAV buffer
     * @private
     */
    _extractSamplesFromWAV(wavBuffer) {
        const view = new DataView(wavBuffer);
        const samples = new Float32Array((wavBuffer.byteLength - 44) / 2);
        
        for (let i = 0; i < samples.length; i++) {
            const sample = view.getInt16(44 + i * 2, true);
            samples[i] = sample / 32768.0;  // Convert to float
        }
        
        return samples;
    }

    /**
     * Transcribes audio data
     * @param {Buffer} audioData - Raw audio data
     * @param {string} language - Target language code (e.g., 'en', 'es')
     * @returns {Promise<string>} Transcribed text
     */
    async transcribe(audioData, language = 'en') {
        try {
            if (this.useOpenAI) {
                // Create a File object from the buffer
                const file = new File([audioData], 'audio.wav', { type: 'audio/wav' });

                const response = await this.openai.audio.transcriptions.create({
                    file: file,
                    model: 'whisper-1',
                    language,
                    response_format: 'text'
                });

                return response;
            } else {
                await this.initializeLocalModel();

                // Extract raw audio samples from WAV
                const samples = this._extractSamplesFromWAV(audioData.buffer);
                
                const result = await localTranscriber(samples, {
                    language,
                    task: 'transcribe',
                    return_timestamps: true,
                    chunk_length_s: 30,
                    stride_length_s: 5,
                    num_workers: 4,
                    batch_size: 8
                });

                return result.text;
            }
        } catch (error) {
            console.error({ error }, 'Transcription failed');
            throw error;
        }
    }
}

// Export a singleton instance
export default new WhisperService(); 