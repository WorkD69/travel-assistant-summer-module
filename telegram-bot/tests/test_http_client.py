"""REST adapter contract tests using httpx.MockTransport only."""
from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.services.travel_api.errors import (
    AccessDeniedError,
    ApiUnavailableError,
    ApiValidationError,
    LinkConflictError,
    NotFoundError,
    RateLimitedError,
)
from app.services.travel_api.http_client import HttpTravelApiClient


def make_client(handler, *, get_retries=2) -> HttpTravelApiClient:
    return HttpTravelApiClient(
        base_url="https://backend.example.test",
        service_token="service-secret",
        timeout_seconds=0.1,
        get_retries=get_retries,
        transport=httpx.MockTransport(handler),
    )


async def test_link_consume_sends_service_and_telegram_identity_headers() -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, json={"site_user_id": "u-1", "name": "Анна"})

    client = make_client(handler)
    try:
        result = await client.consume_link_token(42, "one-time-token")
    finally:
        await client.close()

    request = seen["request"]
    assert request.headers["Authorization"] == "Bearer service-secret"
    assert request.headers["X-Telegram-User-Id"] == "42"
    assert request.url.path == "/api/integrations/telegram/link-token/consume"
    assert b'"token":"one-time-token"' in request.content
    assert result.site_user_id == "u-1"


async def test_paginated_trip_list_is_collected_for_handlers() -> None:
    cursors = []

    def trip(item_id: str) -> dict:
        return {
            "id": item_id,
            "title": item_id,
            "route": "A - B",
            "date_start": str(date(2026, 7, 20)),
            "date_end": str(date(2026, 7, 21)),
        }

    def handler(request: httpx.Request) -> httpx.Response:
        cursor = request.url.params.get("cursor")
        cursors.append(cursor)
        if cursor is None:
            return httpx.Response(200, json={"items": [trip("t-1")], "next_cursor": "p2"})
        return httpx.Response(200, json={"items": [trip("t-2")], "next_cursor": None})

    client = make_client(handler)
    try:
        trips = await client.get_trips(42)
    finally:
        await client.close()

    assert [trip.id for trip in trips] == ["t-1", "t-2"]
    assert cursors == [None, "p2"]


@pytest.mark.parametrize(
    ("status", "code", "expected"),
    [
        (401, "access_denied", AccessDeniedError),
        (403, "access_denied", AccessDeniedError),
        (404, "not_found", NotFoundError),
        (409, "link_conflict", LinkConflictError),
        (422, "validation_error", ApiValidationError),
        (429, "rate_limited", RateLimitedError),
        (500, "internal_error", ApiUnavailableError),
    ],
)
async def test_http_errors_are_mapped_to_safe_domain_errors(status, code, expected) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"code": code, "message_ru": "Безопасно"}})

    client = make_client(handler, get_retries=0)
    try:
        with pytest.raises(expected):
            await client.get_me(42)
    finally:
        await client.close()


async def test_non_json_503_is_safe_unavailable_error() -> None:
    client = make_client(
        lambda request: httpx.Response(503, text="proxy stack trace"),
        get_retries=0,
    )
    try:
        with pytest.raises(ApiUnavailableError):
            await client.get_me(42)
    finally:
        await client.close()


async def test_get_timeout_has_bounded_retries() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectTimeout("offline", request=request)

    client = make_client(handler, get_retries=2)
    try:
        with pytest.raises(ApiUnavailableError):
            await client.get_me(42)
    finally:
        await client.close()

    assert calls == 3


async def test_sos_uses_idempotency_header_and_is_not_retried() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.headers["Idempotency-Key"] == "idem-1"
        raise httpx.ConnectTimeout("offline", request=request)

    client = make_client(handler, get_retries=5)
    try:
        with pytest.raises(ApiUnavailableError):
            await client.create_sos(42, "t-1", None, "late", "Опаздываю", "idem-1")
    finally:
        await client.close()

    assert calls == 1


async def test_assistant_context_accepts_typed_recent_changes_from_b2() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/bot/trips/t-1/assistant-context"
        return httpx.Response(
            200,
            json={
                "trip": {
                    "id": "t-1",
                    "title": "Contract trip",
                    "route": "A - B",
                    "date_start": "2026-07-23",
                    "date_end": "2026-07-24",
                    "timezone": "Europe/Moscow",
                    "status": "active",
                    "role": "organizer",
                    "membership_status": "member",
                },
                "events": [],
                "documents": [],
                "messages": [],
                "own_sos": [],
                "recent_changes": [
                    {
                        "id": "change-1",
                        "type": "route_changed",
                        "oldValue": "\"A - B\"",
                        "newValue": "\"A - C\"",
                        "createdAt": "2026-07-23T10:00:00.000Z",
                    }
                ],
                "weather": [
                    {
                        "city": "Moscow",
                        "temperature": 22,
                        "conditions": "Clear",
                        "windSpeed": 3,
                        "updatedAt": "2026-07-23T10:00:00.000Z",
                        "source": "Open-Meteo",
                    }
                ],
            },
        )

    client = make_client(handler)
    try:
        context = await client.get_assistant_context(42, "t-1")
    finally:
        await client.close()

    assert context.recent_changes[0].type == "route_changed"
    assert context.recent_changes[0].created_at.isoformat().startswith(
        "2026-07-23T10:00:00"
    )
    assert context.weather[0].temperature == 22
    assert context.weather[0].source == "Open-Meteo"
