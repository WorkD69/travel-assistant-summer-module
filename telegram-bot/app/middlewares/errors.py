"""Глобальная обработка ошибок: пользователь никогда не видит внутренние exception."""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject

from app.services.ai.base import AIProviderError
from app.services.travel_api.errors import TravelApiError

logger = logging.getLogger(__name__)

_FALLBACK = "Что-то пошло не так. Попробуйте ещё раз чуть позже."


class ErrorHandlingMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        try:
            return await handler(event, data)
        except (TravelApiError, AIProviderError) as exc:
            await self._reply(event, exc.user_message)
        except Exception:  # noqa: BLE001 - последний рубеж, без утечки деталей
            logger.exception("unhandled error in handler")
            await self._reply(event, _FALLBACK)

    @staticmethod
    async def _reply(event: TelegramObject, text: str) -> None:
        try:
            if isinstance(event, CallbackQuery):
                await event.answer(text[:190], show_alert=True)
            elif isinstance(event, Message):
                await event.answer(text)
        except Exception:  # noqa: BLE001 - ответ об ошибке не должен ронять бота
            logger.warning("failed to deliver error message to user")
