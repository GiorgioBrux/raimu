from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqGeneration, pipeline
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class TranslationRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str

# Load the model and tokenizer once
try:
    # Check for CUDA availability
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    
    if device == "cuda":
        # Enable TF32 for better performance on Ampere GPUs
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        # Set memory efficient options
        torch.cuda.set_per_process_memory_fraction(0.4)  # Limit to 40% of VRAM
        torch.cuda.empty_cache()

    model_name = "facebook/nllb-200-distilled-600M"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqGeneration.from_pretrained(model_name).to(device)
    
    logger.info("Translation model initialized successfully")
except Exception as e:
    logger.error(f"Error initializing translation model: {e}")
    raise e

def get_flores_code(lang_code):
    """Convert ISO language code to FLORES-200 code"""
    flores_codes = {
        'en': 'eng_Latn',
        'es': 'spa_Latn',
        'fr': 'fra_Latn',
        'de': 'deu_Latn',
        'it': 'ita_Latn',
        'pt': 'por_Latn',
        'nl': 'nld_Latn',
        'pl': 'pol_Latn',
        'ru': 'rus_Cyrl',
        'ja': 'jpn_Jpan',
        'ko': 'kor_Hang',
        'zh': 'zho_Hans',
        'ar': 'arb_Arab',
        'hi': 'hin_Deva',
        'tr': 'tur_Latn',
        'vi': 'vie_Latn',
        'th': 'tha_Thai',
        'id': 'ind_Latn',
        'ms': 'msa_Latn',
        'fa': 'pes_Arab'
    }
    return flores_codes.get(lang_code, 'eng_Latn')  # Default to English if code not found

@app.post("/translate")
async def translate(request: TranslationRequest):
    try:
        logger.info(f"Received translation request: text='{request.text}', source={request.source_lang}, target={request.target_lang}")
        
        # Convert language codes to FLORES-200 format
        src_flores = get_flores_code(request.source_lang)
        tgt_flores = get_flores_code(request.target_lang)

        # Create translation pipeline
        translator = pipeline('translation', model=model, tokenizer=tokenizer,
                            src_lang=src_flores, tgt_lang=tgt_flores, device=device)

        # Translate the text
        result = translator(request.text, max_length=400)
        translated_text = result[0]['translation_text']
        
        logger.info("Successfully translated text")
        return {"text": translated_text}

    except Exception as e:
        logger.error(f"Error in translation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Translation failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003) 