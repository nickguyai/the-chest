import pytest
import os
import json
from unittest.mock import Mock, patch, AsyncMock

# Set test environment variables
os.environ['GOOGLE_API_KEY'] = 'test_key'

from gemini_transcriber import GeminiAudioTranscriber, GeminiTranscriptionResponse, SpeechSegment

class TestGeminiAudioTranscriber:
    
    @pytest.fixture
    def mock_genai(self):
        with patch('gemini_transcriber.genai') as mock:
            yield mock
    
    @pytest.fixture
    def transcriber(self, mock_genai):
        with patch('gemini_transcriber.config') as mock_config:
            mock_config.get_api_key.return_value = 'test_key'
            return GeminiAudioTranscriber()
    
    def test_init_success(self, mock_genai):
        with patch('gemini_transcriber.config') as mock_config:
            mock_config.get_api_key.return_value = 'test_key'
            transcriber = GeminiAudioTranscriber()
            mock_genai.configure.assert_called_once_with(api_key='test_key')
            assert transcriber.client is not None
    
    def test_init_missing_api_key(self):
        with patch('gemini_transcriber.config') as mock_config:
            mock_config.get_api_key.return_value = None
            with patch.dict(os.environ, {}, clear=True):
                if 'GOOGLE_API_KEY' in os.environ:
                    del os.environ['GOOGLE_API_KEY']
                
                with pytest.raises(EnvironmentError, match="GOOGLE_API_KEY is not set"):
                    GeminiAudioTranscriber()
    
    @pytest.mark.asyncio
    async def test_transcribe_audio_success(self, transcriber, mock_genai):
        # Mock file upload
        mock_file = Mock()
        mock_file.name = "test_audio.mp3"
        
        mock_genai.upload_file.return_value = mock_file
        
        # Mock response
        mock_response = Mock()
        mock_response.text = '''{
            "title": "Test Meeting",
            "speech_segments": [
                {
                    "content": "Hello everyone",
                    "start_time": "0.000s",
                    "end_time": "2.500s",
                    "speaker": "spk_0"
                },
                {
                    "content": "Hi there",
                    "start_time": "2.500s",
                    "end_time": "4.000s",
                    "speaker": "spk_1"
                }
            ],
            "summary": "A brief test meeting"
        }'''
        
        transcriber.client.generate_content.return_value = mock_response
        
        result = await transcriber.transcribe_audio("test_audio.mp3")
        
        # Verify calls
        mock_genai.upload_file.assert_called_once_with("test_audio.mp3")
        transcriber.client.generate_content.assert_called_once()
        
        # Verify result
        assert isinstance(result, GeminiTranscriptionResponse)
        assert result.title == "Test Meeting"
        assert len(result.speech_segments) == 2
        assert result.speech_segments[0].content == "Hello everyone"
        assert result.speech_segments[0].speaker == "spk_0"
        assert result.summary == "A brief test meeting"
    
    @pytest.mark.asyncio
    async def test_transcribe_audio_json_parsing_error(self, transcriber, mock_genai):
        # Mock file upload
        mock_file = Mock()
        mock_genai.upload_file.return_value = mock_file
        
        # Mock response with invalid JSON
        mock_response = Mock()
        mock_response.text = "This is not JSON"
        
        transcriber.client.generate_content.return_value = mock_response
        
        with pytest.raises(Exception) as exc_info:
            await transcriber.transcribe_audio("test_audio.mp3")
        
        assert "Failed to parse transcription response" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_transcribe_audio_api_error(self, transcriber, mock_genai):
        # Mock file upload to raise error
        mock_genai.upload_file.side_effect = Exception("API Error")
        
        with pytest.raises(Exception) as exc_info:
            await transcriber.transcribe_audio("test_audio.mp3")
        
        assert "Error transcribing audio" in str(exc_info.value)
    
    def test_speech_segment_model(self):
        segment = SpeechSegment(
            content="Test content",
            start_time="0.000s",
            end_time="5.000s",
            speaker="spk_0"
        )
        
        assert segment.content == "Test content"
        assert segment.start_time == "0.000s"
        assert segment.end_time == "5.000s"
        assert segment.speaker == "spk_0"