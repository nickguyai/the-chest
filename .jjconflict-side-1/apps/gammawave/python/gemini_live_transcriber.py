import asyncio
import json
import base64
import numpy as np
from typing import Optional, Dict, Any, Callable
import logging
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

class GeminiLiveTranscriber:
    """Real-time transcription client for Gemini Live API"""

    def __init__(self, api_key: str, model: str = "gemini-live-2.5-flash-preview"):
        self.api_key = api_key
        if not self.api_key:
            raise ValueError("API key for Gemini must be provided.")
        # Create client using the new google-genai SDK
        self.client = genai.Client(api_key=self.api_key)
        self.model = model
        self.session = None
        self.session_context = None
        self.is_connected = False
        self.on_transcription = None
        self.on_model_response = None
        self.on_error = None
        self.on_connected = None
        self.on_disconnected = None
        self.target_sample_rate = 16000  # Gemini Live requires 16kHz

    async def connect(self, system_instruction: str = ""):
        """Connect to Gemini Live API"""
        try:
            # Create the configuration for the live session
            config = types.LiveConnectConfig(
                response_modalities=["TEXT"],
                system_instruction=system_instruction if system_instruction else "You are a helpful assistant.",
                input_audio_transcription={},  # Enable input transcription
                realtime_input_config={
                    "automatic_activity_detection": {
                        "disabled": False,
                        "start_of_speech_sensitivity": types.StartSensitivity.START_SENSITIVITY_LOW,
                        "end_of_speech_sensitivity": types.EndSensitivity.END_SENSITIVITY_LOW,
                    }
                }
            )
            
            # Connect to the live API using async context manager
            self.session_context = self.client.aio.live.connect(
                model=self.model,
                config=config,
            )
            self.session = await self.session_context.__aenter__()
            
            self.is_connected = True
            if self.on_connected:
                if asyncio.iscoroutinefunction(self.on_connected):
                    await self.on_connected()
                else:
                    self.on_connected()
                
            logger.info("Connected to Gemini Live API")
            
        except Exception as e:
            logger.error(f"Failed to connect to Gemini Live: {e}")
            if self.on_error:
                if asyncio.iscoroutinefunction(self.on_error):
                    await self.on_error(str(e))
                else:
                    self.on_error(str(e))
            raise

    async def send_audio(self, audio_data: bytes):
        """Send audio data to Gemini Live"""
        if not self.is_connected or not self.session:
            logger.warning("Not connected to Gemini Live")
            return
            
        try:
            # Use send_realtime_input for audio data
            await self.session.send_realtime_input(
                audio=types.Blob(
                    data=audio_data,
                    mime_type=f"audio/pcm;rate={self.target_sample_rate}"
                )
            )
            
        except Exception as e:
            logger.error(f"Error sending audio: {e}")
            if self.on_error:
                if asyncio.iscoroutinefunction(self.on_error):
                    await self.on_error(str(e))
                else:
                    self.on_error(str(e))

    async def send_audio_stream_end(self):
        """Signal end of audio stream (when microphone is paused)"""
        if not self.is_connected or not self.session:
            logger.warning("Not connected to Gemini Live")
            return
            
        try:
            await self.session.send_realtime_input(audio_stream_end=True)
            logger.debug("Sent audio stream end signal")
        except Exception as e:
            logger.error(f"Error sending audio stream end: {e}")
            if self.on_error:
                if asyncio.iscoroutinefunction(self.on_error):
                    await self.on_error(str(e))
                else:
                    self.on_error(str(e))

    async def send_text(self, text: str, role: str = "user"):
        """Send text message to Gemini Live"""
        if not self.is_connected or not self.session:
            logger.warning("Not connected to Gemini Live")
            return
            
        try:
            await self.session.send_client_content(
                turns={"role": role, "parts": [{"text": text}]},
                turn_complete=True
            )
            logger.debug(f"Sent text message: {text}")
        except Exception as e:
            logger.error(f"Error sending text: {e}")
            if self.on_error:
                if asyncio.iscoroutinefunction(self.on_error):
                    await self.on_error(str(e))
                else:
                    self.on_error(str(e))

    async def start_listening(self):
        """Start listening for responses"""
        if not self.is_connected or not self.session:
            return
            
        try:
            async for response in self.session.receive():
                # Log all response types for debugging
                logger.debug(f"Received response type: {type(response).__name__}")
                
                # Check for direct text response
                if hasattr(response, 'text') and response.text:
                    transcription = response.text
                    logger.info(f"Text response received: {transcription}")
                    if self.on_transcription:
                        if asyncio.iscoroutinefunction(self.on_transcription):
                            await self.on_transcription(transcription)
                        else:
                            self.on_transcription(transcription)
                
                # Check for server content with transcriptions and model turns
                if hasattr(response, 'server_content') and response.server_content:
                    server_content = response.server_content
                    
                    # Handle input transcription (what the user said)
                    if hasattr(server_content, 'input_transcription') and server_content.input_transcription:
                        transcription = server_content.input_transcription.text
                        logger.info(f"Input transcription: {transcription}")
                        if self.on_transcription:
                            if asyncio.iscoroutinefunction(self.on_transcription):
                                await self.on_transcription(transcription)
                            else:
                                self.on_transcription(transcription)
                    
                    # Handle model turn (model's response)
                    if hasattr(server_content, 'model_turn') and server_content.model_turn:
                        for part in server_content.model_turn.parts:
                            if hasattr(part, 'text') and part.text:
                                logger.info(f"Model response: {part.text}")
                                if self.on_model_response:
                                    if asyncio.iscoroutinefunction(self.on_model_response):
                                        await self.on_model_response(part.text)
                                    else:
                                        self.on_model_response(part.text)
                    
                    # Handle interruption
                    if hasattr(server_content, 'interrupted') and server_content.interrupted:
                        logger.info("Generation was interrupted")
                    
                    # Handle turn completion
                    if hasattr(server_content, 'turn_complete') and server_content.turn_complete:
                        logger.debug("Turn completed")
                
                # Handle session management messages
                if hasattr(response, 'go_away') and response.go_away:
                    logger.warning(f"Connection ending in: {response.go_away.time_left}")
                
                # Handle usage metadata
                if hasattr(response, 'usage_metadata') and response.usage_metadata:
                    logger.debug(f"Total tokens used: {response.usage_metadata.total_token_count}")
                        
        except asyncio.CancelledError:
            logger.info("Gemini listening task was cancelled.")
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error receiving responses: {error_msg}")
            if self.on_error:
                if asyncio.iscoroutinefunction(self.on_error):
                    await self.on_error(error_msg)
                else:
                    self.on_error(error_msg)
        finally:
            self.is_connected = False
            if self.on_disconnected:
                if asyncio.iscoroutinefunction(self.on_disconnected):
                    await self.on_disconnected()
                else:
                    self.on_disconnected()
            await self.close()

    async def close(self):
        """Close the connection"""
        if hasattr(self, 'session_context') and self.session_context:
            try:
                await self.session_context.__aexit__(None, None, None)
            except:
                pass
        # Note: session.close() is not a valid method for Live API sessions
        # The session is closed via the context manager
        self.is_connected = False
        if self.on_disconnected:
            if asyncio.iscoroutinefunction(self.on_disconnected):
                await self.on_disconnected()
            else:
                self.on_disconnected()
        logger.info("Closed Gemini Live connection")

    def convert_sample_rate(self, audio_data: bytes, from_rate: int, to_rate: int) -> bytes:
        """Convert audio sample rate"""
        if from_rate == to_rate:
            return audio_data
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        ratio = to_rate / from_rate
        new_length = int(len(audio_array) * ratio)
        indices = np.arange(new_length) / ratio
        resampled = np.interp(indices, np.arange(len(audio_array)), audio_array)
        return resampled.astype(np.int16).tobytes()