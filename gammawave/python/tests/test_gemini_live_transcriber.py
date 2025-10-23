import pytest
import os
import asyncio
import numpy as np
from unittest.mock import Mock, patch, AsyncMock

# Set test environment variables
os.environ['GOOGLE_API_KEY'] = 'test_key'

from gemini_live_transcriber import GeminiLiveTranscriber

class TestGeminiLiveTranscriber:
    
    @pytest.fixture
    def mock_genai(self):
        with patch('gemini_live_transcriber.genai') as mock:
            yield mock
    
    @pytest.fixture
    def mock_types(self):
        with patch('gemini_live_transcriber.types') as mock:
            yield mock
    
    @pytest.fixture
    def transcriber(self):
        return GeminiLiveTranscriber('test_key')
    
    def test_init(self):
        transcriber = GeminiLiveTranscriber('test_key', 'gemini-2.0-flash-exp')
        assert transcriber.api_key == 'test_key'
        assert transcriber.model == 'gemini-2.0-flash-exp'
        assert transcriber.target_sample_rate == 16000
        assert transcriber.is_connected == False
        assert transcriber.session is None
        assert transcriber.session_context is None
    
    @pytest.mark.asyncio
    async def test_connect_success(self, transcriber, mock_types):
        # Mock the session and context manager
        mock_session = AsyncMock()
        mock_context = AsyncMock()
        mock_context.__aenter__ = AsyncMock(return_value=mock_session)
        mock_context.__aexit__ = AsyncMock()
        mock_client = Mock()
        mock_client.aio = Mock()
        mock_client.aio.live = Mock()
        mock_client.aio.live.connect = Mock(return_value=mock_context)
        
        transcriber.client = mock_client
        
        # Mock callback
        on_connected = Mock()
        transcriber.on_connected = on_connected
        
        await transcriber.connect("Test instruction")
        
        # Verify the connect call
        mock_client.aio.live.connect.assert_called_once()
        args, kwargs = mock_client.aio.live.connect.call_args
        
        assert kwargs['model'] == 'gemini-2.0-flash-exp'
        assert 'config' in kwargs
        
        # Verify config structure
        config = kwargs['config']
        assert hasattr(config, 'generation_config')
        assert hasattr(config, 'system_instruction')
        assert hasattr(config, 'audio_config')
        
        # Verify connection state
        assert transcriber.is_connected == True
        assert transcriber.session == mock_session
        assert transcriber.session_context == mock_context
        on_connected.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_send_audio(self, transcriber, mock_types):
        # Setup
        transcriber.is_connected = True
        transcriber.session = AsyncMock()
        
        # Create a mock Blob class
        mock_blob_class = Mock()
        mock_blob_instance = Mock()
        mock_blob_instance.data = b'\x00\x01\x02\x03'
        mock_blob_instance.mime_type = 'audio/pcm;rate=16000'
        mock_blob_class.return_value = mock_blob_instance
        mock_types.Blob = mock_blob_class
        
        audio_data = b'\x00\x01\x02\x03'
        
        await transcriber.send_audio(audio_data)
        
        # Verify send_realtime_input was called with correct parameters
        transcriber.session.send_realtime_input.assert_called_once()
        args, kwargs = transcriber.session.send_realtime_input.call_args
        
        # Check that audio was passed correctly
        assert 'audio' in kwargs
        assert mock_types.Blob.called
        call_args = mock_types.Blob.call_args
        assert call_args[1]['data'] == audio_data
        assert call_args[1]['mime_type'] == 'audio/pcm;rate=16000'
    
    @pytest.mark.asyncio
    async def test_send_audio_not_connected(self, transcriber, caplog):
        transcriber.is_connected = False
        transcriber.session = None
        
        await transcriber.send_audio(b'test')
        
        assert "Not connected to Gemini Live" in caplog.text
    
    @pytest.mark.asyncio
    async def test_start_listening_with_text_response(self, transcriber, caplog):
        # Setup
        transcriber.is_connected = True
        
        # Create mock message with input transcription
        mock_message = Mock()
        mock_message.server_content = Mock()
        mock_message.server_content.input_transcription = Mock()
        mock_message.server_content.input_transcription.text = "Hello world"
        
        # Mock session receive to return an async iterator
        async def mock_receive():
            yield mock_message
        
        transcriber.session = AsyncMock()
        transcriber.session.receive = mock_receive
        
        # Mock callback
        on_transcription = Mock()
        transcriber.on_transcription = on_transcription
        
        # Start listening (but cancel after first response)
        task = asyncio.create_task(transcriber.start_listening())
        await asyncio.sleep(0.1)  # Let it process
        task.cancel()
        
        try:
            await task
        except asyncio.CancelledError:
            pass
        
        on_transcription.assert_called_once_with("Hello world")
    
    @pytest.mark.asyncio
    async def test_start_listening_with_error(self, transcriber, caplog):
        # Setup
        transcriber.is_connected = True
        
        # Mock session receive to raise an exception
        async def mock_receive():
            raise Exception("Test error")
        
        transcriber.session = AsyncMock()
        transcriber.session.receive = mock_receive
        
        # Mock callback
        on_error = Mock()
        transcriber.on_error = on_error
        on_disconnected = Mock()
        transcriber.on_disconnected = on_disconnected
        
        # Start listening (the exception is caught internally)
        task = asyncio.create_task(transcriber.start_listening())
        await asyncio.sleep(0.1)  # Let it process
        task.cancel()
        
        try:
            await task
        except asyncio.CancelledError:
            pass
        
        # Check that error callback was called
        on_error.assert_called_once_with("Test error")
        assert transcriber.is_connected == False
        # on_disconnected might be called twice (once in exception handler, once in finally)
        assert on_disconnected.call_count >= 1
    
    @pytest.mark.asyncio
    async def test_close(self, transcriber):
        # Setup
        transcriber.is_connected = True
        transcriber.session = AsyncMock()
        transcriber.session_context = AsyncMock()
        
        # Mock callback
        on_disconnected = Mock()
        transcriber.on_disconnected = on_disconnected
        
        await transcriber.close()
        
        # The close method sets is_connected to False
        assert transcriber.is_connected == False
    
    def test_convert_sample_rate_same_rate(self, transcriber):
        audio_data = b'\x00\x01\x02\x03'
        result = transcriber.convert_sample_rate(audio_data, 16000, 16000)
        assert result == audio_data
    
    def test_convert_sample_rate_different_rate(self, transcriber):
        # Create simple test data
        audio_data = np.array([0, 32767, -32768, 0], dtype=np.int16).tobytes()
        
        result = transcriber.convert_sample_rate(audio_data, 16000, 8000)
        
        # Should be half the length
        assert len(result) == len(audio_data) // 2