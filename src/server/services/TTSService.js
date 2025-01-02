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
            console.log("Audio buffer length:", audioBuffer.byteLength);
            
            // Convert ArrayBuffer to Base64
            const audioArray = new Uint8Array(audioBuffer);
            const base64Audio = Buffer.from(audioArray).toString('base64');
            console.log("Base64 audio length:", base64Audio.length);
            
            return base64Audio;
        } catch (error) {
            console.error('TTS Error:', error);
            return null;
        }
    }
}

export default new TTSService(); 