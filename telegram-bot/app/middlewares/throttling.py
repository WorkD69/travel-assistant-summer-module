"""Ограничение частоты сообщений от одного пользователя."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import Message, TelegramObject

from app.services.security.rate_limiter import SlidingWindowRateLimiter


class ThrottlingMiddleware(BaseMiddleware):
    def __init__(self, max_calls: int = 25, window_seconds: int = 30) -> None:
        self._limiter = SlidingWindowRateLimiter(max_calls, window_seconds)

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        if isinstance(event, Message) and event.from_user:
            if not self._limiter.allow(str(event.from_user.id)):
                return None  # молча игнорируем флуд
        return await handler(event, data)
