from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from optimum.bettertransformer import BetterTransformer
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
    device = "cuda"
    torch_dtype = torch.bfloat16
    
    logger.info(f"Using device: {device}")
    
    # Maximum CUDA optimizations
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    torch.backends.cuda.enable_flash_sdp(enabled=True)
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.enabled = True
    
    model_id = "mistralai/Mixtral-8x7B-Instruct-v0.1"
    
    # Configure model for maximum speed
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch_dtype,
        device_map="auto",
        use_safetensors=True,
        use_flash_attention_2=True,
        max_memory={0: "38GB"},  # Reserve most of A100's memory
        token=os.getenv('HUGGING_FACE_HUB_TOKEN')
    )
    
    # Convert to BetterTransformer
    model = BetterTransformer.transform(model)
    
    tokenizer = AutoTokenizer.from_pretrained(
        model_id, 
        token=os.getenv('HUGGING_FACE_HUB_TOKEN'),
        use_fast=True,  # Use fast tokenizer
        model_max_length=2048,  # Set static max length
        padding_side="left",
        truncation_side="left"
    )
    
    # Pre-compile model for static shapes
    torch.cuda.empty_cache()
    model.eval()
    torch._C._jit_set_bailout_depth(20)  # More aggressive fusion
    
    # Warmup with different sequence lengths
    logger.info("Warming up model...")
    for length in [32, 64, 128, 256]:
        dummy_input = tokenizer("X" * length, return_tensors="pt").to(device)
        with torch.inference_mode(), torch.cuda.amp.autocast():
            model.generate(**dummy_input, max_new_tokens=length)
    
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
            {"role": "system", "content": "You are a helpful assistant that translates text from one language to another. Return the translation only, no explanations or other text."},
            {"role": "user", "content": prompt}
        ]

        # Format the messages into a single string
        input_text = ""
        for msg in messages:
            if msg["role"] == "system":
                input_text += f"System: {msg['content']}\n"
            else:
                input_text += f"User: {msg['content']}\n"
        input_text += "Assistant: "

        # Tokenize with static shapes for better performance
        inputs = tokenizer(
            input_text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=2048
        ).to(device)
        
        # Generate with maximum optimization
        with torch.inference_mode(), torch.cuda.amp.autocast():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.3,
                do_sample=False,  # Deterministic generation is faster
                use_cache=True,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
                repetition_penalty=1.0,  # Disable repetition penalty for speed
                num_beams=1,  # Disable beam search for speed
                early_stopping=True
            )
        
        # Decode only the new tokens
        translation = tokenizer.decode(
            outputs[0][inputs['input_ids'].shape[1]:],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False  # Faster
        ).strip()
        
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