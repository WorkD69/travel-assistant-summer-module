"""Non-polling live contract check against the isolated B2 staging backend."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx

from app.services.travel_api.errors import (
    AccessDeniedError,
    NotLinkedError,
    NotFoundError,
)
from app.services.travel_api.http_client import HttpTravelApiClient


EXPECTED_BASE = (
    "https://travel-assistant-teammate-backend-b2-staging-staging-b2.up.railway.app"
)
EXPECTED_BOT = "travel_assistent10_bot"
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def ensure(condition: bool, label: str) -> None:
    if not condition:
        raise AssertionError(label)


def fingerprint(value: object) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:12]


async def expect_domain_error(awaitable, expected_error, label: str) -> None:
    try:
        await awaitable
    except expected_error:
        return
    raise AssertionError(label)


async def main() -> None:
    base_url = os.environ.get("B2_BASE_URL", "").rstrip("/")
    service_token = os.environ.get("BOT_SERVICE_TOKEN", "")
    ensure(base_url == EXPECTED_BASE, "isolated B2 URL guard failed")
    ensure(len(service_token) >= 32, "staging service token is unavailable")

    checks: list[str] = []
    async with httpx.AsyncClient(base_url=base_url, timeout=120) as site:
        health = await site.get("/api/health")
        ensure(health.status_code == 200, "health status")
        health_body = health.json()
        ensure(health_body.get("ok") is True, "health ok")
        ensure(health_body.get("ai") is True, "health ai")
        checks.append("health-ai")

        forbidden = await site.get(
            "/api/bot/notifications/pending",
            headers={"Authorization": "Bearer deliberately-invalid-service-token"},
        )
        ensure(forbidden.status_code == 403, "invalid service token must be 403")
        ensure(forbidden.json().get("error", {}).get("code") == "access_denied", "403 envelope")

        missing_identity = await site.get(
            "/api/bot/me",
            headers={"Authorization": f"Bearer {service_token}"},
        )
        ensure(missing_identity.status_code == 422, "missing Telegram identity must be 422")
        ensure(
            missing_identity.json().get("error", {}).get("code") == "validation_error",
            "422 envelope",
        )

        unlinked_id = 8_100_000_000 + secrets.randbelow(100_000_000)
        unlinked = await site.get(
            "/api/bot/me",
            headers={
                "Authorization": f"Bearer {service_token}",
                "X-Telegram-User-Id": str(unlinked_id),
            },
        )
        ensure(unlinked.status_code == 401, "unlinked Telegram identity must be 401")
        ensure(unlinked.json().get("error", {}).get("code") == "not_linked", "401 envelope")

        invalid_link = await site.post(
            "/api/integrations/telegram/link-token/consume",
            headers={
                "Authorization": f"Bearer {service_token}",
                "X-Telegram-User-Id": str(unlinked_id),
            },
            json={"token": "definitely-invalid-link-token"},
        )
        ensure(invalid_link.status_code == 400, "invalid link token must be 400")
        ensure(
            invalid_link.json().get("error", {}).get("code") == "link_token_invalid",
            "400 envelope",
        )
        checks.append("400-401-403-errors")

        suffix = uuid4().hex
        owner_email = f"b2-contract-owner-{suffix}@example.test"
        other_email = f"b2-contract-other-{suffix}@example.test"
        password = secrets.token_urlsafe(32)

        async def register(email: str, name: str) -> tuple[str, str]:
            response = await site.post(
                "/api/auth/register",
                json={"email": email, "password": password, "name": name},
            )
            ensure(response.status_code == 201, f"register {name}")
            body = response.json()
            ensure(body.get("token") and body.get("user", {}).get("id"), f"register shape {name}")
            site.cookies.clear()
            return body["token"], body["user"]["id"]

        owner_jwt, owner_id = await register(owner_email, "B2 Contract Owner")
        other_jwt, _ = await register(other_email, "B2 Contract Other")
        owner_auth = {"Authorization": f"Bearer {owner_jwt}"}
        other_auth = {"Authorization": f"Bearer {other_jwt}"}
        owner_tg = 8_200_000_000 + secrets.randbelow(100_000_000)
        other_tg = 8_300_000_000 + secrets.randbelow(100_000_000)

        client = HttpTravelApiClient(base_url, service_token)
        other_client = HttpTravelApiClient(base_url, service_token)
        try:
            await expect_domain_error(
                client.get_me(owner_tg),
                NotLinkedError,
                "unlinked HttpTravelApiClient user was accepted",
            )

            link_response = await site.post(
                "/api/integrations/telegram/link-token",
                headers=owner_auth,
                json={},
            )
            ensure(link_response.status_code == 201, "link token create")
            link_body = link_response.json()
            ensure(link_body.get("token"), "link token shape")
            ensure(
                link_body.get("deep_link")
                == f"https://t.me/{EXPECTED_BOT}?start=link_{link_body['token']}",
                "deep link username or token",
            )
            ensure(link_body.get("bot_username") == EXPECTED_BOT, "bot username")
            linked = await client.consume_link_token(owner_tg, link_body["token"])
            ensure(
                str(linked.site_user_id) == str(owner_id),
                "link consume owner mismatch "
                f"(expected_type={type(owner_id).__name__}, "
                f"actual_type={type(linked.site_user_id).__name__}, "
                f"expected_hash={fingerprint(owner_id)}, "
                f"actual_hash={fingerprint(linked.site_user_id)})",
            )

            reused = await site.post(
                "/api/integrations/telegram/link-token/consume",
                headers={
                    "Authorization": f"Bearer {service_token}",
                    "X-Telegram-User-Id": str(owner_tg),
                },
                json={"token": link_body["token"]},
            )
            ensure(reused.status_code == 409, "link token must be one-time")
            ensure(reused.json().get("error", {}).get("code") == "link_token_used", "409 envelope")

            other_link = await site.post(
                "/api/integrations/telegram/link-token",
                headers=other_auth,
                json={},
            )
            ensure(other_link.status_code == 201, "other link token create")
            await other_client.consume_link_token(other_tg, other_link.json()["token"])
            checks.append("link-token-deep-link-single-use")

            ensure(await client.get_trips(owner_tg) == [], "new user trips must be empty")
            ensure(await client.get_trips_history(owner_tg) == [], "new user history must be empty")
            checks.append("empty-user")

            now_moscow = datetime.now(ZoneInfo("Europe/Moscow"))
            event_start = now_moscow + timedelta(minutes=5)
            event_end = event_start + timedelta(hours=1)
            trip_response = await site.post(
                "/api/trips",
                headers=owner_auth,
                json={
                    "title": "B2 Contract Trip",
                    "route": "Moscow - Saint Petersburg",
                    "startDate": now_moscow.astimezone(timezone.utc).isoformat(),
                    "endDate": (now_moscow + timedelta(days=2))
                    .astimezone(timezone.utc)
                    .isoformat(),
                    "status": "active",
                    "type": "group",
                },
            )
            ensure(trip_response.status_code == 201, "create active trip")
            trip_id = trip_response.json()["trip"]["id"]

            await expect_domain_error(
                other_client.get_trip(other_tg, trip_id),
                AccessDeniedError,
                "foreign trip was accepted",
            )
            invitation_response = await site.post(
                f"/api/trips/{trip_id}/invitations",
                headers=owner_auth,
                json={"email": other_email, "role": "participant", "expiresInDays": 1},
            )
            ensure(invitation_response.status_code == 201, "create participant invitation")
            invitation_token = invitation_response.json()["invitation"]["token"]
            invitation_accept = await site.post(
                f"/api/invitations/{invitation_token}/accept",
                headers=other_auth,
                json={},
            )
            ensure(invitation_accept.status_code == 200, "accept participant invitation")

            history_response = await site.post(
                "/api/trips",
                headers=owner_auth,
                json={
                    "title": "B2 Contract History",
                    "route": "Past - Route",
                    "startDate": (now_moscow - timedelta(days=5))
                    .astimezone(timezone.utc)
                    .isoformat(),
                    "endDate": (now_moscow - timedelta(days=4))
                    .astimezone(timezone.utc)
                    .isoformat(),
                    "status": "finished",
                },
            )
            ensure(history_response.status_code == 201, "create history trip")
            history_id = history_response.json()["trip"]["id"]

            segment = {
                "id": "segment-contract-1",
                "transportType": "train",
                "departurePlace": "Moscow",
                "arrivalPlace": "Kazan",
                "departureAt": event_start.astimezone(timezone.utc).isoformat(),
                "arrivalAt": event_end.astimezone(timezone.utc).isoformat(),
                "title": "Moscow - Kazan",
            }
            patch = await site.patch(
                f"/api/trips/{trip_id}",
                headers=owner_auth,
                json={"route": "Moscow - Kazan", "segments": [segment]},
            )
            ensure(patch.status_code == 200, "route and segment patch")

            trips = await client.get_trips(owner_tg)
            ensure(len(trips) == 1 and trips[0].id == trip_id, "one active trip")
            history = await client.get_trips_history(owner_tg)
            ensure(any(item.id == history_id for item in history), "history trip")
            detail = await client.get_trip(owner_tg, trip_id)
            ensure(detail.route == "Moscow - Kazan", "trip detail route")
            ensure(
                (await other_client.get_trip(other_tg, trip_id)).role == "participant",
                "participant trip access",
            )
            await client.select_active_trip(owner_tg, trip_id)
            ensure((await client.get_me(owner_tg)).active_trip_id == trip_id, "active trip")
            ensure(len(await client.get_today(owner_tg, trip_id)) == 1, "today event")
            ensure((await client.get_next_event(owner_tg, trip_id)) is not None, "next event")

            await expect_domain_error(
                client.get_trip(owner_tg, "missing-contract-trip"),
                NotFoundError,
                "missing trip was accepted",
            )
            checks.append("trips-history-detail-today-next-errors")

            message_response = await site.post(
                f"/api/trips/{trip_id}/messages",
                headers=owner_auth,
                json={
                    "kind": "announcement",
                    "status": "published",
                    "title": "Contract message",
                    "body": "Contract body",
                },
            )
            ensure(message_response.status_code == 201, "create message")
            messages = await client.get_messages(owner_tg, trip_id)
            ensure(any(message.title == "Contract message" for message in messages), "bot messages")

            upload_response = await site.post(
                f"/api/trips/{trip_id}/documents/upload",
                headers=owner_auth,
                files={"file": ("contract.png", PNG_1X1, "image/png")},
                data={"name": "Contract document", "visibility": "shared"},
            )
            ensure(upload_response.status_code == 201, "document upload")
            document_id = upload_response.json()["document"]["id"]
            documents = await client.get_documents(owner_tg, trip_id)
            ensure(any(document.id == document_id for document in documents), "bot documents")
            download = await client.get_document_download(owner_tg, document_id)
            ensure(download.kind == "file", "temporary document download kind")
            download_path = Path(download.location)
            try:
                ensure(download_path.read_bytes() == PNG_1X1, "temporary document bytes")
            finally:
                download_path.unlink(missing_ok=True)
            checks.append("messages-documents-temporary-download")

            preferences = await client.get_notification_preferences(owner_tg)
            updated_preferences = await client.update_notification_preferences(
                owner_tg,
                {"quiet_hours_enabled": not preferences.quiet_hours_enabled},
            )
            ensure(
                updated_preferences.quiet_hours_enabled != preferences.quiet_hours_enabled,
                "notification preferences patch",
            )

            sos_key = str(uuid4())
            sos = await client.create_sos(
                owner_tg,
                trip_id,
                None,
                "late",
                "B2 contract SOS",
                sos_key,
            )
            repeated_sos = await client.create_sos(
                owner_tg,
                trip_id,
                None,
                "late",
                "B2 contract SOS",
                sos_key,
            )
            ensure(repeated_sos.id == sos.id, "SOS idempotency")
            ensure(any(item.id == sos.id for item in await client.get_my_sos(owner_tg, trip_id)), "my SOS")
            ensure((await client.get_sos(owner_tg, sos.id)).id == sos.id, "SOS detail")
            checks.append("preferences-sos")

            context = await client.get_assistant_context(owner_tg, trip_id)
            ensure(context.trip.route == "Moscow - Kazan", "assistant route freshness")
            typed_changes = [
                change for change in context.recent_changes if not isinstance(change, str)
            ]
            ensure(typed_changes, "assistant typed recent changes")
            ensure(
                any(change.type == "route_changed" for change in typed_changes),
                "assistant route change",
            )
            ensure(context.weather, "assistant weather")
            ensure(
                all(weather.source == "Open-Meteo" for weather in context.weather),
                "assistant weather source",
            )
            checks.append("assistant-context")

            pending = await client.get_pending_notifications(limit=100)
            own_pending = [
                item
                for item in pending
                if item.trip_id == trip_id and item.recipient_telegram_id == other_tg
            ]
            ensure(len(own_pending) >= 2, "pending notifications")
            await client.confirm_notification_delivered(own_pending[0].id)
            await client.mark_notification_failed(own_pending[1].id, "contract-test")
            checks.append("pending-delivered-failed")

            await client.unlink(owner_tg)
            await expect_domain_error(
                client.get_me(owner_tg),
                NotLinkedError,
                "unlink did not remove Telegram link",
            )
            checks.append("unlink")
        finally:
            await client.close()
            await other_client.close()

    print(
        json.dumps(
            {
                "ok": True,
                "target": EXPECTED_BASE,
                "client": "HttpTravelApiClient",
                "polling_started": False,
                "checks": checks,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
