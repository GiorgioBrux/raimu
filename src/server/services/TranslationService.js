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
            this.model = await pipeline('translation', 'Xenova/nllb-200-distilled-600M');
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
            const sourceNLLB = this.convertToNLLBCode(sourceLang);
            
            const result = await this.model(text, {
                src_lang: sourceNLLB,
                tgt_lang: 'eng_Latn'
            });

            return result[0].translation_text;
        } catch (error) {
            console.error('Translation Error:', error);
            return null;
        }
    }

    convertToNLLBCode(langCode) {
        // Mapping of common ISO codes to NLLB codes
        const langMap = {
            'en': 'eng_Latn',
            'es': 'spa_Latn',
            'fr': 'fra_Latn',
            'de': 'deu_Latn',
            'it': 'ita_Latn',
            'pt': 'por_Latn',
            'nl': 'nld_Latn',
            'pl': 'pol_Latn',
            'ru': 'rus_Cyrl',
            'zh': 'zho_Hans',
            'ja': 'jpn_Jpan',
            'ko': 'kor_Hang'
            // Add more mappings as needed
        };
        
        return langMap[langCode] || 'eng_Latn';
    }
}

// Export a singleton instance
export default new TranslationService(); 