"""Transport-level tests for the typed Telegram notification contract."""
from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot import AiogramSender
from app.services.notifications.dispatcher import (
    SendResult,
    TelegramNotificationMessage,
)


class RecordingBot:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def send_message(self, **kwargs):
        self.calls.append(kwargs)


async def test_aiogram_sender_translates_typed_message() -> None:
    bot = RecordingBot()
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="Открыть поездку",
                url="http://localhost:8011/trip-overview.html?tripId=t-1",
            )
        ]]
    )
    message = TelegramNotificationMessage(
        chat_id=42,
        text="Рейс задержан",
        parse_mode=None,
        inline_keyboard=keyboard,
        disable_web_page_preview=True,
    )

    result = await AiogramSender(bot).send(message)

    assert result is SendResult.SENT
    assert bot.calls == [{
        "chat_id": 42,
        "text": "Рейс задержан",
        "parse_mode": None,
        "reply_markup": keyboard,
        "link_preview_options": bot.calls[0]["link_preview_options"],
    }]
    assert bot.calls[0]["link_preview_options"].is_disabled is True

