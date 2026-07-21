"""GeminiAIProvider — официальный Google Gen AI SDK.

Ключ только на сервере бота. Модель задаётся ТОЛЬКО через GEMINI_MODEL.
Любая ошибка Gemini не роняет бота — возвращается безопасный текст.
"""
from __future__ import annotations

import asyncio
import logging

from app.services.ai.base import (
    SYSTEM_PROMPT,
    AIProvider,
    AIProviderError,
    AIProviderInvalidResponseError,
    AIProviderQuotaError,
    AIProviderTimeoutError,
    AIProviderUnavailableError,
)

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 24000


class GeminiAIProvider(AIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str, timeout_seconds: float = 30) -> None:
        if not api_key:
            raise AIProviderUnavailableError("GEMINI_API_KEY пуст")
        if not model:
            raise AIProviderUnavailableError("GEMINI_MODEL не задана в .env")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai  # ленивый импорт SDK

            self._client = genai.Client(api_key=self._api_key)
        return self._client

    async def generate(self, question: str, context_text: str,
                       history: list[tuple[str, str]]) -> str:
        context_text = context_text[:MAX_CONTEXT_CHARS]  # защита от слишком длинного контекста
        dialog = "\n".join(
            f"{'Пользователь' if role == 'user' else 'Помощник'}: {text}"
            for role, text in history[-10:]
        )
        prompt = (
            f"{SYSTEM_PROMPT}\n\nКонтекст поездки:\n{context_text}\n\n"
            f"История диалога:\n{dialog or '(пусто)'}\n\nВопрос: {question}"
        )
        try:
            client = self._get_client()

            def _call():
                return client.models.generate_content(model=self._model, contents=prompt)

            response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=self._timeout)
            text = getattr(response, "text", None)
            if not text or not str(text).strip():
                logger.warning("Gemini: пустой/некорректный ответ модели")
                raise AIProviderInvalidResponseError("empty Gemini response")
            return str(text).strip()
        except (asyncio.TimeoutError, TimeoutError):
            logger.warning("Gemini: timeout")
            raise AIProviderTimeoutError("Gemini timeout") from None
        except ModuleNotFoundError as exc:
            logger.error("Gemini: пакет google-genai не установлен")
            raise AIProviderUnavailableError("google-genai is not installed") from exc
        except AIProviderError:
            raise
        except Exception as exc:  # сеть/квота/недоступная модель/429
            message = str(exc)
            logger.warning("Gemini: ошибка %s", type(exc).__name__)
            if "429" in message or "quota" in message.lower() or "exhausted" in message.lower():
                raise AIProviderQuotaError(message) from exc
            raise AIProviderUnavailableError(message) from exc
