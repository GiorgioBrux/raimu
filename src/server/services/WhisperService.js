import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Readable } from 'stream';
import { File } from 'buffer';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

export class WhisperService {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * Transcribes audio data
     * @param {Buffer} audioData - Raw audio data
     * @param {string} language - Target language code (e.g., 'en', 'es')
     * @returns {Promise<string>} Transcribed text
     */
    async transcribe(audioData, language = 'en') {
        try {
            // Create a File object from the buffer
            const file = new File([audioData], 'audio.wav', { type: 'audio/wav' });

            const response = await this.openai.audio.transcriptions.create({
                file: file,
                model: 'whisper-1',
                language,
                response_format: 'text'
            });

            return response;
        } catch (error) {
            console.error({ error }, 'Transcription failed');
            throw error;
        }
    }
} 