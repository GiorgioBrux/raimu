import fetch from 'node-fetch';

class TTSService {
    constructor() {
        this.initialized = true;
        this.pythonServiceUrl = 'http://localhost:8001/tts';  // Python service URL
    }

    async synthesizeSpeech(text, language = 'en', transcribedAudio = null, transcribedText = null) {
        try {
            const response = await fetch(this.pythonServiceUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    language,
                    reference_audio: transcribedAudio,  // base64 audio from transcription
                    reference_text: transcribedText     // original transcribed text
                })
            });

            if (!response.ok) {
                throw new Error(`TTS service error: ${response.statusText}`);
            }

            const audioBuffer = await response.arrayBuffer();
            return audioBuffer;
        } catch (error) {
            console.error('TTS Error:', error);
            return null;
        }
    }
}

export default new TTSService(); 