"""Подключение всех роутеров. Порядок важен: FSM-роутеры раньше общих."""
from __future__ import annotations

import importlib

from aiogram import Dispatcher


def setup_routers(dp: Dispatcher) -> None:
    from app.handlers import common, help as help_handler, start, trips

    modules = [common, start, trips, help_handler]
    for module in modules:
        if module.router.parent_router is not None:
            module = importlib.reload(module)
        dp.include_router(module.router)
