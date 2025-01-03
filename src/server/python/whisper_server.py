from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import logging
import io
import base64
import os
from openai import OpenAI
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

# Initialize OpenAI client if API key is available
openai_client = None
if os.getenv("OPENAI_API_KEY"):
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    logger.info("OpenAI client initialized successfully")
else:
    logger.warning("No OpenAI API key found in environment variables")

# Initialize local Whisper model only if OpenAI client is not available
local_pipe = None
if not openai_client:
    logger.info("OpenAI client not available, initializing local Whisper model")
    try:
        # Clear cache
        torch.cuda.empty_cache()

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
            chunk_length_s=30,
            batch_size=6,
            stride_length_s=5,
            return_timestamps=True
        )
        
        logger.info("Local Whisper model initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing local Whisper model: {e}")
        if not openai_client:  # Only raise if we don't have OpenAI as fallback
            raise e

@app.post("/transcribe")
async def transcribe(request: TranscriptionRequest):
    try:
        # Decode base64 audio data
        audio_bytes = base64.b64decode(request.audio_data)
        
        if openai_client:
            # Use OpenAI's Whisper API
            # Save audio bytes to a temporary file
            temp_file = io.BytesIO(audio_bytes)
            temp_file.name = "audio.wav"  # OpenAI needs a file name
            
            try:
                response = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=temp_file,
                    language=request.language
                )
                return {"text": response.text}
            except Exception as e:
                logger.error(f"OpenAI API error: {str(e)}")
                if local_pipe:  # Try local model as fallback if available
                    logger.info("Falling back to local model")
                else:
                    raise
        
        if local_pipe:
            # Process audio with local Whisper model
            result = local_pipe(
                audio_bytes,
                batch_size=6,
                return_timestamps=True,
                chunk_length_s=30,
                stride_length_s=5,
                generate_kwargs={
                    "language": request.language,
                    "task": "transcribe",
                    "max_length": 448
                }
            )
            return {"text": result["text"]}
        else:
            raise HTTPException(
                status_code=500,
                detail="No transcription service available"
            )
            
    except Exception as e:
        logger.error(f"Error in transcription: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002) 