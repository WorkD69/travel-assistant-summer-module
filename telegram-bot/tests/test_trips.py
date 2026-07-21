"""Тесты раздела TRIPS: списки, доступ, выбор активной."""
from __future__ import annotations

from app.services.travel_api.errors import AccessDeniedError, ApiValidationError
from tests.helpers import ANNA_TG, ARTEM_TG, expect, link_both, make_env


async def test_artem_sees_his_trips_without_finished():
    env = make_env()
    await link_both(env.api)
    ids = {t.id for t in await env.api.get_trips(ARTEM_TG)}
    assert {"t-turkey", "t-kazan", "t-draft"} <= ids
    assert "t-tbilisi" not in ids


async def test_anna_does_not_see_draft():
    env = make_env()
    await link_both(env.api)
    ids = {t.id for t in await env.api.get_trips(ANNA_TG)}
    assert "t-draft" not in ids


async def test_anna_sees_invitation():
    env = make_env()
    await link_both(env.api)
    trips = {t.id: t for t in await env.api.get_trips(ANNA_TG)}
    assert trips["t-minsk"].membership_status == "invited"


async def test_history_contains_finished_trip():
    env = make_env()
    await link_both(env.api)
    ids = {t.id for t in await env.api.get_trips_history(ANNA_TG)}
    assert "t-tbilisi" in ids


async def test_select_active_trip_persists():
    env = make_env()
    await link_both(env.api)
    await env.api.select_active_trip(ARTEM_TG, "t-turkey")
    me = await env.api.get_me(ARTEM_TG)
    assert me.active_trip_id == "t-turkey"


async def test_foreign_trip_denied():
    env = make_env()
    await link_both(env.api)
    await expect(AccessDeniedError, env.api.get_trip(ANNA_TG, "t-kazan"))


async def test_finished_trip_cannot_be_selected():
    env = make_env()
    await link_both(env.api)
    await expect(ApiValidationError,
                 env.api.select_active_trip(ARTEM_TG, "t-tbilisi"))
