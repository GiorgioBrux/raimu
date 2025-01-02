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
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer
import numpy as np

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
    
    if device.startswith("cuda"):
        # Enable TF32 for better performance on Ampere GPUs
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        # Set memory efficient options
        torch.cuda.set_per_process_memory_fraction(0.4)  # Limit to 40% of VRAM
        torch.cuda.empty_cache()
    
    model = ParlerTTSForConditionalGeneration.from_pretrained("parler-tts/parler-tts-large-v1", revision= "refs/pr/9").to(device)
    tokenizer = AutoTokenizer.from_pretrained("parler-tts/parler-tts-large-v1")
    
    logger.info("TTS Model initialized successfully")
except Exception as e:
    logger.error(f"Error initializing TTS model: {e}")
    raise e

# Define voice descriptions for different styles
VOICE_DESCRIPTIONS = {
    "default": "A clear and professional speaker with a natural tone, speaking at a moderate pace with good articulation.",
    "friendly": "A warm and friendly speaker with an engaging tone, speaking expressively at a comfortable pace.",
    "formal": "A formal and authoritative speaker with precise pronunciation, maintaining a professional demeanor.",
    "casual": "A relaxed and casual speaker with a conversational style, speaking naturally and informally."
}

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    temp_ref = None
    try:
        logger.info("Text to speech request received")
        logger.info(f"text={request.text}")
        logger.info(f"language={request.language}")
        logger.info(f"is_reference_audio={request.reference_audio is not None}")
        logger.info(f"is_reference_text={request.reference_text is not None}")
        

        description = VOICE_DESCRIPTIONS["default"]
        
        # Prepare inputs
        input_ids = tokenizer(description, return_tensors="pt").input_ids.to(device)
        prompt_input_ids = tokenizer(request.text, return_tensors="pt").input_ids.to(device)
        
        # Generate audio
        logger.info("Generating TTS audio...")
        generation = model.generate(
            input_ids=input_ids,
            prompt_input_ids=prompt_input_ids
        )
        
        # Convert to numpy array
        audio = generation.cpu().numpy().squeeze()
        sr = model.config.sampling_rate
        
        # Ensure audio is in float32 format and normalized
        audio = audio.astype(np.float32)
        if np.abs(audio).max() > 1.0:
            audio = audio / np.abs(audio).max()
        
        # Log audio properties
        logger.info(f"Audio properties:")
        logger.info(f"- Sample rate: {sr}")
        logger.info(f"- Shape: {audio.shape}")
        logger.info(f"- Data type: {audio.dtype}")
        logger.info(f"- Value range: [{audio.min():.3f}, {audio.max():.3f}]")
        
        # Convert to bytes with explicit parameters
        buffer = io.BytesIO()
        sf.write(buffer, audio, sr, format='WAV', subtype='PCM_16')  # Use 16-bit PCM instead of float
        audio_bytes = buffer.getvalue()
        logger.info(f"WAV file size: {len(audio_bytes)} bytes")
        
        # # Save the audio file locally for testing
        # test_file_path = os.path.join(os.path.dirname(__file__), "test_output.wav")
        # with open(test_file_path, "wb") as f:
        #     f.write(audio_bytes)
        # logger.info(f"Saved test audio file to: {test_file_path}")
        
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
        # Clean up temp file if it exists
        try:
            if temp_ref and os.path.exists(temp_ref.name):
                os.unlink(temp_ref.name)
                logger.info(f"Cleaned up temporary file {temp_ref.name}")
        except Exception as e:
            logger.warning(f"Failed to clean up temp file: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)