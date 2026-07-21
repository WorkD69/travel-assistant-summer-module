"""Filter that keeps demo mutation commands out of production and API mode."""
from __future__ import annotations

from typing import Any

from aiogram.filters import Filter
from aiogram.types import TelegramObject

from app.config import Settings


class DemoEnabledFilter(Filter):
    async def __call__(
        self,
        event: TelegramObject | None,
        app_settings: Settings,
        **_: Any,
    ) -> bool:
        return app_settings.demo_enabled
