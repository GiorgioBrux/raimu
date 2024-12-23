import fetch from 'node-fetch';

let instance = null;

class TranslationService {
    constructor() {
        if (instance) return instance;
        this.initialized = true;
        instance = this;
    }

    async translate(text, sourceLang, targetLang) {
        try {
            const response = await fetch('http://127.0.0.1:8003/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    source_lang: sourceLang,
                    target_lang: targetLang
                })
            });

            if (!response.ok) {
                throw new Error(`Translation server error: ${response.statusText}`);
            }

            const result = await response.json();
            return result.text;
        } catch (error) {
            console.error('Translation Error:', error);
            return null;
        }
    }
}

export default new TranslationService(); 