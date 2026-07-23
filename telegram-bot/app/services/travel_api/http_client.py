"""HttpTravelApiClient — реализация поверх REST API backend (httpx).

Соответствует docs/bot-api.openapi.yaml. Handlers не меняются при переключении режимов.
"""
from __future__ import annotations

import asyncio
import os
import re
import tempfile
from typing import Any, Optional

import httpx

from app.schemas.models import (
    AssistantContext, BotUser, DocumentDownload, LinkResult, NotificationEvent, NotificationPreferences,
    OrganizerMessage, SosTicket, Trip, TripDocument, TripEvent,
)
from app.services.travel_api.base import TravelApiClient
from app.services.travel_api.errors import ApiUnavailableError, error_from_code


class HttpTravelApiClient(TravelApiClient):
    def __init__(self, base_url: str, service_token: str, timeout_seconds: float = 15,
                 get_retries: int = 2,
                 transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={"Authorization": f"Bearer {service_token}"},
            transport=transport,
        )
        self._get_retries = get_retries

    async def close(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------- транспорт
    async def _request(self, method: str, path: str, telegram_user_id: int | None = None,
                       json_body: dict | None = None, headers: dict | None = None,
                       params: dict | None = None) -> Any:
        req_headers = dict(headers or {})
        if telegram_user_id is not None:
            req_headers["X-Telegram-User-Id"] = str(telegram_user_id)
        retries = self._get_retries if method.upper() == "GET" else 0  # retry только безопасных
        last_exc: Exception | None = None
        for attempt in range(retries + 1):
            try:
                resp = await self._client.request(
                    method, path, json=json_body, headers=req_headers, params=params)
                if resp.status_code == 204:
                    return None
                if resp.status_code >= 400:
                    try:
                        data = resp.json() if resp.content else {}
                    except ValueError as exc:
                        raise ApiUnavailableError(
                            detail=f"HTTP {resp.status_code}: invalid error payload"
                        ) from exc
                    err = (data or {}).get("error", {})
                    raise error_from_code(err.get("code", "internal_error"),
                                          err.get("message_ru"))
                try:
                    return resp.json() if resp.content else {}
                except ValueError as exc:
                    raise ApiUnavailableError(detail="invalid JSON response") from exc
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                if attempt < retries:
                    await asyncio.sleep(0.5 * (attempt + 1))
        raise ApiUnavailableError(detail=str(last_exc))

    async def _get_all_items(
        self,
        path: str,
        telegram_user_id: int,
        *,
        page_size: int = 100,
    ) -> list[dict]:
        items: list[dict] = []
        cursor: str | None = None
        seen_cursors: set[str] = set()
        for _ in range(100):
            params: dict[str, Any] = {"limit": page_size}
            if cursor:
                params["cursor"] = cursor
            data = await self._request(
                "GET", path, telegram_user_id, params=params
            )
            items.extend(data.get("items", []))
            cursor = data.get("next_cursor")
            if not cursor:
                return items
            if cursor in seen_cursors:
                raise ApiUnavailableError(detail="pagination cursor loop")
            seen_cursors.add(cursor)
        raise ApiUnavailableError(detail="pagination page limit exceeded")

    # ------------------------------------------------------------- привязка
    async def consume_link_token(self, telegram_user_id: int, token: str) -> LinkResult:
        data = await self._request("POST", "/api/integrations/telegram/link-token/consume",
                                   telegram_user_id, {"token": token})
        return LinkResult.model_validate(data)

    async def unlink(self, telegram_user_id: int) -> None:
        await self._request("DELETE", "/api/integrations/telegram", telegram_user_id)

    async def get_me(self, telegram_user_id: int) -> BotUser:
        return BotUser.model_validate(
            await self._request("GET", "/api/bot/me", telegram_user_id))

    # ------------------------------------------------------------- поездки
    async def get_trips(self, telegram_user_id: int) -> list[Trip]:
        items = await self._get_all_items("/api/bot/trips", telegram_user_id)
        return [Trip.model_validate(x) for x in items]

    async def get_trips_history(self, telegram_user_id: int) -> list[Trip]:
        items = await self._get_all_items(
            "/api/bot/trips/history", telegram_user_id
        )
        return [Trip.model_validate(x) for x in items]

    async def get_trip(self, telegram_user_id: int, trip_id: str) -> Trip:
        return Trip.model_validate(
            await self._request("GET", f"/api/bot/trips/{trip_id}", telegram_user_id))

    async def select_active_trip(self, telegram_user_id: int, trip_id: str) -> None:
        await self._request("POST", f"/api/bot/trips/{trip_id}/select-active", telegram_user_id)

    # ------------------------------------------------------------- события
    async def get_today(self, telegram_user_id: int, trip_id: str) -> list[TripEvent]:
        data = await self._request("GET", f"/api/bot/trips/{trip_id}/today", telegram_user_id)
        return [TripEvent.model_validate(x) for x in data.get("items", [])]

    async def get_next_event(self, telegram_user_id: int, trip_id: str) -> Optional[TripEvent]:
        data = await self._request("GET", f"/api/bot/trips/{trip_id}/next", telegram_user_id)
        event = data.get("event")
        return TripEvent.model_validate(event) if event else None

    # ------------------------------------------------------------- документы
    async def get_documents(self, telegram_user_id: int, trip_id: str) -> list[TripDocument]:
        items = await self._get_all_items(
            f"/api/bot/trips/{trip_id}/documents", telegram_user_id
        )
        return [TripDocument.model_validate(x) for x in items]

    async def get_document_download(
        self, telegram_user_id: int, document_id: str
    ) -> DocumentDownload:
        # 1) Ask the backend for a short-lived opaque download link.
        data = await self._request(
            "POST", f"/api/bot/documents/{document_id}/temporary-link", telegram_user_id)
        url = data["url"]
        filename = data.get("filename") or "document"
        title = data.get("title", "Документ поездки")
        # 2) Download the bytes and hand the handler a real file, so the bot can
        #    upload the actual document into the user's Telegram chat (a bare
        #    localhost link would not be reachable by Telegram servers).
        try:
            resp = await self._client.get(url)
            if resp.status_code >= 400 or not resp.content:
                raise ApiUnavailableError(detail=f"download HTTP {resp.status_code}")
            safe = re.sub(r"[^\w.\-]+", "_", filename, flags=re.UNICODE).strip("_") or "document"
            suffix = ""
            if "." in safe:
                suffix = safe[safe.rfind("."):][:16]
            fd, path = tempfile.mkstemp(prefix="tvl_doc_", suffix=suffix)
            try:
                with os.fdopen(fd, "wb") as fh:
                    fh.write(resp.content)
            except Exception:
                os.close(fd)
                raise
            return DocumentDownload(
                kind="file", location=path, filename=filename, title=title,
            )
        except (httpx.TimeoutException, httpx.TransportError, ApiUnavailableError):
            # Fallback: hand back the link if the byte download failed.
            return DocumentDownload(
                kind="url", location=url, filename=filename, title=title,
            )

    # ------------------------------------------------------------- сообщения
    async def get_messages(self, telegram_user_id: int, trip_id: str) -> list[OrganizerMessage]:
        items = await self._get_all_items(
            f"/api/bot/trips/{trip_id}/messages", telegram_user_id
        )
        return [OrganizerMessage.model_validate(x) for x in items]

    # ------------------------------------------------------------- SOS
    async def create_sos(self, telegram_user_id: int, trip_id: str, segment_id: Optional[str],
                         category: str, description: str, idempotency_key: str) -> SosTicket:
        data = await self._request(
            "POST", f"/api/bot/trips/{trip_id}/sos", telegram_user_id,
            {"segment_id": segment_id, "category": category, "description": description},
            headers={"Idempotency-Key": idempotency_key},
        )
        return SosTicket.model_validate(data)

    async def get_my_sos(self, telegram_user_id: int, trip_id: str) -> list[SosTicket]:
        items = await self._get_all_items(
            f"/api/bot/trips/{trip_id}/sos/mine", telegram_user_id
        )
        return [SosTicket.model_validate(x) for x in items]

    async def get_sos(self, telegram_user_id: int, sos_id: str) -> SosTicket:
        return SosTicket.model_validate(
            await self._request("GET", f"/api/bot/sos/{sos_id}", telegram_user_id))

    # ------------------------------------------------------------- настройки
    async def get_notification_preferences(self, telegram_user_id: int) -> NotificationPreferences:
        return NotificationPreferences.model_validate(
            await self._request("GET", "/api/bot/notification-preferences", telegram_user_id))

    async def update_notification_preferences(self, telegram_user_id: int,
                                              updates: dict) -> NotificationPreferences:
        return NotificationPreferences.model_validate(
            await self._request("PATCH", "/api/bot/notification-preferences",
                                telegram_user_id, updates))

    # ------------------------------------------------------------- очередь
    async def get_pending_notifications(self, limit: int = 50) -> list[NotificationEvent]:
        data = await self._request("GET", "/api/bot/notifications/pending",
                                   params={"limit": limit})
        return [NotificationEvent.model_validate(x) for x in data.get("items", [])]

    async def confirm_notification_delivered(self, notification_id: str) -> None:
        await self._request("POST", f"/api/bot/notifications/{notification_id}/delivered")

    async def mark_notification_failed(self, notification_id: str, reason: str = "") -> None:
        await self._request("POST", f"/api/bot/notifications/{notification_id}/failed",
                            json_body={"reason": reason})

    # ------------------------------------------------------------- AI
    async def get_assistant_context(self, telegram_user_id: int, trip_id: str) -> AssistantContext:
        return AssistantContext.model_validate(
            await self._request("GET", f"/api/bot/trips/{trip_id}/assistant-context",
                                telegram_user_id))
