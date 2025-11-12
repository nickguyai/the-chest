import asyncio
import json
import numpy as np
from fastapi import FastAPI, WebSocket, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
import uvicorn
import logging
from prompts import PROMPTS
from openai_realtime_client import OpenAIRealtimeAudioTextClient
from starlette.websockets import WebSocketState
import wave
import datetime
import scipy.signal
from openai import OpenAI, AsyncOpenAI
from pydantic import BaseModel, Field
from typing import Generator
from llm_processor import get_llm_processor
from datetime import datetime, timedelta
from gemini_transcriber import router as gemini_router
from jobs_api import router as jobs_router
from job_queue import job_queue
from config_manager import config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Pydantic models for request and response schemas
class ReadabilityRequest(BaseModel):
    text: str = Field(..., description="The text to improve readability for.")

class ReadabilityResponse(BaseModel):
    enhanced_text: str = Field(..., description="The text with improved readability.")

class CorrectnessRequest(BaseModel):
    text: str = Field(..., description="The text to check for factual correctness.")

class CorrectnessResponse(BaseModel):
    analysis: str = Field(..., description="The factual correctness analysis.")

class AskAIRequest(BaseModel):
    text: str = Field(..., description="The question to ask AI.")

class AskAIResponse(BaseModel):
    answer: str = Field(..., description="AI's answer to the question.")

class SettingsRequest(BaseModel):
    openaiApiKey: str = Field(..., description="OpenAI API key")
    geminiApiKey: str = Field(..., description="Google API key")

app = FastAPI()

# Ensure directories exist
config.ensure_directories()

# Get API keys from config
OPENAI_API_KEY = config.get_api_key("openai")
if not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY is not set in configuration.")

GOOGLE_API_KEY = config.get_api_key("gemini")
if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY is not set in configuration. Gemini transcription will not work.")

# Include Gemini router and Jobs router
app.include_router(gemini_router)
app.include_router(jobs_router)

# Initialize with a default model
llm_processor = get_llm_processor("gpt-4o", config_manager=config)  # Default processor

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def get_realtime_page(request: Request):
    return FileResponse("static/realtime.html")

@app.on_event("startup")
async def _startup_jobs():
    try:
        await job_queue.start()
        logger.info("Job queue started")
    except Exception as e:
        logger.error(f"Failed to start job queue: {e}")

@app.on_event("shutdown")
async def _shutdown_jobs():
    try:
        await job_queue.stop()
    except Exception:
        pass

class AudioProcessor:
    def __init__(self, target_sample_rate=24000):
        self.target_sample_rate = target_sample_rate
        self.source_sample_rate = 48000  # Most common sample rate for microphones
        
    def process_audio_chunk(self, audio_data):
        # Convert binary audio data to Int16 array
        pcm_data = np.frombuffer(audio_data, dtype=np.int16)
        
        # Convert to float32 for better precision during resampling
        float_data = pcm_data.astype(np.float32) / 32768.0
        
        # Resample from 48kHz to 24kHz
        resampled_data = scipy.signal.resample_poly(
            float_data, 
            self.target_sample_rate, 
            self.source_sample_rate
        )
        
        # Convert back to int16 while preserving amplitude
        resampled_int16 = (resampled_data * 32768.0).clip(-32768, 32767).astype(np.int16)
        return resampled_int16.tobytes()

    def save_audio_buffer(self, audio_buffer, filename):
        with wave.open(filename, 'wb') as wf:
            wf.setnchannels(1)  # Mono audio
            wf.setsampwidth(2)  # 2 bytes per sample (16-bit)
            wf.setframerate(self.target_sample_rate)
            wf.writeframes(b''.join(audio_buffer))
        logger.info(f"Saved audio buffer to {filename}")

@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket):
    logger.info("New WebSocket connection attempt")
    await websocket.accept()
    logger.info("WebSocket connection accepted")
    
    # Add initial status update here
    await websocket.send_text(json.dumps({
        "type": "status",
        "status": "idle"  # Set initial status to idle (blue)
    }))
    
    client = None
    current_provider = "openai"  # Default provider
    audio_processor = AudioProcessor()
    audio_buffer = []
    recording_stopped = asyncio.Event()
    openai_ready = asyncio.Event()
    pending_audio_chunks = []
    # Buffer to accumulate OpenAI streamed text for JSON parsing
    current_response_text = ""
    # Add synchronization for audio sending operations
    pending_audio_operations = 0
    audio_send_lock = asyncio.Lock()
    all_audio_sent = asyncio.Event()
    all_audio_sent.set()  # Initially set since no audio is pending
    
    async def initialize_openai():
        nonlocal client
        try:
            # Clear the ready flag while initializing
            openai_ready.clear()
            
            client = OpenAIRealtimeAudioTextClient(config.get_api_key("openai"))
            await client.connect()
            logger.info("Successfully connected to OpenAI client")
            
            # Register handlers after client is initialized
            client.register_handler("session.updated", lambda data: handle_generic_event("session.updated", data))
            client.register_handler("input_audio_buffer.cleared", lambda data: handle_generic_event("input_audio_buffer.cleared", data))
            client.register_handler("input_audio_buffer.speech_started", lambda data: handle_generic_event("input_audio_buffer.speech_started", data))
            client.register_handler("rate_limits.updated", lambda data: handle_generic_event("rate_limits.updated", data))
            client.register_handler("response.output_item.added", lambda data: handle_generic_event("response.output_item.added", data))
            client.register_handler("conversation.item.created", lambda data: handle_generic_event("conversation.item.created", data))
            client.register_handler("response.content_part.added", lambda data: handle_generic_event("response.content_part.added", data))
            client.register_handler("response.text.done", lambda data: handle_generic_event("response.text.done", data))
            client.register_handler("response.content_part.done", lambda data: handle_generic_event("response.content_part.done", data))
            client.register_handler("response.output_item.done", lambda data: handle_generic_event("response.output_item.done", data))
            client.register_handler("response.done", lambda data: handle_response_done(data))
            client.register_handler("error", lambda data: handle_error(data))
            client.register_handler("response.text.delta", lambda data: handle_text_delta(data))
            client.register_handler("response.created", lambda data: handle_response_created(data))
            
            openai_ready.set()  # Set ready flag after successful initialization
            await websocket.send_text(json.dumps({
                "type": "status",
                "status": "connected"
            }))
            return True
        except Exception as e:
            logger.error(f"Failed to connect to OpenAI: {e}")
            openai_ready.clear()  # Ensure flag is cleared on failure
            await websocket.send_text(json.dumps({
                "type": "error",
                "content": "Failed to initialize OpenAI connection"
            }))
            return False

    # Move the handler definitions here (before initialize_openai)
    async def handle_text_delta(data):
        # Accumulate all text deltas locally; we'll parse JSON at response.done
        nonlocal current_response_text
        try:
            delta = data.get("delta", "")
            if delta:
                current_response_text += delta
        except Exception as e:
            logger.error(f"Error in handle_text_delta: {str(e)}", exc_info=True)

    async def handle_response_created(data):
        nonlocal current_response_text
        current_response_text = ""
        # Clear the client transcript area for a new response
        await websocket.send_text(json.dumps({
            "type": "text",
            "content": "",
            "isNewResponse": True
        }))
        logger.info("Handled response.created; buffer reset for new response")

    async def handle_error(data):
        error_msg = data.get("error", {}).get("message", "Unknown error")
        logger.error(f"OpenAI error: {error_msg}")
        await websocket.send_text(json.dumps({
            "type": "error",
            "content": error_msg
        }))
        logger.info("Handled error message from OpenAI")

    async def handle_response_done(data):
        nonlocal client, current_response_text
        logger.info("Handled response.done - attempting to parse JSON response")
        recording_stopped.set()

        # Try to parse accumulated text as JSON per updated prompt contract
        try:
            raw_text = (current_response_text or "").strip()
            json_payload = None
            if raw_text:
                start_idx = raw_text.find('{')
                end_idx = raw_text.rfind('}')
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    json_str = raw_text[start_idx:end_idx + 1]
                    json_payload = json.loads(json_str)

            final_transcript = None
            if isinstance(json_payload, dict):
                # Only combine segment content for transcript; title/summary are displayed separately in UI
                segments = json_payload.get("speech_segments") or []

                transcript_lines = []
                for seg in segments:
                    try:
                        speaker = seg.get("speaker", "speaker")
                        start = seg.get("start_time", "")
                        end = seg.get("end_time", "")
                        content = seg.get("content", "")
                        header = f"{speaker} [{start}-{end}]".strip()
                        transcript_lines.append(f"{content}" if content else header)
                    except Exception:
                        # If structure unexpected, skip this segment gracefully
                        continue

                final_transcript = "\n".join(transcript_lines).strip()

            # Fallback to raw accumulated text if JSON wasn't parsed
            if not final_transcript:
                final_transcript = raw_text

            # If we parsed JSON successfully, also send structured payload for UI rendering
            if isinstance(json_payload, dict):
                try:
                    await websocket.send_text(json.dumps({
                        "type": "structured_result",
                        "result": json_payload
                    }))
                    logger.info("Sent structured_result to client")
                except Exception as e:
                    logger.error(f"Failed sending structured_result to client: {str(e)}", exc_info=True)

            # Send the full transcription as a fresh response to the client
            await websocket.send_text(json.dumps({
                "type": "text",
                "content": final_transcript or "",
                "isNewResponse": True
            }))
            logger.info("Sent parsed transcription to client")
        except Exception as e:
            logger.error(f"Failed to parse/format JSON transcription: {str(e)}", exc_info=True)
            # Best effort: send whatever we have
            await websocket.send_text(json.dumps({
                "type": "text",
                "content": current_response_text or "",
                "isNewResponse": True
            }))
        finally:
            # Clean up client connection and update status
            if client:
                try:
                    await client.close()
                    client = None
                    openai_ready.clear()
                    await websocket.send_text(json.dumps({
                        "type": "status",
                        "status": "idle"
                    }))
                    logger.info("Connection closed after response completion")
                except Exception as e:
                    logger.error(f"Error closing client after response done: {str(e)}")

    async def handle_generic_event(event_type, data):
        logger.info(f"Handled {event_type} with data: {json.dumps(data, ensure_ascii=False)}")

    # Create a queue to handle incoming audio chunks
    audio_queue = asyncio.Queue()

    async def receive_messages():
        nonlocal client, current_provider
        
        try:
            while True:
                if websocket.client_state == WebSocketState.DISCONNECTED:
                    logger.info("WebSocket client disconnected")
                    openai_ready.clear()
                    break
                    
                try:
                    # Add timeout to prevent infinite waiting
                    data = await asyncio.wait_for(websocket.receive(), timeout=30.0)
                    
                    if "bytes" in data:
                        processed_audio = audio_processor.process_audio_chunk(data["bytes"])
                        if current_provider == "openai" and not openai_ready.is_set():
                            logger.debug("OpenAI not ready, buffering audio chunk")
                            pending_audio_chunks.append(processed_audio)
                        elif current_provider == "openai" and client:
                            # Track pending audio operations
                            async with audio_send_lock:
                                nonlocal pending_audio_operations
                                pending_audio_operations += 1
                                all_audio_sent.clear()  # Clear the event since we have pending operations
                            
                            try:
                                await client.send_audio(processed_audio)
                                await websocket.send_text(json.dumps({
                                    "type": "status",
                                    "status": "connected"
                                }))
                                logger.debug(f"Sent audio chunk to OpenAI, size: {len(processed_audio)} bytes")
                            finally:
                                # Mark operation as complete
                                async with audio_send_lock:
                                    pending_audio_operations -= 1
                                    if pending_audio_operations == 0:
                                        all_audio_sent.set()  # Set event when all operations complete
                        else:
                            logger.warning("Received audio but client is not initialized")
                            
                    elif "text" in data:
                        msg = json.loads(data["text"])
                        
                        if msg.get("type") == "start_recording":
                            # Get provider from message, default to openai
                            current_provider = msg.get("provider", "openai")
                            
                            # Update status to connecting while initializing
                            await websocket.send_text(json.dumps({
                                "type": "status",
                                "status": "connecting"
                            }))
                            
                            # Initialize the appropriate client
                            if current_provider == "openai":
                                if not await initialize_openai():
                                    continue
                            else:
                                await websocket.send_text(json.dumps({
                                    "type": "error",
                                    "content": f"Unsupported provider: {current_provider}"
                                }))
                                continue
                                
                            recording_stopped.clear()
                            pending_audio_chunks.clear()
                            
                            # Send any buffered chunks
                            if pending_audio_chunks:
                                logger.info(f"Sending {len(pending_audio_chunks)} buffered chunks to {current_provider}")
                                if current_provider == "openai" and client:
                                    for chunk in pending_audio_chunks:
                                        # Track each buffered chunk operation
                                        async with audio_send_lock:
                                            pending_audio_operations += 1
                                            all_audio_sent.clear()
                                        
                                        try:
                                            await client.send_audio(chunk)
                                        finally:
                                            async with audio_send_lock:
                                                pending_audio_operations -= 1
                                                if pending_audio_operations == 0:
                                                    all_audio_sent.set()
                                pending_audio_chunks.clear()
                            
                        elif msg.get("type") == "stop_recording":
                            if current_provider == "openai" and client:
                                # CRITICAL FIX: Wait for all pending audio operations to complete
                                # before committing to prevent data loss
                                logger.info("Stop recording received, waiting for all audio to be sent...")
                                
                                # Wait for any pending audio chunks to be sent (with timeout for safety)
                                try:
                                    await asyncio.wait_for(all_audio_sent.wait(), timeout=5.0)
                                    logger.info("All pending audio operations completed")
                                except asyncio.TimeoutError:
                                    logger.warning("Timeout waiting for audio operations to complete, proceeding anyway")
                                    # Reset the pending counter to prevent deadlock
                                    async with audio_send_lock:
                                        pending_audio_operations = 0
                                        all_audio_sent.set()
                                
                                # Add a small buffer to ensure network operations complete
                                await asyncio.sleep(0.1)
                                
                                logger.info("All audio sent, committing audio buffer...")
                                await client.commit_audio()
                                await client.start_response(PROMPTS['paraphrase-gpt-realtime'])
                                await recording_stopped.wait()
                                # Don't close the client here, let the disconnect timer handle it
                                # Update client status to connected (waiting for response)
                                await websocket.send_text(json.dumps({
                                    "type": "status",
                                    "status": "connected"
                                }))

                except asyncio.TimeoutError:
                    logger.debug("No message received for 30 seconds")
                    continue
                except Exception as e:
                    logger.error(f"Error in receive_messages loop: {str(e)}", exc_info=True)
                    break
                
        finally:
            # Cleanup when the loop exits
            if client:
                try:
                    await client.close()
                except Exception as e:
                    logger.error(f"Error closing OpenAI client in receive_messages: {str(e)}")
            logger.info("Receive messages loop ended")

    async def send_audio_messages():
        while True:
            try:
                processed_audio = await audio_queue.get()
                if processed_audio is None:
                    break
                
                # Add validation
                if len(processed_audio) == 0:
                    logger.warning("Empty audio chunk received, skipping")
                    continue
                
                # Append the processed audio to the buffer
                audio_buffer.append(processed_audio)

                await client.send_audio(processed_audio)
                logger.info(f"Audio chunk sent to OpenAI client, size: {len(processed_audio)} bytes")
                
            except Exception as e:
                logger.error(f"Error in send_audio_messages: {str(e)}", exc_info=True)
                break

        # After processing all audio, set the event
        recording_stopped.set()

    # Start concurrent tasks for receiving and sending
    receive_task = asyncio.create_task(receive_messages())
    send_task = asyncio.create_task(send_audio_messages())

    try:
        # Wait for both tasks to complete
        await asyncio.gather(receive_task, send_task)
    finally:
        if client:
            await client.close()
            logger.info("OpenAI client connection closed")

@app.post(
    "/api/v1/readability",
    response_model=ReadabilityResponse,
    summary="Enhance Text Readability",
    description="Improve the readability of the provided text using GPT-4."
)
async def enhance_readability(request: ReadabilityRequest):
    prompt = PROMPTS.get('readability-enhance')
    if not prompt:
        raise HTTPException(status_code=500, detail="Readability prompt not found.")

    try:
        async def text_generator():
            # Use gpt-4o specifically for readability
            async for part in llm_processor.process_text(request.text, prompt, model="gpt-4o"):
                yield part

        return StreamingResponse(text_generator(), media_type="text/plain")

    except Exception as e:
        logger.error(f"Error enhancing readability: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing readability enhancement.")

@app.post(
    "/api/v1/ask_ai",
    response_model=AskAIResponse,
    summary="Ask AI a Question",
    description="Ask AI to provide insights using O1-mini model."
)
def ask_ai(request: AskAIRequest):
    prompt = PROMPTS.get('ask-ai')
    if not prompt:
        raise HTTPException(status_code=500, detail="Ask AI prompt not found.")

    try:
        # Use o1-mini specifically for ask_ai
        answer = llm_processor.process_text_sync(request.text, prompt, model="o1-mini")
        return AskAIResponse(answer=answer)
    except Exception as e:
        logger.error(f"Error processing AI question: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing AI question.")

@app.post(
    "/api/v1/correctness",
    response_model=CorrectnessResponse,
    summary="Check Factual Correctness",
    description="Analyze the text for factual accuracy using GPT-4o."
)
async def check_correctness(request: CorrectnessRequest):
    prompt = PROMPTS.get('correctness-check')
    if not prompt:
        raise HTTPException(status_code=500, detail="Correctness prompt not found.")

    try:
        async def text_generator():
            # Specifically use gpt-4o for correctness checking
            async for part in llm_processor.process_text(request.text, prompt, model="gpt-4o"):
                yield part

        return StreamingResponse(text_generator(), media_type="text/plain")

    except Exception as e:
        logger.error(f"Error checking correctness: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing correctness check.")

@app.get("/api/v1/settings")
async def get_settings():
    """Get current settings"""
    return {
        "openaiApiKey": config.get_api_key("openai") or "",
        "geminiApiKey": config.get_api_key("gemini") or ""
    }

@app.post("/api/v1/settings")
async def update_settings(request: SettingsRequest):
    """Update API key settings"""
    try:
        # Update configuration
        config.set_api_key("openai", request.openaiApiKey)
        config.set_api_key("gemini", request.geminiApiKey)
        
        # Update global variables for immediate use
        global OPENAI_API_KEY, GOOGLE_API_KEY
        OPENAI_API_KEY = request.openaiApiKey
        GOOGLE_API_KEY = request.geminiApiKey
        
        return {"status": "success", "message": "Settings updated successfully"}
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to update settings")

if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=3005)
