import json
import asyncio
import logging
import re
from typing import Optional, Dict, Any
import mimetypes
import google.generativeai as genai
from pydantic import BaseModel, Field
from fastapi import UploadFile, HTTPException, APIRouter
from datetime import datetime
from pathlib import Path
from prompts import GEMINI_TRANSCRIPTION_PROMPT
from config_manager import config

logger = logging.getLogger(__name__)

# Pydantic models for request and response
class GeminiTranscriptionRequest(BaseModel):
    model: str = Field(default="gemini-2.5-pro", description="Gemini model to use for transcription")

class SpeechSegment(BaseModel):
    content: str = Field(..., description="The transcribed text")
    start_time: str = Field(..., description="Start timestamp (e.g., '0.000s')")
    end_time: str = Field(..., description="End timestamp (e.g., '5.123s')")
    speaker: str = Field(..., description="Speaker identifier (e.g., 'spk_0', 'spk_1')")

class GeminiTranscriptionResponse(BaseModel):
    title: str = Field(..., description="Concise title for the transcription")
    speech_segments: list[SpeechSegment] = Field(..., description="List of transcribed speech segments")
    summary: str = Field(..., description="Summary of the transcription")

class GeminiAudioTranscriber:
    def __init__(self):
        api_key = config.get_api_key("gemini")
        if not api_key:
            raise EnvironmentError("GOOGLE_API_KEY is not set")
        genai.configure(api_key=api_key)
        # Allow model override via config, default to 2.5 Pro
        model_name = config.get("geminiModel", "gemini-2.5-pro") or "gemini-2.5-pro"
        logger.info(f"Using Gemini model for upload transcription: {model_name}")
        self.client = genai.GenerativeModel(model_name)
        
        # Use the transcription prompt from prompts.py
        self.transcription_prompt = GEMINI_TRANSCRIPTION_PROMPT

    async def transcribe_audio(self, audio_file_path: str, model: Optional[str] = None) -> GeminiTranscriptionResponse:
        try:
            # Read audio bytes and determine mime type; avoid Files API to not require ragStoreName
            logger.info(f"Loading audio bytes for inline upload: {audio_file_path}")
            with open(audio_file_path, 'rb') as f:
                audio_bytes = f.read()

            guessed_type, _ = mimetypes.guess_type(audio_file_path)
            mime_type = guessed_type or 'application/octet-stream'
            # Normalize common audio types
            suffix = (audio_file_path.split('.')[-1] or '').lower()
            if suffix == 'm4a':
                mime_type = 'audio/mp4'
            elif suffix == 'mp3':
                mime_type = 'audio/mpeg'
            elif suffix == 'wav':
                mime_type = 'audio/wav'
            elif suffix == 'ogg':
                mime_type = 'audio/ogg'
            elif suffix == 'flac':
                mime_type = 'audio/flac'

            logger.info(f"Starting transcription with Gemini using inline bytes ({mime_type})")
            # Offload synchronous Gemini call to a thread to avoid blocking event loop
            response = await asyncio.to_thread(
                self.client.generate_content,
                [
                    self.transcription_prompt,
                    {"mime_type": mime_type, "data": audio_bytes}
                ]
            )
            
            # Parse the response
            response_text = response.text
            logger.info(f"Received response from Gemini: {response_text[:200]}...")
            
            # Extract JSON from the response (in case there's additional text)
            try:
                # Step 1: Strip markdown code fences if present
                cleaned_text = response_text.strip()
                if cleaned_text.startswith('```'):
                    # Remove opening fence (```json or ```)
                    lines = cleaned_text.split('\n')
                    if lines[0].startswith('```'):
                        lines = lines[1:]
                    # Remove closing fence
                    if lines and lines[-1].strip().startswith('```'):
                        lines = lines[:-1]
                    cleaned_text = '\n'.join(lines)
                
                # Step 2: Find JSON object boundaries
                start_idx = cleaned_text.find('{')
                end_idx = cleaned_text.rfind('}') + 1
                
                if start_idx == -1 or end_idx == 0:
                    raise ValueError("No JSON object found in response")
                
                json_str = cleaned_text[start_idx:end_idx]
                
                # Step 3: Clean up common issues before parsing
                # Remove any non-printable characters that might break JSON
                # Remove control characters except newlines and tabs
                json_str = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', json_str)
                
                # Step 4: Try to parse JSON
                try:
                    data = json.loads(json_str)
                except json.JSONDecodeError as json_err:
                    # If parsing fails, try to fix common issues
                    logger.warning(f"Initial JSON parse failed: {json_err}, attempting fixes...")
                    
                    # Try removing lines with invalid characters (like the "минеральный" issue)
                    lines = json_str.split('\n')
                    cleaned_lines = []
                    for line in lines:
                        # Skip lines that look like they're outside the JSON structure
                        stripped = line.strip()
                        if stripped and not stripped.startswith('{') and not stripped.startswith('}') and not stripped.startswith('"') and not stripped.startswith(','):
                            # Check if this line looks like it might be invalid content
                            if not any(c in stripped for c in ['{', '}', ':', '[', ']', ',', '"']):
                                logger.warning(f"Skipping potentially invalid line: {stripped[:50]}")
                                continue
                        cleaned_lines.append(line)
                    
                    json_str = '\n'.join(cleaned_lines)
                    # Re-find boundaries after cleaning
                    start_idx = json_str.find('{')
                    end_idx = json_str.rfind('}') + 1
                    if start_idx != -1 and end_idx > start_idx:
                        json_str = json_str[start_idx:end_idx]
                        data = json.loads(json_str)
                    else:
                        raise json_err
                
                # Convert to Pydantic model
                segments = []
                for seg in data.get("speech_segments", []):
                    segments.append(SpeechSegment(
                        content=seg["content"],
                        start_time=seg["start_time"],
                        end_time=seg["end_time"],
                        speaker=seg["speaker"]
                    ))
                
                return GeminiTranscriptionResponse(
                    title=data.get("title", "Audio Transcription"),
                    speech_segments=segments,
                    summary=data.get("summary", "No summary available")
                )
                
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.error(f"Error parsing Gemini response: {e}")
                logger.error(f"Raw response: {response_text}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to parse transcription response: {str(e)}"
                )
            
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error transcribing audio: {str(e)}"
            )

# Create router for Gemini endpoints
router = APIRouter(prefix="/api/v1", tags=["gemini"])

# Initialize transcriber
transcriber = GeminiAudioTranscriber()

@router.post("/transcribe/gemini", response_model=GeminiTranscriptionResponse)
async def transcribe_audio_with_gemini(
    file: UploadFile,
    model: str = "gemini-2.5-pro"
):
    """
    Transcribe audio file using Gemini API with speaker identification and summary.
    
    Supports audio formats: WAV, MP3, OGG, FLAC, M4A
    """
    # Validate file type
    allowed_mime_types = [
        "audio/wav", "audio/wave", "audio/x-wav",
        "audio/mpeg", "audio/mp3",
        "audio/ogg",
        "audio/flac",
        "audio/mp4",
        "audio/x-m4a"
    ]
    
    if file.content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {file.content_type}. Supported formats: WAV, MP3, OGG, FLAC, M4A"
        )
    
    # Create recording directory
    # Generate timestamp for directory
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    recording_dir = config.create_recording_directory(timestamp)
    
    # Generate filename with original extension
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'wav'
    audio_filename = f"audio.{file_extension}"
    audio_path = recording_dir / audio_filename
    
    # Save uploaded file to recording directory
    with open(audio_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    logger.info(f"Saved audio file to: {audio_path}")
    
    # Transcribe the audio
    result = await transcriber.transcribe_audio(str(audio_path), model)
    
    # Save transcription results
    # Save as JSON
    json_path = recording_dir / "transcription.json"
    with open(json_path, 'w') as f:
        json.dump({
            "title": result.title,
            "speech_segments": [seg.dict() for seg in result.speech_segments],
            "summary": result.summary
        }, f, indent=2)
    
    # Save summary as text
    summary_path = recording_dir / "summary.txt"
    with open(summary_path, 'w') as f:
        f.write(f"Title: {result.title}\n\n")
        f.write("Summary:\n")
        f.write(result.summary)
    
    logger.info(f"Saved transcription results to: {recording_dir}")
    
    # Clean up old recordings
    config.cleanup_old_recordings()
    
    return result
