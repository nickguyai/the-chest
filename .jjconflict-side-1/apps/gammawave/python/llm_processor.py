from abc import ABC, abstractmethod
import google.generativeai as genai
from openai import OpenAI, AsyncOpenAI
from typing import AsyncGenerator, Generator, Optional
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class LLMProcessor(ABC):
    @abstractmethod
    async def process_text(self, text: str, prompt: str, model: Optional[str] = None) -> AsyncGenerator[str, None]:
        pass
    
    @abstractmethod
    def process_text_sync(self, text: str, prompt: str, model: Optional[str] = None) -> str:
        pass

class GeminiProcessor(LLMProcessor):
    def __init__(self, default_model: str = 'gemini-2.5-flash', config_manager=None):
        self.config = config_manager
        api_key = self.config.get_api_key("gemini") if self.config else None
        if not api_key:
            raise EnvironmentError("GOOGLE_API_KEY is not set")
        genai.configure(api_key=api_key)
        self.default_model = default_model

    async def process_text(self, text: str, prompt: str, model: Optional[str] = None) -> AsyncGenerator[str, None]:
        all_prompt = f"{prompt}\n\n{text}"
        model_name = model or self.default_model
        logger.info(f"Using model: {model_name} for processing")
        logger.info(f"Prompt: {all_prompt}")
        genai_model = genai.GenerativeModel(model_name)
        response = await genai_model.generate_content_async(
            all_prompt,
            stream=True
        )
        async for chunk in response:
            if chunk.text:
                yield chunk.text

    def process_text_sync(self, text: str, prompt: str, model: Optional[str] = None) -> str:
        all_prompt = f"{prompt}\n\n{text}"
        model_name = model or self.default_model
        logger.info(f"Using model: {model_name} for sync processing")
        logger.info(f"Prompt: {all_prompt}")
        genai_model = genai.GenerativeModel(model_name)
        response = genai_model.generate_content(all_prompt)
        return response.text

class GPTProcessor(LLMProcessor):
    def __init__(self, config_manager=None):
        self.config = config_manager
        api_key = self.config.get_api_key("openai") if self.config else None
        if not api_key:
            raise ValueError("OpenAI API key not found")
        self.async_client = AsyncOpenAI(api_key=api_key)
        self.sync_client = OpenAI(api_key=api_key)
        self.default_model = "gpt-4"

    async def process_text(self, text: str, prompt: str, model: Optional[str] = None) -> AsyncGenerator[str, None]:
        all_prompt = f"{prompt}\n\n{text}"
        model_name = model or self.default_model
        logger.info(f"Using model: {model_name} for processing")
        logger.info(f"Prompt: {all_prompt}")
        response = await self.async_client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "user", "content": all_prompt}
            ],
            stream=True
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def process_text_sync(self, text: str, prompt: str, model: Optional[str] = None) -> str:
        all_prompt = f"{prompt}\n\n{text}"
        model_name = model or self.default_model
        logger.info(f"Using model: {model_name} for sync processing")
        logger.info(f"Prompt: {all_prompt}")
        response = self.sync_client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "user", "content": all_prompt}
            ]
        )
        return response.choices[0].message.content

def get_llm_processor(model: str, config_manager=None) -> LLMProcessor:
    model = model.lower()
    if model.startswith(('gemini', 'gemini-')):
        return GeminiProcessor(default_model=model, config_manager=config_manager)
    elif model.startswith(('gpt-', 'o1-')):
        return GPTProcessor(config_manager=config_manager)
    else:
        raise ValueError(f"Unsupported model type: {model}")
