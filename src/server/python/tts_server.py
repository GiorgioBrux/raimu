from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import io
import soundfile as sf
import base64
import os
import tempfile
import torch
import logging
from tqdm import tqdm

# Wrap the problematic import in a try-except
try:
    from f5_tts.api import F5TTS
except AttributeError as e:
    # If the specific error is about HTTPClientError, try to patch it
    import botocore.exceptions
    if not hasattr(botocore.exceptions, 'HTTPClientError'):
        botocore.exceptions.HTTPClientError = botocore.exceptions.ClientError
    # Try importing again
    from f5_tts.api import F5TTS

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class TTSRequest(BaseModel):
    text: str
    language: str = "en"
    reference_audio: str | None = None
    reference_text: str | None = None

# Custom progress class that uses our logger
class LoggerProgress:
    @staticmethod
    def tqdm(iterable):
        return tqdm(iterable, desc="Generating", leave=False)

# Initialize TTS model
try:
    # Check for CUDA availability
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    
    if device == "cuda":
        # Enable TF32 for better performance on Ampere GPUs
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        # Free cache before model load
        torch.cuda.empty_cache()
    
    tts = F5TTS(
        model_type="F5-TTS",
        device=device
    )
    
    logger.info("TTS Model initialized successfully")
except Exception as e:
    logger.error(f"Error initializing TTS model: {e}")
    raise e

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    temp_ref = None
    try:
        logger.info(f"Received TTS request: text='{request.text}', language={request.language}")
        
        if request.reference_audio:
            # Create temp file
            temp_ref = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            
            # Decode and save reference audio
            audio_data = base64.b64decode(request.reference_audio)
            temp_ref.write(audio_data)
            temp_ref.flush()
            temp_ref.close()  # Close the file before using it
            logger.info(f"Saved reference audio to {temp_ref.name}")
            
            # Get reference text
            ref_text = request.reference_text
            if not ref_text:
                logger.info("Transcribing reference audio...")
                ref_text = tts.transcribe(temp_ref.name, language=request.language)
            logger.info(f"Reference text: '{ref_text}'")
            
            # Generate with voice cloning
            logger.info("Generating TTS with voice cloning...")
            audio, sr, _ = tts.infer(
                ref_file=temp_ref.name,
                ref_text=ref_text,
                gen_text=request.text,
                show_info=lambda x: logger.info(x),
                progress=LoggerProgress
            )
        else:
            # Generate without voice cloning
            logger.info("Generating TTS without voice cloning...")
            audio, sr, _ = tts.infer(
                ref_file=None,
                ref_text=None,
                gen_text=request.text,
                show_info=lambda x: logger.info(x),
                progress=LoggerProgress
            )
        
        # Move audio to CPU if it's on GPU
        if torch.is_tensor(audio):
            audio = audio.cpu().numpy()
        
        # Convert to bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio, sr, format='WAV')
        audio_bytes = buffer.getvalue()
        logger.info("Successfully generated audio")
        
        # Return audio with proper content type
        return Response(
            content=audio_bytes,
            media_type="audio/wav"
        )
            
    except Exception as e:
        logger.error(f"Error in TTS generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"TTS generation failed: {str(e)}"
        )
    finally:
        # Clean up temp file
        try:
            if temp_ref and os.path.exists(temp_ref.name):
                os.unlink(temp_ref.name)
                logger.info(f"Cleaned up temporary file {temp_ref.name}")
        except Exception as e:
            logger.warning(f"Failed to clean up temp file: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)