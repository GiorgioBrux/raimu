import OpenAI from 'openai';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { File } from 'buffer';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

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

    /**
     * Transcribes audio data
     * @param {Buffer} audioData - Raw audio data
     * @param {string} language - Target language code (e.g., 'en', 'es')
     * @returns {Promise<string>} Transcribed text
     */
    async transcribe(audioData, language = 'en') {
        try {
            if (this.useOpenAI) {
                // OpenAI code remains the same...
                const file = new File([audioData], 'audio.wav', { type: 'audio/wav' });
                const response = await this.openai.audio.transcriptions.create({
                    file: file,
                    model: 'whisper-1',
                    language,
                    response_format: 'text'
                });
                return response;
            } else {
                // Use local Python Whisper server
                const response = await fetch('http://127.0.0.1:8002/transcribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        audio_data: audioData.toString('base64'),
                        language
                    })
                });

                if (!response.ok) {
                    throw new Error(`Whisper server error: ${response.statusText}`);
                }

                const result = await response.json();
                return result.text;
            }
        } catch (error) {
            console.error({ error }, 'Transcription failed');
            throw error;
        }
    }
}

export default new WhisperService(); 