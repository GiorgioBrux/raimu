from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
import logging
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class TranslationRequest(BaseModel):
    text: str
    source_lang: str = "en"

# Initialize Translation model
try:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    
    logger.info(f"Using device: {device}")
    
    model_id = "CohereForAI/aya-23-35B"
    
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        device_map="auto",
        token=os.getenv('HUGGING_FACE_HUB_TOKEN')
    )
    
    tokenizer = AutoTokenizer.from_pretrained(model_id, token=os.getenv('HUGGING_FACE_HUB_TOKEN'))
    
    pipe = pipeline(
        "text-generation",
        model=model,
        tokenizer=tokenizer,
        torch_dtype=torch_dtype,
    )
    
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
        prompt = f"Translate the following {get_language_name(request.source_lang)} text to English. Only provide the translation, no explanations:\n{request.text}"
        
        result = pipe(
            prompt,
            max_new_tokens=512,
            temperature=0.3,
            do_sample=False
        )
        
        translation = result[0]['generated_text'].replace(prompt, '').strip()
        
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