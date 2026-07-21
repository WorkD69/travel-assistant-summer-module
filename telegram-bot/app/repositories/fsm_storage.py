"""SQLite-хранилище FSM для aiogram (поверх kv-таблицы BotStateRepository)."""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from aiogram.fsm.state import State
from aiogram.fsm.storage.base import BaseStorage, StorageKey

from app.repositories.bot_state import BotStateRepository


class SQLiteFSMStorage(BaseStorage):
    def __init__(self, repo: BotStateRepository) -> None:
        self._repo = repo

    @staticmethod
    def _prefix(key: StorageKey) -> str:
        return ":".join((
            "fsm",
            str(key.bot_id),
            str(key.chat_id),
            str(key.user_id),
            str(key.thread_id or "-"),
            str(key.business_connection_id or "-"),
            key.destiny,
        ))

    @classmethod
    def _key(cls, key: StorageKey, suffix: str) -> str:
        return f"{cls._prefix(key)}:{suffix}"

    async def set_state(
        self, key: StorageKey, state: Optional[State | str] = None
    ) -> None:
        value = state.state if isinstance(state, State) else state
        if value is None:
            await self._repo.kv_delete(self._key(key, "state"))
        else:
            await self._repo.kv_set(self._key(key, "state"), value)
        await self._repo.fsm_touch(self._prefix(key))

    async def get_state(self, key: StorageKey) -> Optional[str]:
        return await self._repo.kv_get(self._key(key, "state"))

    async def set_data(self, key: StorageKey, data: dict[str, Any]) -> None:
        if data:
            await self._repo.kv_set(self._key(key, "data"), json.dumps(data))
        else:
            await self._repo.kv_delete(self._key(key, "data"))
        await self._repo.fsm_touch(self._prefix(key))

    async def get_data(self, key: StorageKey) -> dict[str, Any]:
        raw = await self._repo.kv_get(self._key(key, "data"))
        return json.loads(raw) if raw else {}

    async def close(self) -> None:  # соединение закрывает владелец BotStateRepository
        return None

    async def cleanup_stale(self, max_age_seconds: float = 86400) -> int:
        """Remove FSM entries not updated inside the configured retention window."""
        cutoff = time.time() - max(0, max_age_seconds)
        return await self._repo.cleanup_stale_fsm(cutoff)
