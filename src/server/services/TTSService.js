import fetch from 'node-fetch';
import FormData from 'form-data';

class TTSService {
    constructor() {
        this.initialized = true;
        this.pythonServiceUrl = 'http://127.0.0.1:8001/tts';  // Python service URL
    }

    async synthesizeSpeech(text, language = 'en', speakerAudioBase64) {
        try {
            if (!speakerAudioBase64) {
                throw new Error('Speaker audio is required for voice cloning');
            }

            // Create form data
            const formData = new FormData();
            formData.append('text', text);
            formData.append('language', language);

            // Convert base64 to buffer for speaker audio
            const speakerBuffer = Buffer.from(speakerAudioBase64, 'base64');
            formData.append('speaker_audio', speakerBuffer, {
                filename: 'reference.wav',
                contentType: 'audio/wav'
            });
            console.log('Using speaker audio for voice cloning');

            const response = await fetch(this.pythonServiceUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`TTS service error: ${response.statusText}`);
            }

            // Parse JSON response that includes both audio and duration
            const result = await response.json();
            console.log("Audio duration:", result.duration);
            
            return {
                audio: result.audio,  // Base64 audio
                duration: result.duration  // Duration in seconds
            };
        } catch (error) {
            console.error('TTS Error:', error);
            throw error;
        }
    }
}

export default new TTSService(); 