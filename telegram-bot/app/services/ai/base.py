"""Интерфейс AI-провайдера. AI только отвечает — никаких изменяющих действий."""
from __future__ import annotations

from abc import ABC, abstractmethod

SYSTEM_PROMPT = (
    "Ты — помощник путешественника в проекте «Тревел-помощник». "
    "Отвечай кратко и по-русски, только на основе переданного контекста поездки. "
    "Если данных нет — честно скажи об этом. "
    "Ты не можешь создавать или менять поездки, отправлять SOS, подтверждать нарушения, "
    "выбирать План Б, публиковать сообщения или удалять данные — только информировать."
)


class AIProviderError(RuntimeError):
    """Base provider error safe for global middleware handling."""

    default_user_message = "AI-помощник временно недоступен. Попробуйте позже."

    def __init__(self, detail: str = "", user_message: str | None = None) -> None:
        super().__init__(detail or self.__class__.__name__)
        self.detail = detail
        self.user_message = user_message or self.default_user_message


class AIProviderUnavailableError(AIProviderError):
    """Provider SDK, model, network, or service is unavailable."""


class AIProviderAuthenticationError(AIProviderError):
    """Provider rejected the configured key or model access."""

    default_user_message = (
        "Groq отклонил ключ или доступ к модели. Проверьте локальную AI-конфигурацию."
    )


class AIProviderQuotaError(AIProviderError):
    default_user_message = "Превышен лимит запросов к AI. Попробуйте через несколько минут."


class AIProviderTimeoutError(AIProviderError):
    default_user_message = "AI-помощник не успел ответить. Попробуйте ещё раз."


class AIProviderInvalidResponseError(AIProviderError):
    default_user_message = "AI-помощник вернул некорректный ответ. Попробуйте позже."


class AIProvider(ABC):
    name: str = "ai"

    @abstractmethod
    async def generate(self, question: str, context_text: str,
                       history: list[tuple[str, str]]) -> str:
        """Вернуть ответ на вопрос с учётом контекста и истории [(role, text), ...]."""

    async def close(self) -> None:
        """Освободить ресурсы провайдера; по умолчанию освобождать нечего."""
