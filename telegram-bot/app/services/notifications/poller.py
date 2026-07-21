"""NOTIFICATION_MODE=polling: фоновый опрос pending-уведомлений.

Webhook-режим для production описан в docs/BOT-BACKEND-CONTRACT.md и здесь не разворачивается.
"""
from __future__ import annotations

import asyncio
import logging

from app.services.notifications.dispatcher import NotificationDispatcher

logger = logging.getLogger(__name__)


class NotificationPoller:
    def __init__(self, dispatcher: NotificationDispatcher, interval_seconds: float = 10) -> None:
        self._dispatcher = dispatcher
        self._interval = interval_seconds
        self._task: asyncio.Task | None = None
        self._stopped = asyncio.Event()

    async def _loop(self) -> None:
        while not self._stopped.is_set():
            try:
                await self._dispatcher.process_pending()
            except Exception:
                logger.exception("Ошибка цикла уведомлений")
            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=self._interval)
            except asyncio.TimeoutError:
                pass

    def start(self) -> None:
        if self._task is None:
            self._stopped.clear()
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._stopped.set()
        if self._task is not None:
            await self._task
            self._task = None
