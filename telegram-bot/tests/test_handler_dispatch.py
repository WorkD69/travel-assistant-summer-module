"""Real Dispatcher command smoke tests with a fully offline aiogram session."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from aiogram.client.session.base import BaseSession
from aiogram.methods import SendDocument, SendMessage
from aiogram.types import Chat, Message, MessageEntity, Update, User

from app.bot import build_application
from app.config import Settings


class MockedBotSession(BaseSession):
    """Record Bot API methods and return local objects without network access."""

    def __init__(self) -> None:
        super().__init__()
        self.methods = []
        self.closed = False

    async def close(self) -> None:
        self.closed = True

    async def make_request(self, bot, method, timeout=None):
        self.methods.append(method)
        if isinstance(method, (SendMessage, SendDocument)):
            return Message(
                message_id=len(self.methods),
                date=datetime.now(timezone.utc),
                chat=Chat(id=method.chat_id, type="private"),
                text=getattr(method, "text", None),
            )
        return True

    async def stream_content(self, *args, **kwargs):
        if False:
            yield b""


def command_update(update_id: int, telegram_id: int, command: str) -> Update:
    return Update(
        update_id=update_id,
        message=Message(
            message_id=update_id,
            date=datetime.now(timezone.utc),
            chat=Chat(id=telegram_id, type="private"),
            from_user=User(id=telegram_id, is_bot=False, first_name="Анна"),
            text=command,
            entities=[MessageEntity(type="bot_command", offset=0, length=len(command.split()[0]))],
        ),
    )


async def test_required_commands_dispatch_without_real_telegram_or_unhandled_errors() -> None:
    settings = Settings(
        _env_file=None,
        bot_env="development",
        bot_data_mode="mock",
        bot_update_mode="polling",
        telegram_bot_token="123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        ai_provider="mock",
        gemini_enabled=False,
        database_url="sqlite+aiosqlite:///:memory:",
    )
    application = await build_application(settings)
    await application.bot.session.close()
    session = MockedBotSession()
    application.bot.session = session
    telegram_id = 222

    try:
        await application.api.consume_link_token(telegram_id, "demo-anna")
        await application.api.select_active_trip(telegram_id, "t-turkey")
        commands = [
            "/start",
            "/trips",
            "/history",
            "/today",
            "/next",
            "/documents",
            "/messages",
            "/sos",
            "/cancel",
            "/mysos",
            "/assistant",
            "/cancel",
            "/notifications",
            "/settings",
            "/help",
            "/demo",
            "/unlink",
            "/cancel",
        ]
        for update_id, command in enumerate(commands, start=1):
            before = len(session.methods)
            await application.dispatcher.feed_update(
                application.bot,
                command_update(update_id, telegram_id, command),
            )
            assert len(session.methods) > before, command

        sent_texts = [
            method.text for method in session.methods
            if isinstance(method, SendMessage) and method.text
        ]
        assert not any("Что-то пошло не так" in text for text in sent_texts)
        assert session.closed is False
    finally:
        await application.close()

    assert session.closed is True


async def test_start_deep_link_consumes_one_time_token_through_dispatcher() -> None:
    settings = Settings(
        _env_file=None,
        bot_env="development",
        bot_data_mode="mock",
        bot_update_mode="polling",
        telegram_bot_token="123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        ai_provider="mock",
        gemini_enabled=False,
        database_url="sqlite+aiosqlite:///:memory:",
    )
    application = await build_application(settings)
    await application.bot.session.close()
    session = MockedBotSession()
    application.bot.session = session
    telegram_id = 111

    try:
        await application.dispatcher.feed_update(
            application.bot,
            command_update(1, telegram_id, "/start link_demo-artem"),
        )

        profile = await application.api.get_me(telegram_id)
        sent_texts = [
            method.text for method in session.methods
            if isinstance(method, SendMessage) and method.text
        ]
        assert profile.name == "Артём"
        assert any(
            "Telegram успешно подключён к аккаунту “Тревел-помощника”" in text
            for text in sent_texts
        )
    finally:
        await application.close()


async def test_start_deep_link_rejects_malformed_payload_before_api_call() -> None:
    settings = Settings(
        _env_file=None,
        bot_env="development",
        bot_data_mode="mock",
        bot_update_mode="polling",
        telegram_bot_token="123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        ai_provider="mock",
        gemini_enabled=False,
        database_url="sqlite+aiosqlite:///:memory:",
    )
    application = await build_application(settings)
    await application.bot.session.close()
    session = MockedBotSession()
    application.bot.session = session

    async def must_not_consume(*_args, **_kwargs):
        raise AssertionError("malformed payload reached the backend")

    application.api.consume_link_token = must_not_consume
    try:
        await application.dispatcher.feed_update(
            application.bot,
            command_update(1, 333, "/start link_bad!payload"),
        )
        sent_texts = [
            method.text for method in session.methods
            if isinstance(method, SendMessage) and method.text
        ]
        assert any("Ссылка недействительна" in text for text in sent_texts)
        assert not any("Что-то пошло не так" in text for text in sent_texts)
    finally:
        await application.close()


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ("link_demo-expired", "Ссылка устарела. Вернитесь на сайт и создайте новую ссылку подключения."),
        ("link_demo-used", "Эта ссылка уже была использована. Проверьте статус подключения на сайте или создайте новую ссылку."),
    ],
)
async def test_start_deep_link_explains_expired_and_reused_links(payload: str, expected: str) -> None:
    settings = Settings(
        _env_file=None,
        bot_env="development",
        bot_data_mode="mock",
        bot_update_mode="polling",
        telegram_bot_token="123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        ai_provider="mock",
        gemini_enabled=False,
        database_url="sqlite+aiosqlite:///:memory:",
    )
    application = await build_application(settings)
    await application.bot.session.close()
    session = MockedBotSession()
    application.bot.session = session
    try:
        await application.dispatcher.feed_update(
            application.bot,
            command_update(1, 444, f"/start {payload}"),
        )
        sent_texts = [
            method.text for method in session.methods
            if isinstance(method, SendMessage) and method.text
        ]
        assert expected in sent_texts
    finally:
        await application.close()
