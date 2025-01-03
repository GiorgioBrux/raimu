from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
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

# Initialize Translation model
try:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    
    logger.info(f"Using device: {device}")
    
    model_id = "CohereForAI/aya-23-8B"
    
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        device_map="auto",
        load_in_8bit=True,
        torch_dtype=torch.float16,
        token=os.getenv('HUGGING_FACE_HUB_TOKEN')
    )
    
    tokenizer = AutoTokenizer.from_pretrained(model_id, token=os.getenv('HUGGING_FACE_HUB_TOKEN'))
    
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
        source_lang_name = get_language_name(request.source_lang)
        target_lang_name = get_language_name(request.target_lang)
        
        prompt = f"Translate the following {source_lang_name} text to {target_lang_name}. Only provide the translation, no explanations:\n{request.text}"
        messages = [
            {"role": "system", "content": "You are a helpful assistant that translates text from one language to another. Return the translation only, no explanations or other text. If the text provided to you is empty/blank, return an empty string"},
            {"role": "user", "content": prompt}
        ]

        # Convert to tensor and move to correct device
        input_ids = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_tensors="pt").to(device)

        # Generate using the model directly for more control
        outputs = model.generate(
            input_ids,
            max_new_tokens=512,
            temperature=0.3,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id
        )
        
        # Decode only the new tokens (excluding the prompt)
        translation = tokenizer.decode(outputs[0][input_ids.shape[1]:], skip_special_tokens=True).strip()
        
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