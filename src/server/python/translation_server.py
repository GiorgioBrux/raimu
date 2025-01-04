from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from optimum.bettertransformer import BetterTransformer
import logging
import os
import time  # Add time import

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
    
    logger.info(f"Loading model: {model_id}")
    model_load_start = time.time()

    # Configure 4-bit quantization - simple but effective for A100
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16  # Use A100's native bfloat16
    )

    # Configure model for maximum speed
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch_dtype,
        device_map="auto",
        use_safetensors=True,
        use_flash_attention_2=True,
        quantization_config=bnb_config,
        max_memory={0: "38GB"},
        token=os.getenv('HUGGING_FACE_HUB_TOKEN')
    )
    
    model_load_time = time.time() - model_load_start
    logger.info(f"Model loaded in {model_load_time:.2f} seconds")
    
    tokenizer_start = time.time()
    # Convert to BetterTransformer for more speed
    model = BetterTransformer.transform(model)
    
    tokenizer = AutoTokenizer.from_pretrained(
        model_id, 
        token=os.getenv('HUGGING_FACE_HUB_TOKEN'),
        use_fast=True,  # Use fast tokenizer
        model_max_length=2048,  # Set static max length
        padding_side="left",
        truncation_side="left"
    )
    tokenizer_time = time.time() - tokenizer_start
    logger.info(f"Tokenizer initialized in {tokenizer_time:.2f} seconds")
    
    # Pre-compile model for static shapes
    torch.cuda.empty_cache()
    model.eval()
    torch._C._jit_set_bailout_depth(20)
    
    # Warmup
    warmup_start = time.time()
    logger.info("Warming up model...")
    warmup_text = "This is a test sentence to warm up the model."
    for length in [32, 64, 128]:
        dummy_input = tokenizer(warmup_text, return_tensors="pt").to(device)
        with torch.inference_mode(), torch.cuda.amp.autocast():
            # Time the generation
            gen_start = time.time()
            output = model.generate(**dummy_input, max_new_tokens=length)
            gen_time = time.time() - gen_start
            tokens_per_sec = length / gen_time
            logger.info(f"Warmup generation speed for {length} tokens: {tokens_per_sec:.1f} tokens/sec")
            
    warmup_time = time.time() - warmup_start
    logger.info(f"Model warmup completed in {warmup_time:.2f} seconds")
    
    total_init_time = time.time() - start_time
    logger.info(f"Total initialization time: {total_init_time:.2f} seconds")
    logger.info(f"Initialization breakdown:")
    logger.info(f"- Model loading: {model_load_time:.2f}s")
    logger.info(f"- Tokenizer setup: {tokenizer_time:.2f}s")
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
        request_start = time.time()
        
        # Prompt preparation
        prompt_start = time.time()
        source_lang_name = get_language_name(request.source_lang)
        target_lang_name = get_language_name(request.target_lang)
        
        prompt = f"Translate the following {source_lang_name} text to {target_lang_name}. Only provide the translation, no explanations:\n{request.text}"
        messages = [
            {"role": "system", "content": "You are a helpful assistant that translates text from one language to another. Return the translation only, no explanations or other text."},
            {"role": "user", "content": prompt}
        ]

        input_text = ""
        for msg in messages:
            if msg["role"] == "system":
                input_text += f"System: {msg['content']}\n"
            else:
                input_text += f"User: {msg['content']}\n"
        input_text += "Assistant: "
        prompt_time = time.time() - prompt_start
        
        # Tokenization
        tokenize_start = time.time()
        inputs = tokenizer(
            input_text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=2048
        ).to(device)
        input_token_count = inputs['input_ids'].shape[1]
        tokenize_time = time.time() - tokenize_start
        
        # Generation
        generate_start = time.time()
        with torch.inference_mode(), torch.cuda.amp.autocast():
            outputs = model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.3,
                do_sample=False,
                use_cache=True,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
                repetition_penalty=1.0,
                num_beams=1,
                early_stopping=True
            )
        generate_time = time.time() - generate_start
        output_token_count = outputs.shape[1] - input_token_count
        tokens_per_second = output_token_count / generate_time
        
        # Decoding
        decode_start = time.time()
        translation = tokenizer.decode(
            outputs[0][inputs['input_ids'].shape[1]:],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False
        ).strip()
        decode_time = time.time() - decode_start
        
        total_time = time.time() - request_start
        
        # Log detailed performance metrics
        logger.info(f"Translation completed in {total_time:.2f} seconds")
        logger.info(f"Performance metrics:")
        logger.info(f"- Input text length: {len(request.text)} chars")
        logger.info(f"- Output text length: {len(translation)} chars")
        logger.info(f"- Input tokens: {input_token_count}")
        logger.info(f"- Generated tokens: {output_token_count}")
        logger.info(f"- Generation speed: {tokens_per_second:.1f} tokens/sec")
        logger.info(f"Latency breakdown:")
        logger.info(f"- Prompt preparation: {prompt_time:.3f}s")
        logger.info(f"- Tokenization: {tokenize_time:.3f}s")
        logger.info(f"- Generation: {generate_time:.3f}s")
        logger.info(f"- Decoding: {decode_time:.3f}s")
        
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