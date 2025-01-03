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

            const responseBuffer = await response.arrayBuffer();
            console.log("Audio buffer length:", responseBuffer.byteLength);
            
            // Convert ArrayBuffer to Base64
            const audioArray = new Uint8Array(responseBuffer);
            const base64Audio = Buffer.from(audioArray).toString('base64');
            console.log("Base64 audio length:", base64Audio.length);
            
            return base64Audio;
        } catch (error) {
            console.error('TTS Error:', error);
            throw error;  // Re-throw the error to handle it in the caller
        }
    }
}

export default new TTSService(); 