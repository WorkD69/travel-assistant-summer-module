"""Подключение всех роутеров. Порядок важен: FSM-роутеры раньше общих."""
from __future__ import annotations

import importlib

from aiogram import Dispatcher


def setup_routers(dp: Dispatcher) -> None:
    from app.handlers import (
        assistant, common, demo, documents, help as help_handler,
        next_event, notifications, settings, sos, start, today, trips,
    )

    modules = [
        common,
        start,
        sos,
        assistant,
        trips,
        today,
        next_event,
        documents,
        notifications,
        settings,
        demo,
        help_handler,
    ]
    for module in modules:
        if module.router.parent_router is not None:
            module = importlib.reload(module)
        dp.include_router(module.router)
