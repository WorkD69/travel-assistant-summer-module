"""Точка входа Telegram-бота «Тревел-помощник» (long polling)."""
from __future__ import annotations

import asyncio
import logging
import sys
from dataclasses import dataclass

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
)
from aiogram.types import BotCommand, LinkPreviewOptions

from app.config import Settings
from app.handlers import setup_routers
from app.logging import setup_logging
from app.middlewares.errors import ErrorHandlingMiddleware
from app.middlewares.throttling import ThrottlingMiddleware
from app.repositories.bot_state import BotStateRepository
from app.repositories.fsm_storage import SQLiteFSMStorage
from app.services.ai.base import AIProvider
from app.services.ai.factory import create_ai_provider
from app.services.deep_links.service import DeepLinkService
from app.services.demo import DemoService
from app.services.notifications.dispatcher import (
    NotificationDispatcher,
    SendResult,
    TelegramNotificationMessage,
    TransientSendError,
)
from app.services.notifications.poller import NotificationPoller
from app.services.travel_api.factory import create_travel_api_client

logger = logging.getLogger(__name__)

BOT_COMMANDS = [
    BotCommand(command="start", description="Начать / привязать аккаунт"),
    BotCommand(command="trips", description="Мои поездки"),
    BotCommand(command="history", description="Завершённые поездки"),
    BotCommand(command="today", description="События на сегодня"),
    BotCommand(command="next", description="Ближайшее событие"),
    BotCommand(command="documents", description="Документы поездки"),
    BotCommand(command="messages", description="Сообщения организатора"),
    BotCommand(command="sos", description="Отправить SOS"),
    BotCommand(command="mysos", description="Мои обращения SOS"),
    BotCommand(command="assistant", description="AI-помощник"),
    BotCommand(command="notifications", description="Настройки уведомлений"),
    BotCommand(command="settings", description="Настройки"),
    BotCommand(command="unlink", description="Отвязать Telegram"),
    BotCommand(command="help", description="Справка"),
    BotCommand(command="cancel", description="Отменить действие"),
    BotCommand(command="demo", description="Демо-события (dev mock)"),
]


class AiogramSender:
    """NotificationSender поверх aiogram Bot."""

    def __init__(self, bot: Bot) -> None:
        self._bot = bot

    async def send(self, message: TelegramNotificationMessage) -> SendResult:
        try:
            await self._bot.send_message(
                chat_id=message.chat_id,
                text=message.text,
                parse_mode=message.parse_mode,
                reply_markup=message.inline_keyboard,
                link_preview_options=LinkPreviewOptions(
                    is_disabled=message.disable_web_page_preview
                ),
            )
            return SendResult.SENT
        except TelegramForbiddenError:
            return SendResult.BLOCKED
        except TelegramBadRequest as exc:
            if "chat not found" in str(exc).lower():
                return SendResult.BLOCKED
            raise
        except (TelegramRetryAfter, TelegramNetworkError) as exc:
            raise TransientSendError(str(exc)) from exc


@dataclass
class BotApplication:
    """All runtime resources created for one bot process."""

    settings: Settings
    bot: Bot
    dispatcher: Dispatcher
    state_repo: BotStateRepository
    api: object
    ai: AIProvider
    notification_dispatcher: NotificationDispatcher | None
    notification_poller: NotificationPoller | None
    _closed: bool = False

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self.notification_poller is not None:
            await self.notification_poller.stop()
        await self.ai.close()
        await self.api.close()
        await self.dispatcher.storage.close()
        await self.bot.session.close()
        self.state_repo.close()


async def build_application(settings: Settings) -> BotApplication:
    """Build the complete application without contacting Telegram or polling."""
    state_repo = BotStateRepository(settings.sqlite_path)
    api = create_travel_api_client(settings, state_repo)
    deep_links = DeepLinkService(settings.web_app_base_url)
    ai = create_ai_provider(settings)
    demo = DemoService(api, enabled=settings.demo_enabled)

    bot = Bot(
        settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode=None),
    )
    storage = SQLiteFSMStorage(state_repo)
    await storage.cleanup_stale(max_age_seconds=7 * 24 * 60 * 60)
    dp = Dispatcher(storage=storage)
    dp.workflow_data.update(
        api=api,
        deep_links=deep_links,
        app_settings=settings,
        ai=ai,
        state_repo=state_repo,
        demo=demo,
    )

    error_middleware = ErrorHandlingMiddleware()
    throttling_middleware = ThrottlingMiddleware()
    dp.message.middleware(error_middleware)
    dp.callback_query.middleware(error_middleware)
    dp.message.middleware(throttling_middleware)
    dp.callback_query.middleware(throttling_middleware)
    setup_routers(dp)

    notification_dispatcher = None
    notification_poller = None
    if settings.notification_mode == "polling":
        notification_dispatcher = NotificationDispatcher(
            api,
            AiogramSender(bot),
            state_repo,
            deep_links,
        )
        notification_poller = NotificationPoller(
            notification_dispatcher,
            interval_seconds=settings.notification_poll_interval_seconds,
        )

    return BotApplication(
        settings=settings,
        bot=bot,
        dispatcher=dp,
        state_repo=state_repo,
        api=api,
        ai=ai,
        notification_dispatcher=notification_dispatcher,
        notification_poller=notification_poller,
    )


async def main() -> None:
    settings = Settings()
    problems = settings.validate_for_start()
    if problems:
        for p in problems:
            print(f"ОШИБКА НАСТРОЙКИ: {p}", file=sys.stderr)
        sys.exit(1)

    setup_logging(settings.log_level)
    logger.info("Запуск бота: BOT_DATA_MODE=%s, AI_PROVIDER=%s, NOTIFICATION_MODE=%s",
                settings.bot_data_mode, settings.ai_provider, settings.notification_mode)

    application = await build_application(settings)
    try:
        try:
            await application.bot.set_my_commands(BOT_COMMANDS)
        except TelegramNetworkError as exc:
            logger.warning(
                "Не удалось зарегистрировать команды из-за временной ошибки Telegram; "
                "polling продолжит попытки: error_type=%s",
                type(exc).__name__,
            )
        if application.notification_poller is not None:
            application.notification_poller.start()
        while True:
            try:
                await application.dispatcher.start_polling(application.bot)
                break
            except TelegramNetworkError as exc:
                logger.warning(
                    "Начальный polling недоступен из-за временной ошибки Telegram; "
                    "повтор через 5 секунд: error_type=%s",
                    type(exc).__name__,
                )
                await asyncio.sleep(5)
    finally:
        await application.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
