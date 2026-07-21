"""Последовательный fallback между AI-провайдерами."""
from __future__ import annotations

from app.services.ai.base import (
    AIProvider,
    AIProviderAuthenticationError,
    AIProviderError,
)


class FallbackAIProvider(AIProvider):
    """Вызывает резервный провайдер после типизированной ошибки основного."""

    name = "fallback"

    def __init__(self, primary: AIProvider, fallback: AIProvider, enabled: bool) -> None:
        self.primary = primary
        self.fallback = fallback
        self.enabled = enabled
        self._closed = False

    async def generate(
        self,
        question: str,
        context_text: str,
        history: list[tuple[str, str]],
    ) -> str:
        try:
            return await self.primary.generate(question, context_text, history)
        except AIProviderError as exc:
            if not self.enabled:
                raise
            answer = await self.fallback.generate(question, context_text, history)
            if isinstance(exc, AIProviderAuthenticationError):
                notice = (
                    "⚠️ Groq отклонил ключ или доступ к модели. "
                    "Ответ переключён на MockAIProvider."
                )
            else:
                notice = (
                    "⚠️ Groq временно недоступен. "
                    "Ответ переключён на MockAIProvider."
                )
            return f"{notice}\n\n{answer}"

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        closed: set[int] = set()
        for provider in (self.primary, self.fallback):
            if id(provider) in closed:
                continue
            closed.add(id(provider))
            await provider.close()
