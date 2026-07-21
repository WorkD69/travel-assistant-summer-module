"""Единственная точка выбора и композиции AI-провайдера."""
from __future__ import annotations

import logging

from app.config import Settings
from app.services.ai.base import AIProvider
from app.services.ai.fallback import FallbackAIProvider
from app.services.ai.mock import MockAIProvider

logger = logging.getLogger(__name__)


def create_ai_provider(settings: Settings) -> AIProvider:
    if settings.ai_provider == "groq":
        if not settings.groq_api_key:
            if settings.ai_fallback_to_mock:
                logger.info("GROQ_API_KEY не задан — используется MockAIProvider")
                return MockAIProvider()
            from app.services.ai.base import AIProviderUnavailableError

            raise AIProviderUnavailableError("GROQ_API_KEY пуст")
        from app.services.ai.groq import GroqAIProvider

        primary = GroqAIProvider(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
            model=settings.groq_model,
            fallback_model=settings.groq_fallback_model,
            timeout_seconds=settings.ai_timeout_seconds,
            max_retries=settings.ai_max_retries,
            max_history_messages=settings.ai_max_history_messages,
            max_context_characters=settings.ai_max_context_characters,
            max_output_tokens=settings.ai_max_output_tokens,
            proxy_url=settings.groq_proxy_url,
        )
        if settings.ai_fallback_to_mock:
            return FallbackAIProvider(primary, MockAIProvider(), enabled=True)
        return primary
    if (settings.ai_provider == "gemini" and settings.gemini_enabled
            and settings.gemini_api_key and settings.gemini_model):
        from app.services.ai.gemini import GeminiAIProvider

        return GeminiAIProvider(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
        )
    if settings.ai_provider == "gemini" and settings.gemini_enabled:
        logger.info("GEMINI_API_KEY/GEMINI_MODEL не заданы — используется MockAIProvider")
    return MockAIProvider()
