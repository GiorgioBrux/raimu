import { pipeline } from '@huggingface/transformers';

let instance = null;

class TranslationService {
    constructor() {
        if (instance) return instance;
        this.initialized = false;
        this.model = null;
        instance = this;
    }

    async init() {
        if (this.initialized) return;

        try {
            console.log('Initializing Translation Service...');
            this.model = await pipeline('text-generation', 'CohereForAI/aya-23-35B', {
                device: 'cuda',
                torch: true,
                quantize: true,
                max_new_tokens: 512
            });
            this.initialized = true;
            console.log('Translation Service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Translation service:', error);
            throw error;
        }
    }

    async translate(text, sourceLang) {
        if (!this.initialized) {
            await this.init();
        }

        try {
            const prompt = `Translate the following ${this.getLanguageName(sourceLang)} text to English. Only provide the translation, no explanations:
${text}`;
            
            const result = await this.model(prompt, {
                temperature: 0.3,
                do_sample: false
            });

            const translation = result[0].generated_text
                .replace(prompt, '')
                .trim();

            return translation;
        } catch (error) {
            console.error('Translation Error:', error);
            return null;
        }
    }

    getLanguageName(langCode) {
        const langMap = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'nl': 'Dutch',
            'pl': 'Polish',
            'ru': 'Russian',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean'
        };
        
        return langMap[langCode] || 'English';
    }
}

export default new TranslationService(); 