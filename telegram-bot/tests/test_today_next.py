"""Тесты TODAY/NEXT: события есть/нет, timezone, несколько поездок."""
from __future__ import annotations

from app.utils.formatting import event_line
from tests.helpers import ARTEM_TG, link_both, make_env


async def test_turkey_today_has_events():
    env = make_env()
    await link_both(env.api)
    events = await env.api.get_today(ARTEM_TG, "t-turkey")
    ids = {e.id for e in events}
    assert len(events) >= 3 and "e-tr-transfer" in ids


async def test_minsk_today_is_empty():
    env = make_env()
    await link_both(env.api)
    events = await env.api.get_today(ARTEM_TG, "t-minsk")
    assert events == []


async def test_kazan_next_event():
    env = make_env()
    await link_both(env.api)
    nxt = await env.api.get_next_event(ARTEM_TG, "t-kazan")
    assert nxt is not None and nxt.id == "e-kz-train"


async def test_finished_trip_has_no_next():
    env = make_env()
    await link_both(env.api)
    assert await env.api.get_next_event(ARTEM_TG, "t-tbilisi") is None


async def test_event_line_respects_timezone():
    env = make_env()
    await link_both(env.api)
    nxt = await env.api.get_next_event(ARTEM_TG, "t-kazan")
    line = event_line(nxt, "Europe/Moscow")
    assert "08:10" in line


async def test_events_belong_to_requested_trip():
    env = make_env()
    await link_both(env.api)
    for trip_id in ("t-turkey", "t-kazan"):
        for e in await env.api.get_today(ARTEM_TG, trip_id):
            assert e.trip_id == trip_id
