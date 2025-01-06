from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from llama_cpp import Llama
import logging
import os
import time
import re
from huggingface_hub import hf_hub_download

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
    start_time = time.time()
    
    model_id = "mradermacher/Mixtral-8x7B-Instruct-v0.1-GGUF"
    model_basename = "Mixtral-8x7B-Instruct-v0.1.Q4_K_S.gguf"  # 26.8GB, fast and recommended
    
    logger.info(f"Downloading model: {model_id}/{model_basename}")
    model_path = hf_hub_download(
        repo_id=model_id,
        filename=model_basename,
        token=os.getenv('HUGGING_FACE_HUB_TOKEN')
    )
    
    logger.info(f"Loading model from: {model_path}")
    model_load_start = time.time()

    # Initialize with GPU acceleration and memory efficient settings
    model = Llama(
        model_path=model_path,
        n_ctx=2048,          # Context window
        n_batch=512,         # Batch size for prompt processing
        n_gpu_layers=-1,     # Offload all to GPU
        n_threads=8,         # CPU threads for processing
        main_gpu=0,         # Main GPU device to use
        tensor_split=None,   # Auto split tensors across GPUs if multiple available
        seed=42,            # For reproducibility
        use_mlock=False,    # Don't lock memory
        chat_format="mistral-instruct",
        use_mmap=True       # Use memory mapping for efficient loading
    )
    
    model_load_time = time.time() - model_load_start
    logger.info(f"Model loaded in {model_load_time:.2f} seconds")
    
    # Warmup
    warmup_start = time.time()
    logger.info("Warming up model...")
    warmup_text = "This is a test sentence to warm up the model."
    for length in [32, 64, 128]:
        gen_start = time.time()
        # Use chat completion API consistently
        _ = model.create_chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": "You are a translator. Translate text to English. Provide only the translation, no explanations."
                },
                {
                    "role": "user",
                    "content": warmup_text
                }
            ],
            max_tokens=length,
            temperature=0.3,
            top_p=0.95,
            stop=["</s>"]
        )
        gen_time = time.time() - gen_start
        tokens_per_sec = length / gen_time
        logger.info(f"Warmup generation speed for {length} tokens: {tokens_per_sec:.1f} tokens/sec")
            
    warmup_time = time.time() - warmup_start
    logger.info(f"Model warmup completed in {warmup_time:.2f} seconds")
    
    total_init_time = time.time() - start_time
    logger.info(f"Total initialization time: {total_init_time:.2f} seconds")
    logger.info(f"Initialization breakdown:")
    logger.info(f"- Model loading: {model_load_time:.2f}s")
    logger.info(f"- Model warmup: {warmup_time:.2f}s")
    
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
        if not request.text.strip():
            raise HTTPException(
                status_code=400,
                detail="Empty text provided for translation"
            )
            
        if len(request.text) > 1000:
            raise HTTPException(
                status_code=400, 
                detail="Text exceeds maximum length of 1000 characters"
            )
            
        request_start = time.time()
        
        # Prepare prompt
        source_lang_name = get_language_name(request.source_lang)
        target_lang_name = get_language_name(request.target_lang)
        
        # Generation
        generate_start = time.time()
        system_message = f"""IMPORTANT: You are a translation machine that ONLY outputs direct translations from {source_lang_name} to {target_lang_name}. 
CRITICAL RULES:
1. Output NOTHING except the pure translation
2. NEVER add:
   - HTML tags or formatting
   - Links or URLs
   - Explanations or notes
   - Code snippets or metadata
   - Dashes or separators
   - Additional translations
   - Greetings or pleasantries
3. For single words or very short phrases:
   - Translate in a way that is natural and makes sense in the target language
   - Do not expand or add context
   - Keep it equally concise
4. For gendered language:
   - When gender is clear from context, use appropriate gender
   - When gender is unclear, prefer masculine form
   - For professions/titles where gender is unclear, use masculine form
   - Never use split forms (e.g., "o/a" or "squisito/a")

Example good translations:
Input: "Hello" → Output: "Ciao"
Input: "Hawaii" → Output: "Hawaii"
Input: "Hey!" → Output: "Ciao!"
"""

        prompt = f"<s>[INST] <<SYS>>{system_message}<</SYS>>\n\n{request.text} [/INST]"
        
        response = model(
            prompt,
            max_tokens=512,
            temperature=0.3,
            top_p=0.95,
            top_k=40,
            repeat_penalty=1.3,
            stop=["</s>", "[/INST]", "Note:", "(", "Translation:", "User:", "Input:", "\n", "Here", "This", "The translation"],
            echo=False
        )
        generate_time = time.time() - generate_start
        
        # Extract and clean translation from response
        translation = response["choices"][0]["text"].strip().strip('"\'')
        
        total_time = time.time() - request_start
        
        # Log performance metrics
        logger.info(f"Translation completed in {total_time:.2f} seconds")
        logger.info(f"Performance metrics:")
        logger.info(f"- Input text length: {len(request.text)} chars")
        logger.info(f"- Output text length: {len(translation)} chars")
        logger.info(f"- Generation time: {generate_time:.3f}s")
        
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