"""Тесты SOS: полный сценарий, валидация, идемпотентность, rate limit, доступ."""
from __future__ import annotations

from app.services.travel_api.errors import (
    AccessDeniedError, ApiValidationError, RateLimitedError,
)
from tests.helpers import ANNA_TG, ARTEM_TG, expect, link_both, make_env


async def test_full_sos_flow():
    env = make_env()
    await link_both(env.api)
    ticket = await env.api.create_sos(
        ANNA_TG, trip_id="t-turkey", segment_id="e-tr-transfer",
        category="transport", description="Трансфер не приехал вовремя",
        idempotency_key="key-flow-1")
    assert ticket.number.startswith("SOS-")
    got = await env.api.get_sos(ANNA_TG, ticket.id)
    assert got.id == ticket.id
    mine = {s.id for s in await env.api.get_my_sos(ANNA_TG, "t-turkey")}
    assert ticket.id in mine and "s-100" in mine


async def test_empty_description_rejected():
    env = make_env()
    await link_both(env.api)
    await expect(ApiValidationError, env.api.create_sos(
        ANNA_TG, trip_id="t-turkey", segment_id=None,
        category="other", description="   ", idempotency_key="key-empty"))


async def test_double_send_is_idempotent():
    env = make_env()
    await link_both(env.api)
    first = await env.api.create_sos(
        ANNA_TG, trip_id="t-turkey", segment_id=None,
        category="late", description="Опаздываю на трансфер", idempotency_key="key-dup")
    second = await env.api.create_sos(
        ANNA_TG, trip_id="t-turkey", segment_id=None,
        category="late", description="Опаздываю на трансфер", idempotency_key="key-dup")
    assert first.id == second.id


async def test_rate_limit():
    env = make_env()
    await link_both(env.api)
    for i in range(3):
        await env.api.create_sos(
            ANNA_TG, trip_id="t-turkey", segment_id=None,
            category="other", description=f"Проблема номер {i}",
            idempotency_key=f"key-rate-{i}")
    await expect(RateLimitedError, env.api.create_sos(
        ANNA_TG, trip_id="t-turkey", segment_id=None,
        category="other", description="Четвёртая подряд",
        idempotency_key="key-rate-4"))


async def test_own_sos_status_available():
    env = make_env()
    await link_both(env.api)
    sos = await env.api.get_sos(ANNA_TG, "s-100")
    assert sos.status == "in_review"


async def test_foreign_sos_denied():
    env = make_env()
    await link_both(env.api)
    await expect(AccessDeniedError, env.api.get_sos(ARTEM_TG, "s-100"))


async def test_sos_notifies_organizer():
    env = make_env()
    await link_both(env.api)
    await env.api.create_sos(
        ANNA_TG, trip_id="t-turkey", segment_id=None,
        category="need_help", description="Нужна помощь у отеля",
        idempotency_key="key-notify")
    pending = await env.api.get_pending_notifications()
    assert any(e.type == "sos_received" and e.recipient_telegram_id == ARTEM_TG
               for e in pending)
