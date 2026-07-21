"""Persistence and cleanup tests for SQLite-backed aiogram FSM storage."""
from __future__ import annotations

import asyncio

from aiogram.fsm.storage.base import StorageKey

from app.repositories.bot_state import BotStateRepository
from app.repositories.fsm_storage import SQLiteFSMStorage


def key() -> StorageKey:
    return StorageKey(
        bot_id=123,
        chat_id=456,
        user_id=789,
        thread_id=11,
        business_connection_id="business-1",
        destiny="sos",
    )


async def test_state_and_data_survive_repository_restart(tmp_path) -> None:
    db_path = tmp_path / "state.db"
    first_repo = BotStateRepository(str(db_path))
    first = SQLiteFSMStorage(first_repo)
    await first.set_state(key(), "SosStates:description")
    await first.set_data(key(), {"trip_id": "t-1", "category": "delay"})
    first_repo.close()

    second_repo = BotStateRepository(str(db_path))
    second = SQLiteFSMStorage(second_repo)
    try:
        assert await second.get_state(key()) == "SosStates:description"
        assert await second.get_data(key()) == {
            "trip_id": "t-1",
            "category": "delay",
        }
    finally:
        second_repo.close()


async def test_none_and_empty_values_remove_fsm_records(tmp_path) -> None:
    repo = BotStateRepository(str(tmp_path / "state.db"))
    storage = SQLiteFSMStorage(repo)
    try:
        await storage.set_state(key(), "active")
        await storage.set_data(key(), {"x": 1})
        await storage.set_state(key(), None)
        await storage.set_data(key(), {})

        assert await storage.get_state(key()) is None
        assert await storage.get_data(key()) == {}
    finally:
        repo.close()


async def test_cleanup_removes_stale_state(tmp_path) -> None:
    repo = BotStateRepository(str(tmp_path / "state.db"))
    storage = SQLiteFSMStorage(repo)
    try:
        await storage.set_state(key(), "active")
        await asyncio.sleep(0.01)

        assert await storage.cleanup_stale(max_age_seconds=0) == 1
        assert await storage.get_state(key()) is None
    finally:
        repo.close()


def test_repository_close_is_idempotent() -> None:
    repo = BotStateRepository(":memory:")

    repo.close()
    repo.close()

