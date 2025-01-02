from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, pipeline
import logging
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class TranslationRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str

# Language code mapping for NLLB
LANG_CODE_MAP = {
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
}

# Initialize Translation model
try:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    
    logger.info(f"Using device: {device}")
    
    model_id = "facebook/nllb-200-distilled-1.3B"
    
    model = AutoModelForSeq2SeqLM.from_pretrained(
        model_id,
        torch_dtype=torch_dtype,
        device_map="auto",
        load_in_8bit=True if torch.cuda.is_available() else False
    )
    
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    
    logger.info("Translation model initialized successfully")
except Exception as e:
    logger.error(f"Error initializing Translation model: {e}")
    raise e

def get_language_name(lang_code):
    lang_map = {
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
    }
    return lang_map.get(lang_code, 'English')

@app.post("/translate")
async def translate(request: TranslationRequest):
    try:
        # Convert language codes to NLLB format
        source_lang_code = LANG_CODE_MAP.get(request.source_lang, 'eng_Latn')
        target_lang_code = LANG_CODE_MAP.get(request.target_lang, 'eng_Latn')
        
        # Create translation pipeline
        translator = pipeline(
            'translation',
            model=model,
            tokenizer=tokenizer,
            src_lang=source_lang_code,
            tgt_lang=target_lang_code,
            max_length=256,
        )
        
        # Translate
        output = translator(request.text)
        translation = output[0]['translation_text']
        
        return {"text": translation}
            
    except Exception as e:
        logger.error(f"Error in translation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Translation failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003) 