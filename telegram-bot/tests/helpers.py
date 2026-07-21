"""Общие хелперы для тестов (без aiogram/httpx — только логический слой)."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from app.repositories.bot_state import BotStateRepository
from app.services.notifications.dispatcher import (
    SendResult,
    TelegramNotificationMessage,
    TransientSendError,
)
from app.services.travel_api.mock_client import MockTravelApiClient

ARTEM_TG = 111
ANNA_TG = 222

FIXED_NOW = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)


def make_env(now: datetime | None = None) -> SimpleNamespace:
    fixed = now or FIXED_NOW
    repo = BotStateRepository(":memory:")
    api = MockTravelApiClient(repo, now_factory=lambda: fixed)
    return SimpleNamespace(api=api, repo=repo, now=fixed)


async def link_both(api: MockTravelApiClient) -> None:
    await api.consume_link_token(ARTEM_TG, "demo-artem")
    await api.consume_link_token(ANNA_TG, "demo-anna")


async def expect(exc_type, coro):
    try:
        await coro
    except exc_type:
        return
    raise AssertionError(f"ожидалась ошибка {exc_type.__name__}")


class FakeSender:
    """NotificationSender для тестов: первые fail_times попыток — временная ошибка."""

    def __init__(self, fail_times: int = 0) -> None:
        self.fail_times = fail_times
        self.attempts = 0
        self.sent: list[tuple[int, str]] = []
        self.messages: list[TelegramNotificationMessage] = []

    async def send(self, message: TelegramNotificationMessage) -> SendResult:
        self.attempts += 1
        if self.attempts <= self.fail_times:
            raise TransientSendError("временная ошибка Telegram")
        self.messages.append(message)
        self.sent.append((message.chat_id, message.text))
        return SendResult.SENT
