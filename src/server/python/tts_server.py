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
import time
from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts
import torchaudio
from huggingface_hub import snapshot_download

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
    start_time = time.time()
    
    # Clear cache
    torch.cuda.empty_cache()

    # Check for CUDA availability
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    
    if device.startswith("cuda"):
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.cuda.set_per_process_memory_fraction(0.4)
        torch.cuda.empty_cache()
    
    # Initialize with manual loading for DeepSpeed support
    model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
    
    # Get model path using huggingface_hub
    logger.info(f"Downloading model: {model_name}")
    model_path = snapshot_download(
        repo_id="coqui/XTTS-v2",
        token=os.getenv('HUGGING_FACE_HUB_TOKEN')
    )
    
    config_path = os.path.join(model_path, "config.json")
    
    logger.info(f"Loading model from {model_path}")
    logger.info(f"Using config from {config_path}")
    
    config = XttsConfig()
    config.load_json(config_path)
    model = Xtts.init_from_config(config)
    model.load_checkpoint(
        config, 
        checkpoint_dir=model_path,
        use_deepspeed=True
    )
    model.cuda()
    
    init_time = time.time() - start_time
    logger.info(f"XTTS v2 Model initialized successfully in {init_time:.2f} seconds")
    
except Exception as e:
    logger.error(f"Error initializing TTS model: {e}")
    raise e

@app.post("/tts")
async def text_to_speech(
    text: str = Form(...),
    language: str = Form("en"),
    speaker_audio: UploadFile = File(...)
):
    try:
        request_start_time = time.time()
        logger.info("Text to speech request received")
        
        # Clean the text - remove trailing dots
        # https://github.com/coqui-ai/TTS/issues/3204
        # Dots make a breathing/noise sound in the audio
        cleaned_text = text.rstrip('.')
        
        logger.info(f"Original text: {text}")
        logger.info(f"Cleaned text: {cleaned_text}")
        logger.info(f"language={language}")

        # Handle speaker audio
        speaker_wav = None
        try:
            file_start_time = time.time()
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                content = await speaker_audio.read()
                temp_file.write(content)
                speaker_wav = temp_file.name
            file_time = time.time() - file_start_time
            logger.info(f"Saved speaker audio to {speaker_wav} in {file_time:.2f} seconds")

            # Get conditioning latents
            logger.info("Computing speaker latents...")
            gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(
                audio_path=[speaker_wav]
            )

            # Generate speech with DeepSpeed
            logger.info("Generating speech...")
            generation_start_time = time.time()
            out = model.inference(
                text=cleaned_text,
                language=language,
                gpt_cond_latent=gpt_cond_latent,
                speaker_embedding=speaker_embedding,
                # Add new parameters for better quality
                speed=1.0,  # Default speech speed
                enable_text_splitting=True  # Better handling of long texts
            )
            generation_time = time.time() - generation_start_time
            
            # Extract wav from output dictionary
            audio = out["wav"]  # Model returns dict with 'wav' key
            
            # Convert to numpy array if not already
            processing_start_time = time.time()
            if not isinstance(audio, np.ndarray):
                audio = np.array(audio)

            # Ensure audio is in float32 format and normalized
            audio = audio.astype(np.float32)
            if np.abs(audio).max() > 1.0:
                audio = audio / np.abs(audio).max()

            # Use correct sample rate from XTTS docs
            sr = 24000  # XTTS v2 uses 24kHz sample rate

            # Log audio properties
            logger.info(f"Audio properties:")
            logger.info(f"- Sample rate: {sr}")
            logger.info(f"- Shape: {audio.shape}")
            logger.info(f"- Data type: {audio.dtype}")
            logger.info(f"- Value range: [{audio.min():.3f}, {audio.max():.3f}]")

            # Calculate duration in seconds
            duration = len(audio) / sr

            # Convert to bytes
            buffer = io.BytesIO()
            sf.write(buffer, audio, sr, format='WAV', subtype='PCM_16')
            audio_bytes = buffer.getvalue()
            processing_time = time.time() - processing_start_time
            logger.info(f"Audio processing completed in {processing_time:.2f} seconds")
            logger.info(f"WAV file size: {len(audio_bytes)} bytes")

            total_time = time.time() - request_start_time
            logger.info(f"Total request processing time: {total_time:.2f} seconds")
            logger.info(f"Latency breakdown:")
            logger.info(f"- File handling: {file_time:.2f}s")
            logger.info(f"- Speech generation: {generation_time:.2f}s")
            logger.info(f"- Audio processing: {processing_time:.2f}s")

            # Convert to base64
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

            # Return JSON response with audio, duration and all the timing info
            return {
                "audio": audio_base64,
                "duration": duration,
                "sample_rate": sr,
                "timings": {
                    "file_handling": file_time,
                    "generation": generation_time,
                    "processing": processing_time,
                    "total": total_time
                }
            }

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