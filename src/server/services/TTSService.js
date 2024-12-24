import fetch from 'node-fetch';

class TTSService {
    constructor() {
        this.initialized = true;
        this.pythonServiceUrl = 'http://127.0.0.1:8001/tts';  // Python service URL
    }

    async synthesizeSpeech(text, language = 'en', transcribedAudio = null, transcribedText = null) {
        try {
            // Prepare request body, only including reference data if both are provided
            const requestBody = {
                text,
                language
            };

            // Only add reference data if both audio and text are provided
            if (transcribedAudio && transcribedText) {
                requestBody.reference_audio = transcribedAudio;
                requestBody.reference_text = transcribedText;
                console.log('Using reference audio and text for TTS');
            }
            else {
                console.log('No reference data for TTS');
            }

            const response = await fetch(this.pythonServiceUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
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