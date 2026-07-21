"""NotificationDispatcher: получение события → проверки → отправка → подтверждение.

Без дублей (дедупликация по event_id), с учётом настроек и тихих часов,
с повторами только для временных ошибок отправки.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Protocol

from aiogram.types import InlineKeyboardMarkup

from app.keyboards.inline import site_link_btn
from app.schemas.models import NotificationEvent
from app.services.deep_links.service import DeepLinkService
from app.services.notifications.texts import PREF_KEY_BY_TYPE, format_notification, is_quiet_now
from app.services.travel_api.base import TravelApiClient

logger = logging.getLogger(__name__)


class TransientSendError(Exception):
    """Временная ошибка отправки в Telegram — можно повторить."""


@dataclass(frozen=True, slots=True)
class TelegramNotificationMessage:
    """Полностью подготовленное сообщение для Telegram-транспорта."""

    chat_id: int
    text: str
    parse_mode: str | None = None
    inline_keyboard: InlineKeyboardMarkup | None = None
    disable_web_page_preview: bool = True


class SendResult(str, Enum):
    SENT = "sent"
    BLOCKED = "blocked"


class NotificationSender(Protocol):
    async def send(self, message: TelegramNotificationMessage) -> SendResult: ...


def _button_text(target: str) -> str:
    return {
        "documents": "Открыть документы на сайте",
        "monitoring": "Открыть мониторинг на сайте",
        "messages": "Открыть сообщения на сайте",
        "sos": "Открыть SOS на сайте",
    }.get(target, "Открыть поездку")


class NotificationDispatcher:
    def __init__(self, api: TravelApiClient, sender: NotificationSender, state,
                 deep_links: DeepLinkService,
                 now_factory: Callable[[], datetime] | None = None,
                 send_retries: int = 3, retry_delay_seconds: float = 1.0) -> None:
        self._api = api
        self._sender = sender
        self._state = state
        self._deep_links = deep_links
        self._now = now_factory or (lambda: datetime.now(timezone.utc))
        self._send_retries = send_retries
        self._retry_delay = retry_delay_seconds

    async def dispatch(self, event: NotificationEvent) -> str:
        """Возвращает: sent | skipped_pref | deferred | duplicate | failed."""
        tg = event.recipient_telegram_id
        if await self._state.was_event_delivered(tg, event.event_id):
            await self._confirm_quietly(event.id)
            return "duplicate"

        prefs = await self._state.get_preferences(tg)
        pref_key = PREF_KEY_BY_TYPE.get(event.type)
        if pref_key is not None and not getattr(prefs, pref_key, True):
            await self._confirm_quietly(event.id)  # отключено пользователем
            return "skipped_pref"

        # Тихие часы не блокируют SOS организатору
        if event.type != "sos_received" and is_quiet_now(prefs, self._now()):
            return "deferred"  # остаётся в очереди, отправится после тихих часов

        text = format_notification(event)
        button_url = self._deep_links.for_target(
            event.deep_link_target, trip_id=event.trip_id, sos_id=event.sos_id)
        message = TelegramNotificationMessage(
            chat_id=tg,
            text=text,
            inline_keyboard=InlineKeyboardMarkup(
                inline_keyboard=[[
                    site_link_btn(_button_text(event.deep_link_target), button_url)
                ]]
            ),
        )

        for attempt in range(1, self._send_retries + 1):
            try:
                result = await self._sender.send(message)
                if result is SendResult.BLOCKED:
                    await self._mark_failed_quietly(event.id, "bot_blocked")
                    return "failed"
                break
            except TransientSendError as exc:
                if attempt >= self._send_retries:
                    logger.warning("Уведомление %s не отправлено после %s попыток",
                                   event.id, attempt)
                    await self._mark_failed_quietly(event.id, str(exc))
                    return "failed"
                await asyncio.sleep(self._retry_delay * attempt)

        await self._state.mark_event_delivered(tg, event.event_id)
        await self._confirm_quietly(event.id)
        return "sent"

    async def _confirm_quietly(self, notification_id: str) -> None:
        try:
            await self._api.confirm_notification_delivered(notification_id)
        except Exception:
            logger.exception("Не удалось подтвердить доставку уведомления")

    async def _mark_failed_quietly(self, notification_id: str, reason: str) -> None:
        try:
            await self._api.mark_notification_failed(notification_id, reason)
        except Exception:
            logger.exception("Не удалось пометить уведомление как failed")

    async def process_pending(self, limit: int = 50) -> dict[str, int]:
        stats = {"sent": 0, "skipped_pref": 0, "deferred": 0, "duplicate": 0, "failed": 0}
        try:
            events = await self._api.get_pending_notifications(limit=limit)
        except Exception:
            logger.exception("Ошибка получения pending-уведомлений")
            return stats
        for event in events:
            try:
                result = await self.dispatch(event)
            except Exception:
                logger.exception("Ошибка обработки уведомления %s", event.id)
                result = "failed"
            stats[result] = stats.get(result, 0) + 1
        return stats
