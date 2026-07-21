"""Handler-facing command, document, and help regressions."""
from __future__ import annotations

from types import SimpleNamespace

from aiogram.types import FSInputFile

from app.bot import BOT_COMMANDS
from app.handlers import common
from app.handlers.documents import cb_doc_get
from app.handlers.help import HELP_TEXT
from app.keyboards.inline import open_trip_kb
from app.services.deep_links.service import DeepLinkService
from tests.helpers import ANNA_TG, link_both, make_env


def test_all_required_commands_are_registered() -> None:
    commands = {item.command for item in BOT_COMMANDS}

    assert {
        "start", "trips", "history", "today", "next", "documents", "messages",
        "sos", "mysos", "assistant", "notifications", "settings", "unlink", "help",
        "cancel", "demo",
    } <= commands


def test_help_lists_messages_and_my_sos() -> None:
    assert "/messages" in HELP_TEXT
    assert "/mysos" in HELP_TEXT


def test_localhost_deep_link_uses_callback_instead_of_invalid_url_button() -> None:
    keyboard = open_trip_kb(
        "http://localhost:8011/trip-overview.html?tripId=t-turkey"
    )

    button = keyboard.inline_keyboard[0][0]
    assert button.url is None
    assert button.callback_data == "local_site:trip:t-turkey"


async def test_local_site_callback_sends_plain_text_trip_link() -> None:
    handler = getattr(common, "cb_local_site", None)
    assert handler is not None

    class RecordingMessage:
        text = None

        async def answer(self, text, **kwargs):
            self.text = text

    class RecordingCallback:
        data = "local_site:trip:t-turkey"
        message = RecordingMessage()
        answered = False

        async def answer(self, *args, **kwargs):
            self.answered = True

    callback = RecordingCallback()
    await handler(callback, DeepLinkService("http://localhost:8011"))

    assert (
        "http://localhost:8011/trip-overview.html?tripId=t-turkey"
        in callback.message.text
    )
    assert "Telegram Desktop" in callback.message.text
    assert callback.answered is True


async def test_mock_document_handler_sends_input_file() -> None:
    env = make_env()
    await link_both(env.api)

    class RecordingMessage:
        document = None
        caption = None

        async def answer_document(self, document, caption=None):
            self.document = document
            self.caption = caption

        async def answer(self, *args, **kwargs):
            raise AssertionError("mock PDF must be sent as a Telegram document")

    class RecordingCallback:
        data = "doc:get:d-tickets"
        from_user = SimpleNamespace(id=ANNA_TG)
        message = RecordingMessage()
        answered = False

        async def answer(self, *args, **kwargs):
            self.answered = True

    callback = RecordingCallback()

    await cb_doc_get(callback, env.api)

    assert isinstance(callback.message.document, FSInputFile)
    assert callback.message.caption == "Авиабилеты туда-обратно"
    assert callback.answered is True
