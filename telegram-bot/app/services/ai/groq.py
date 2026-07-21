"""GroqAIProvider поверх OpenAI-совместимого HTTP API Groq."""
from __future__ import annotations

import logging
import time

import httpx

from app.services.ai.base import (
    SYSTEM_PROMPT,
    AIProvider,
    AIProviderAuthenticationError,
    AIProviderError,
    AIProviderInvalidResponseError,
    AIProviderQuotaError,
    AIProviderTimeoutError,
    AIProviderUnavailableError,
)

logger = logging.getLogger(__name__)


class _ModelNotFoundError(AIProviderUnavailableError):
    """Текущая модель недоступна; можно перейти к следующей."""


class _NonRetryableGroqError(AIProviderUnavailableError):
    """Повтор или другая модель не исправят запрос."""


class GroqAIProvider(AIProvider):
    name = "groq"

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        fallback_model: str,
        timeout_seconds: float = 20,
        max_retries: int = 1,
        max_history_messages: int = 8,
        max_context_characters: int = 16000,
        max_output_tokens: int = 700,
        proxy_url: str = "",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise AIProviderUnavailableError("GROQ_API_KEY пуст")
        if not model or not fallback_model:
            raise AIProviderUnavailableError("Groq model не задана")
        self._model = model
        self._fallback_model = fallback_model
        self._max_retries = max_retries
        self._max_history_messages = max_history_messages
        self._max_context_characters = max_context_characters
        self._max_output_tokens = max_output_tokens
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout_seconds,
            proxy=proxy_url or None,
            trust_env=True,
            transport=transport,
        )

    def _messages(
        self,
        question: str,
        context_text: str,
        history: list[tuple[str, str]],
    ) -> list[dict[str, str]]:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Контекст поездки:\n"
                    + context_text[: self._max_context_characters]
                ),
            },
        ]
        messages.extend(
            {"role": role, "content": text}
            for role, text in history[-self._max_history_messages :]
            if role in {"user", "assistant"}
        )
        messages.append({"role": "user", "content": question})
        return messages

    async def generate(
        self,
        question: str,
        context_text: str,
        history: list[tuple[str, str]],
    ) -> str:
        messages = self._messages(question, context_text, history)
        context_chars = min(len(context_text), self._max_context_characters)
        last_error: AIProviderError | None = None
        models = list(dict.fromkeys((self._model, self._fallback_model)))
        for model in models:
            for attempt in range(1, self._max_retries + 2):
                try:
                    return await self._request_model(
                        model,
                        messages,
                        context_chars=context_chars,
                        attempt=attempt,
                    )
                except AIProviderAuthenticationError:
                    raise
                except _NonRetryableGroqError:
                    raise
                except _ModelNotFoundError as exc:
                    last_error = exc
                    break
                except (
                    AIProviderQuotaError,
                    AIProviderTimeoutError,
                    AIProviderUnavailableError,
                    AIProviderInvalidResponseError,
                ) as exc:
                    last_error = exc
                    if attempt > self._max_retries:
                        break
        if last_error is not None:
            raise last_error
        raise AIProviderUnavailableError("Groq models unavailable")

    async def _request_model(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        context_chars: int,
        attempt: int,
    ) -> str:
        started = time.perf_counter()
        status: int | str = "none"
        error_type = "none"
        try:
            payload = {
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "max_completion_tokens": self._max_output_tokens,
                "stream": False,
            }
            if model.startswith("openai/gpt-oss-"):
                payload["include_reasoning"] = False
                payload["reasoning_effort"] = "low"
            response = await self._client.post(
                "/chat/completions",
                json=payload,
            )
            status = response.status_code
            if status in {401, 403}:
                raise AIProviderAuthenticationError(f"Groq HTTP {status}")
            if status == 404:
                raise _ModelNotFoundError(f"Groq model HTTP {status}")
            if status == 429:
                raise AIProviderQuotaError("Groq HTTP 429")
            if status >= 500:
                raise AIProviderUnavailableError(f"Groq HTTP {status}")
            if status >= 400:
                raise _NonRetryableGroqError(f"Groq HTTP {status}")
            try:
                text = response.json()["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise AIProviderInvalidResponseError("invalid Groq response") from exc
            if not isinstance(text, str) or not text.strip():
                raise AIProviderInvalidResponseError("empty Groq response")
            return text.strip()
        except httpx.TimeoutException as exc:
            error_type = "timeout"
            raise AIProviderTimeoutError("Groq timeout") from exc
        except httpx.RequestError as exc:
            error_type = "network"
            raise AIProviderUnavailableError("Groq network error") from exc
        except AIProviderError as exc:
            error_type = type(exc).__name__
            raise
        finally:
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "provider=groq model=%s duration_ms=%s status=%s "
                "messages=%s context_chars=%s attempt=%s error=%s",
                model,
                duration_ms,
                status,
                len(messages),
                context_chars,
                attempt,
                error_type,
            )

    async def close(self) -> None:
        if not self._client.is_closed:
            await self._client.aclose()
