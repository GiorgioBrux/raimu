from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
import io
import soundfile as sf
import base64
import os
import tempfile
import torch
import logging
from TTS.api import TTS
import numpy as np

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set environment variable to accept the license agreement
os.environ["COQUI_TOS_AGREED"] = "1"

app = FastAPI()

class TTSRequest(BaseModel):
    text: str
    language: str = "en"

# Initialize TTS model
try:
    # Clear cache
    torch.cuda.empty_cache()

    # Check for CUDA availability
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    
    if device.startswith("cuda"):
        # Enable TF32 for better performance on Ampere GPUs
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        # Set memory efficient options
        torch.cuda.set_per_process_memory_fraction(0.4)  # Limit to 40% of VRAM
        torch.cuda.empty_cache()
    
    # Initialize XTTS v2 model
    model = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True).to(device)
    logger.info("XTTS v2 Model initialized successfully")
    
except Exception as e:
    logger.error(f"Error initializing TTS model: {e}")
    raise e

@app.post("/tts")
async def text_to_speech(
    text: str = Form(...),
    language: str = Form("en"),
    speaker_audio: UploadFile = File(...)  # Make speaker_audio required
):
    try:
        logger.info("Text to speech request received")
        logger.info(f"text={text}")
        logger.info(f"language={language}")

        # Handle speaker audio
        speaker_wav = None
        try:
            # Save uploaded file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                content = await speaker_audio.read()
                temp_file.write(content)
                speaker_wav = temp_file.name
                logger.info(f"Saved speaker audio to {speaker_wav}")

            # Generate speech with voice cloning
            logger.info("Generating speech with voice cloning...")
            audio = model.tts(
                text=text,
                language=language,
                speaker_wav=speaker_wav
            )

            # Convert to numpy array if not already
            if not isinstance(audio, np.ndarray):
                audio = np.array(audio)

            # Ensure audio is in float32 format and normalized
            audio = audio.astype(np.float32)
            if np.abs(audio).max() > 1.0:
                audio = audio / np.abs(audio).max()

            # Get sample rate from model config
            sr = model.synthesizer.output_sample_rate

            # Log audio properties
            logger.info(f"Audio properties:")
            logger.info(f"- Sample rate: {sr}")
            logger.info(f"- Shape: {audio.shape}")
            logger.info(f"- Data type: {audio.dtype}")
            logger.info(f"- Value range: [{audio.min():.3f}, {audio.max():.3f}]")

            # Convert to bytes
            buffer = io.BytesIO()
            sf.write(buffer, audio, sr, format='WAV', subtype='PCM_16')
            audio_bytes = buffer.getvalue()
            logger.info(f"WAV file size: {len(audio_bytes)} bytes")

            # Return audio with proper content type
            return Response(
                content=audio_bytes,
                media_type="audio/wav"
            )

        finally:
            # Clean up temporary file if it exists
            if speaker_wav and os.path.exists(speaker_wav):
                os.unlink(speaker_wav)
                logger.info(f"Cleaned up temporary file {speaker_wav}")

    except Exception as e:
        logger.error(f"Error in TTS generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"TTS generation failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)