"""Real HttpTravelApiClient smoke against an isolated deployed backend.

Credentials and the backend URL are supplied through environment variables. The
script prints only counts and boolean checks, never tokens, passwords, or IDs.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid

import httpx

from app.services.travel_api.http_client import HttpTravelApiClient


BACKEND_URL = os.environ["TRAVEL_BACKEND_URL"].rstrip("/")
SERVICE_TOKEN = os.environ["TRAVEL_API_SERVICE_TOKEN"]
ORGANIZER_PASSWORD = os.environ["DEMO_ORGANIZER_PASSWORD"]
ORIGIN = os.environ.get(
    "TRAVEL_FRONTEND_ORIGIN",
    "https://travel-assistant-summer-module.vercel.app",
).rstrip("/")
TRIP_ID = "trip-turkey-2026"
TELEGRAM_USER_ID = 7_000_000_001


async def create_link_token() -> str:
    async with httpx.AsyncClient(base_url=BACKEND_URL, timeout=30) as site:
        login = await site.post(
            "/api/auth/login",
            headers={"Origin": ORIGIN},
            json={
                "email": "organizer@travel-assistant.demo",
                "password": ORGANIZER_PASSWORD,
                "remember": False,
            },
        )
        login.raise_for_status()
        response = await site.post(
            f"/api/site/trips/{TRIP_ID}/telegram-link-token",
            headers={"Origin": ORIGIN},
        )
        response.raise_for_status()
        return response.json()["token"]


async def main() -> None:
    token = await create_link_token()
    api = HttpTravelApiClient(BACKEND_URL, SERVICE_TOKEN, timeout_seconds=30)
    try:
        linked = await api.consume_link_token(TELEGRAM_USER_ID, token)
        me = await api.get_me(TELEGRAM_USER_ID)
        trips = await api.get_trips(TELEGRAM_USER_ID)
        history = await api.get_trips_history(TELEGRAM_USER_ID)
        trip = await api.get_trip(TELEGRAM_USER_ID, TRIP_ID)
        await api.select_active_trip(TELEGRAM_USER_ID, TRIP_ID)
        today = await api.get_today(TELEGRAM_USER_ID, TRIP_ID)
        next_event = await api.get_next_event(TELEGRAM_USER_ID, TRIP_ID)
        documents = await api.get_documents(TELEGRAM_USER_ID, TRIP_ID)
        download_ok = False
        if documents:
            download = await api.get_document_download(TELEGRAM_USER_ID, documents[0].id)
            async with httpx.AsyncClient(timeout=30) as http:
                response = await http.get(download.location)
                response.raise_for_status()
                download_ok = bool(response.content)
        messages = await api.get_messages(TELEGRAM_USER_ID, TRIP_ID)
        idempotency_key = f"consumer-smoke-{uuid.uuid4()}"
        sos = await api.create_sos(
            TELEGRAM_USER_ID,
            TRIP_ID,
            None,
            "need_help",
            "Automated isolated consumer smoke",
            idempotency_key,
        )
        duplicate = await api.create_sos(
            TELEGRAM_USER_ID,
            TRIP_ID,
            None,
            "need_help",
            "Automated isolated consumer smoke",
            idempotency_key,
        )
        own_sos = await api.get_my_sos(TELEGRAM_USER_ID, TRIP_ID)
        fetched_sos = await api.get_sos(TELEGRAM_USER_ID, sos.id)
        preferences = await api.get_notification_preferences(TELEGRAM_USER_ID)
        updated_preferences = await api.update_notification_preferences(
            TELEGRAM_USER_ID,
            {"quiet_hours_enabled": preferences.quiet_hours_enabled},
        )
        pending = await api.get_pending_notifications(limit=50)
        context = await api.get_assistant_context(TELEGRAM_USER_ID, TRIP_ID)

        checks = {
            "linked": linked.site_user_id == me.site_user_id,
            "tripReadable": trip.id == TRIP_ID and any(item.id == TRIP_ID for item in trips),
            "activeTripSelected": me.active_trip_id in (None, TRIP_ID),
            "nextEventParsed": next_event is None or next_event.id is not None,
            "documentDownload": download_ok,
            "sosIdempotent": sos.id == duplicate.id == fetched_sos.id,
            "preferencesParsed": updated_preferences.timezone == preferences.timezone,
            "assistantContextFiltered": context.trip.id == TRIP_ID,
        }
        if not all(checks.values()):
            raise RuntimeError("Consumer checks failed")
        print(json.dumps({
            "checks": checks,
            "counts": {
                "trips": len(trips),
                "history": len(history),
                "today": len(today),
                "documents": len(documents),
                "messages": len(messages),
                "ownSos": len(own_sos),
                "pendingNotifications": len(pending),
                "contextEvents": len(context.events),
            },
        }))
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
