from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import logging
import io
import base64
import os
from dotenv import load_dotenv
import time  # Add time import

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
        
    start_time = time.time()
    logger.info("Initializing local Whisper model")
    try:
        # Clear cache and set memory optimizations
        cuda_start = time.time()
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
        cuda_time = time.time() - cuda_start
        
        model_id = "openai/whisper-large-v3"
        
        # Load model
        model_start = time.time()
        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id, 
            torch_dtype=torch_dtype,
            low_cpu_mem_usage=True,
            use_safetensors=True,
            device_map="auto"
        )
        model_time = time.time() - model_start
        logger.info(f"Model loaded in {model_time:.2f} seconds")
        
        # Load processor
        processor_start = time.time()
        processor = AutoProcessor.from_pretrained(model_id)
        processor_time = time.time() - processor_start
        logger.info(f"Processor loaded in {processor_time:.2f} seconds")
        
        # Create pipeline
        pipeline_start = time.time()
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
        pipeline_time = time.time() - pipeline_start
        
        total_time = time.time() - start_time
        logger.info(f"Initialization completed in {total_time:.2f} seconds")
        logger.info(f"Initialization breakdown:")
        logger.info(f"- CUDA setup: {cuda_time:.2f}s")
        logger.info(f"- Model loading: {model_time:.2f}s")
        logger.info(f"- Processor loading: {processor_time:.2f}s")
        logger.info(f"- Pipeline setup: {pipeline_time:.2f}s")
        
        return local_pipe
    except Exception as e:
        logger.error(f"Error initializing local Whisper model: {e}")
        raise e

@app.post("/transcribe")
async def transcribe(request: TranscriptionRequest):
    global local_pipe
    
    try:
        request_start = time.time()
        
        # Initialize model if not already initialized
        if local_pipe is None:
            init_start = time.time()
            local_pipe = initialize_model()
            init_time = time.time() - init_start
            logger.info(f"Model initialization took {init_time:.2f} seconds")
            
        # Decode base64 audio data
        decode_start = time.time()
        audio_bytes = base64.b64decode(request.audio_data)
        decode_time = time.time() - decode_start
        
        # Process audio with local Whisper model
        inference_start = time.time()
        result = local_pipe(
            audio_bytes,
            generate_kwargs={
                "language": request.language,
                "task": "transcribe",
                "max_length": 448
            }
        )
        inference_time = time.time() - inference_start
        
        total_time = time.time() - request_start
        
        # Log timing information
        logger.info(f"Transcription completed in {total_time:.2f} seconds")
        logger.info(f"Latency breakdown:")
        logger.info(f"- Audio decoding: {decode_time:.2f}s")
        logger.info(f"- Inference: {inference_time:.2f}s")
        logger.info(f"Input audio size: {len(request.audio_data)} bytes")
        logger.info(f"Output text length: {len(result['text'])} chars")
        if inference_time > 0:  # Avoid division by zero
            logger.info(f"Processing speed: {len(request.audio_data) / inference_time / 1024:.1f} KB/s")
        
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