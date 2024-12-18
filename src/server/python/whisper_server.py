from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import numpy as np
import logging
import io
import soundfile as sf
import base64

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class TranscriptionRequest(BaseModel):
    audio_data: str  # Base64 encoded audio
    language: str = "en"

# Initialize Whisper
try:
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
    
    pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=torch_dtype,
        chunk_length_s=30,
        batch_size=8
    )
    
    logger.info("Whisper model initialized successfully")
except Exception as e:
    logger.error(f"Error initializing Whisper model: {e}")
    raise e

@app.post("/transcribe")
async def transcribe(request: TranscriptionRequest):
    try:
        # Decode base64 audio data
        audio_bytes = base64.b64decode(request.audio_data)
        
        # Process audio with Whisper
        result = pipe(
            audio_bytes,
            batch_size=8,
            return_timestamps=True,
            chunk_length_s=30,
            stride_length_s=5,
            num_workers=4,
            language=request.language,
            task="transcribe"
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