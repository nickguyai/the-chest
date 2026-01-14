#!/usr/bin/env python3
"""Test script for Gemini Live transcriber"""

import asyncio
import logging
from gemini_live_transcriber import GeminiLiveTranscriber
from config_manager import ConfigManager

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_gemini_live():
    """Test the Gemini Live transcriber"""
    try:
        # Get API key from config
        config = ConfigManager()
        api_key = config.get_api_key('gemini')
        
        if not api_key:
            logger.error("No Gemini API key found in config")
            return
        
        # Create transcriber
        transcriber = GeminiLiveTranscriber(api_key)
        
        # Set up callbacks
        async def on_transcription(text):
            logger.info(f"Transcription: {text}")
        
        async def on_error(error):
            logger.error(f"Error: {error}")
        
        async def on_connected():
            logger.info("Connected to Gemini Live!")
        
        async def on_disconnected():
            logger.info("Disconnected from Gemini Live")
        
        transcriber.on_transcription = on_transcription
        transcriber.on_error = on_error
        transcriber.on_connected = on_connected
        transcriber.on_disconnected = on_disconnected
        
        # Connect
        logger.info("Connecting to Gemini Live...")
        await transcriber.connect("You are a helpful assistant for transcribing audio.")
        
        # Start listening
        listen_task = asyncio.create_task(transcriber.start_listening())
        
        # Send some test audio (silence for now)
        logger.info("Sending test audio...")
        test_audio = b'\x00' * 16000 * 2  # 2 seconds of silence
        await transcriber.send_audio(test_audio)
        
        # Wait a bit
        await asyncio.sleep(5)
        
        # Close
        logger.info("Closing connection...")
        await transcriber.close()
        
        # Cancel listen task
        listen_task.cancel()
        try:
            await listen_task
        except asyncio.CancelledError:
            pass
        
        logger.info("Test completed!")
        
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(test_gemini_live())