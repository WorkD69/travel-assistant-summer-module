"""Smoke tests for the real bot entry point and startup-only components."""
from __future__ import annotations

import importlib

from app.config import Settings


def make_settings(**overrides) -> Settings:
    values = {
        "bot_env": "development",
        "bot_data_mode": "mock",
        "bot_update_mode": "polling",
        "telegram_bot_token": "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        "ai_provider": "mock",
        "gemini_enabled": False,
        "notification_mode": "polling",
        "database_url": "sqlite+aiosqlite:///:memory:",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_app_bot_imports_and_exposes_application_factory() -> None:
    module = importlib.import_module("app.bot")

    assert callable(module.build_application)


async def test_demo_filter_requires_development_and_mock() -> None:
    from app.filters.demo import DemoEnabledFilter

    enabled = DemoEnabledFilter()

    assert await enabled(None, app_settings=make_settings()) is True
    assert await enabled(
        None, app_settings=make_settings(bot_env="production")
    ) is False
    assert await enabled(
        None, app_settings=make_settings(bot_data_mode="api", travel_api_service_token="x")
    ) is False


async def test_application_factory_registers_routers_and_middleware() -> None:
    from app.bot import build_application

    application = await build_application(make_settings())
    try:
        router_names = {router.name for router in application.dispatcher.sub_routers}
        assert {
            "common",
            "start",
            "sos",
            "assistant",
            "trips",
            "today",
            "next",
            "documents",
            "notifications",
            "settings",
            "demo",
            "help",
        } <= router_names
        assert application.dispatcher.message.middleware
        assert application.dispatcher.callback_query.middleware
    finally:
        await application.close()


async def test_application_close_closes_selected_ai_provider_once(monkeypatch) -> None:
    import app.bot as bot_module

    class RecordingAI:
        name = "recording"

        def __init__(self):
            self.close_calls = 0

        async def generate(self, question, context_text, history):
            return "answer"

        async def close(self):
            self.close_calls += 1

    ai = RecordingAI()
    monkeypatch.setattr(bot_module, "create_ai_provider", lambda settings: ai)
    application = await bot_module.build_application(make_settings())

    await application.close()
    await application.close()

    assert application.ai is ai
    assert ai.close_calls == 1


async def test_main_runs_polling_lifecycle_without_real_telegram(monkeypatch) -> None:
    import app.bot as bot_module

    calls = []

    class FakeBot:
        async def set_my_commands(self, commands):
            calls.append(("commands", len(commands)))

    class FakeDispatcher:
        async def start_polling(self, bot):
            calls.append(("polling", bot))

    class FakePoller:
        def start(self):
            calls.append(("notification_poller", None))

    class FakeApplication:
        bot = FakeBot()
        dispatcher = FakeDispatcher()
        notification_poller = FakePoller()

        async def close(self):
            calls.append(("close", None))

    settings = make_settings()

    async def fake_build_application(received_settings):
        assert received_settings is settings
        return FakeApplication()

    monkeypatch.setattr(bot_module, "Settings", lambda: settings)
    monkeypatch.setattr(bot_module, "build_application", fake_build_application)
    monkeypatch.setattr(bot_module, "setup_logging", lambda level: None)

    await bot_module.main()

    assert [name for name, _ in calls] == [
        "commands",
        "notification_poller",
        "polling",
        "close",
    ]


async def test_main_continues_after_transient_command_registration_error(
    monkeypatch,
) -> None:
    import app.bot as bot_module
    from aiogram.exceptions import TelegramNetworkError

    calls = []

    class FakeBot:
        async def set_my_commands(self, commands):
            calls.append(("commands", len(commands)))
            raise TelegramNetworkError(method=None, message="temporary network failure")

    class FakeDispatcher:
        async def start_polling(self, bot):
            calls.append(("polling", bot))

    class FakePoller:
        def start(self):
            calls.append(("notification_poller", None))

    class FakeApplication:
        bot = FakeBot()
        dispatcher = FakeDispatcher()
        notification_poller = FakePoller()

        async def close(self):
            calls.append(("close", None))

    settings = make_settings()

    async def fake_build_application(received_settings):
        assert received_settings is settings
        return FakeApplication()

    monkeypatch.setattr(bot_module, "Settings", lambda: settings)
    monkeypatch.setattr(bot_module, "build_application", fake_build_application)
    monkeypatch.setattr(bot_module, "setup_logging", lambda level: None)

    await bot_module.main()

    assert [name for name, _ in calls] == [
        "commands",
        "notification_poller",
        "polling",
        "close",
    ]


async def test_main_retries_initial_polling_network_error(monkeypatch) -> None:
    import app.bot as bot_module
    from aiogram.exceptions import TelegramNetworkError

    calls = []

    class FakeBot:
        async def set_my_commands(self, commands):
            calls.append(("commands", len(commands)))

    class FakeDispatcher:
        attempts = 0

        async def start_polling(self, bot):
            self.attempts += 1
            calls.append(("polling", self.attempts))
            if self.attempts == 1:
                raise TelegramNetworkError(
                    method=None,
                    message="temporary startup network failure",
                )

    class FakeApplication:
        bot = FakeBot()
        dispatcher = FakeDispatcher()
        notification_poller = None

        async def close(self):
            calls.append(("close", None))

    settings = make_settings()

    async def fake_build_application(received_settings):
        assert received_settings is settings
        return FakeApplication()

    async def fake_sleep(seconds):
        calls.append(("sleep", seconds))

    monkeypatch.setattr(bot_module, "Settings", lambda: settings)
    monkeypatch.setattr(bot_module, "build_application", fake_build_application)
    monkeypatch.setattr(bot_module, "setup_logging", lambda level: None)
    monkeypatch.setattr(bot_module.asyncio, "sleep", fake_sleep)

    await bot_module.main()

    assert calls == [
        ("commands", len(bot_module.BOT_COMMANDS)),
        ("polling", 1),
        ("sleep", 5),
        ("polling", 2),
        ("close", None),
    ]
