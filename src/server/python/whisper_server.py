from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import logging
import io
import base64
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class TranscriptionRequest(BaseModel):
    audio_data: str  # Base64 encoded audio
    language: str = "en"

# Global variable for the pipeline
local_pipe = None

def initialize_model():
    global local_pipe
    if local_pipe is not None:
        return local_pipe
        
    logger.info("Initializing local Whisper model")
    try:
        # Clear cache and set memory optimizations
        torch.cuda.empty_cache()
        
        # Enable TF32 for better performance on Ampere GPUs (like A100)
        if torch.cuda.is_available():
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            # Set memory efficient options - using 30% of VRAM since Whisper is smaller than XTTS
            torch.cuda.set_per_process_memory_fraction(0.3)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        
        logger.info(f"Using device: {device}")
        
        model_id = "openai/whisper-large-v3"
        
        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id, 
            torch_dtype=torch_dtype,
            low_cpu_mem_usage=True,
            use_safetensors=True,
            device_map="auto"
        )
        
        processor = AutoProcessor.from_pretrained(model_id)
        
        local_pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            torch_dtype=torch_dtype,
            chunk_length_s=10,
            batch_size=16,
            stride_length_s=3,
            return_timestamps=True
        )
        
        logger.info("Local Whisper model initialized successfully")
        return local_pipe
    except Exception as e:
        logger.error(f"Error initializing local Whisper model: {e}")
        raise e

@app.post("/transcribe")
async def transcribe(request: TranscriptionRequest):
    global local_pipe
    
    # Check if OpenAI is available
    if os.getenv("OPENAI_API_KEY"):
        logger.info("OpenAI API key is available but JS is requesting fallback...")
    
    try:
        # Initialize model if not already initialized
        if local_pipe is None:
            local_pipe = initialize_model()
            
        # Decode base64 audio data
        audio_bytes = base64.b64decode(request.audio_data)
        
        # Process audio with local Whisper model
        result = local_pipe(
            audio_bytes,
            generate_kwargs={
                "language": request.language,
                "task": "transcribe",
                "max_length": 448
            }
        )
        return {"text": result["text"]}
            
    except Exception as e:
        logger.error(f"Error in transcription: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002) 