"""Техническое состояние бота в SQLite.

Здесь ХРАНИТСЯ только техническое: привязки telegram->site, активная поездка,
настройки уведомлений (mock), дедупликация доставки и короткая история AI-диалога.
НИКАКОЙ независимой копии поездок/документов здесь нет.
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from app.schemas.models import NotificationPreferences

_SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS links (
    telegram_user_id INTEGER PRIMARY KEY,
    site_user_id TEXT NOT NULL,
    linked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS active_trips (
    telegram_user_id INTEGER PRIMARY KEY,
    trip_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_prefs (
    telegram_user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS delivered_events (
    event_key TEXT PRIMARY KEY,
    delivered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assistant_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER NOT NULL,
    trip_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fsm_activity (
    prefix TEXT PRIMARY KEY,
    updated_at REAL NOT NULL
);
"""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class BotStateRepository:
    def __init__(self, path: str = "./bot_state.db") -> None:
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    async def _exec(self, query: str, params: tuple = (), fetch: str = "none"):
        def run():
            with self._lock:
                cur = self._conn.execute(query, params)
                if fetch == "one":
                    row = cur.fetchone()
                elif fetch == "all":
                    row = cur.fetchall()
                else:
                    row = None
                self._conn.commit()
                return row
        return await asyncio.to_thread(run)

    # ------------------------------------------------------------- kv
    async def kv_get(self, key: str) -> Optional[str]:
        row = await self._exec("SELECT value FROM kv WHERE key = ?", (key,), fetch="one")
        return row[0] if row else None

    async def kv_set(self, key: str, value: str) -> None:
        await self._exec(
            "INSERT INTO kv (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )

    async def kv_delete(self, key: str) -> None:
        await self._exec("DELETE FROM kv WHERE key = ?", (key,))

    async def fsm_touch(self, prefix: str) -> None:
        await self._exec(
            "INSERT INTO fsm_activity (prefix, updated_at) VALUES (?, ?) "
            "ON CONFLICT(prefix) DO UPDATE SET updated_at = excluded.updated_at",
            (prefix, time.time()),
        )

    async def cleanup_stale_fsm(self, cutoff_timestamp: float) -> int:
        rows = await self._exec(
            "SELECT prefix FROM fsm_activity WHERE updated_at <= ?",
            (cutoff_timestamp,),
            fetch="all",
        )
        prefixes = [row[0] for row in rows or []]
        for prefix in prefixes:
            await self._exec("DELETE FROM kv WHERE key LIKE ?", (f"{prefix}:%",))
            await self._exec("DELETE FROM fsm_activity WHERE prefix = ?", (prefix,))
        return len(prefixes)

    # ------------------------------------------------------------- привязки
    async def get_link(self, telegram_user_id: int) -> Optional[str]:
        row = await self._exec(
            "SELECT site_user_id FROM links WHERE telegram_user_id = ?",
            (telegram_user_id,), fetch="one",
        )
        return row[0] if row else None

    async def set_link(self, telegram_user_id: int, site_user_id: str) -> None:
        await self._exec(
            "INSERT INTO links (telegram_user_id, site_user_id, linked_at) VALUES (?, ?, ?) "
            "ON CONFLICT(telegram_user_id) DO UPDATE SET "
            "site_user_id = excluded.site_user_id, linked_at = excluded.linked_at",
            (telegram_user_id, site_user_id, _utcnow()),
        )

    async def delete_link(self, telegram_user_id: int) -> None:
        await self._exec("DELETE FROM links WHERE telegram_user_id = ?", (telegram_user_id,))

    async def find_telegram_by_site_user(self, site_user_id: str) -> list[int]:
        rows = await self._exec(
            "SELECT telegram_user_id FROM links WHERE site_user_id = ?",
            (site_user_id,), fetch="all",
        )
        return [row[0] for row in rows or []]

    # ------------------------------------------------------------- активная поездка
    async def get_active_trip(self, telegram_user_id: int) -> Optional[str]:
        row = await self._exec(
            "SELECT trip_id FROM active_trips WHERE telegram_user_id = ?",
            (telegram_user_id,), fetch="one",
        )
        return row[0] if row else None

    async def set_active_trip(self, telegram_user_id: int, trip_id: str) -> None:
        await self._exec(
            "INSERT INTO active_trips (telegram_user_id, trip_id) VALUES (?, ?) "
            "ON CONFLICT(telegram_user_id) DO UPDATE SET trip_id = excluded.trip_id",
            (telegram_user_id, trip_id),
        )

    async def clear_active_trip(self, telegram_user_id: int) -> None:
        await self._exec(
            "DELETE FROM active_trips WHERE telegram_user_id = ?", (telegram_user_id,))

    # ------------------------------------------------------------- настройки
    async def get_preferences(self, telegram_user_id: int) -> NotificationPreferences:
        row = await self._exec(
            "SELECT data FROM notification_prefs WHERE telegram_user_id = ?",
            (telegram_user_id,), fetch="one",
        )
        if not row:
            return NotificationPreferences()
        return NotificationPreferences.model_validate(json.loads(row[0]))

    async def set_preferences(self, telegram_user_id: int,
                              prefs: NotificationPreferences) -> None:
        await self._exec(
            "INSERT INTO notification_prefs (telegram_user_id, data) VALUES (?, ?) "
            "ON CONFLICT(telegram_user_id) DO UPDATE SET data = excluded.data",
            (telegram_user_id, prefs.model_dump_json()),
        )

    # ------------------------------------------------------------- дедупликация
    async def was_event_delivered(self, telegram_user_id: int, event_id: str) -> bool:
        row = await self._exec(
            "SELECT 1 FROM delivered_events WHERE event_key = ?",
            (f"{telegram_user_id}:{event_id}",), fetch="one",
        )
        return row is not None

    async def mark_event_delivered(self, telegram_user_id: int, event_id: str) -> None:
        await self._exec(
            "INSERT OR IGNORE INTO delivered_events (event_key, delivered_at) VALUES (?, ?)",
            (f"{telegram_user_id}:{event_id}", _utcnow()),
        )

    # ------------------------------------------------------------- история AI
    async def add_assistant_message(self, telegram_user_id: int, trip_id: str,
                                    role: str, text: str) -> None:
        await self._exec(
            "INSERT INTO assistant_history (telegram_user_id, trip_id, role, text, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (telegram_user_id, trip_id, role, text[:2000], _utcnow()),
        )
        await self._exec(
            "DELETE FROM assistant_history WHERE telegram_user_id = ? AND trip_id = ? "
            "AND id NOT IN (SELECT id FROM assistant_history "
            "WHERE telegram_user_id = ? AND trip_id = ? ORDER BY id DESC LIMIT 20)",
            (telegram_user_id, trip_id, telegram_user_id, trip_id),
        )

    async def get_assistant_history(self, telegram_user_id: int, trip_id: str,
                                    limit: int = 10) -> list[tuple[str, str]]:
        rows = await self._exec(
            "SELECT role, text FROM assistant_history "
            "WHERE telegram_user_id = ? AND trip_id = ? ORDER BY id DESC LIMIT ?",
            (telegram_user_id, trip_id, limit), fetch="all",
        )
        return [(r[0], r[1]) for r in reversed(rows or [])]

    async def clear_assistant_history(self, telegram_user_id: int, trip_id: str) -> None:
        await self._exec(
            "DELETE FROM assistant_history WHERE telegram_user_id = ? AND trip_id = ?",
            (telegram_user_id, trip_id),
        )

    def close(self) -> None:
        with self._lock:
            self._conn.close()
