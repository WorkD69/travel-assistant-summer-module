"""MockTravelApiClient — полноценная демо-реализация backend с теми же проверками прав."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Optional

from app.schemas.models import (
    AssistantContext, BotUser, DocumentDownload, LinkResult, NotificationEvent, NotificationPreferences,
    OrganizerMessage, SosTicket, Trip, TripDocument, TripEvent,
)
from app.services.travel_api.base import TravelApiClient
from app.services.travel_api.errors import (
    AccessDeniedError, ApiValidationError, LinkConflictError, LinkTokenExpiredError,
    LinkTokenInvalidError, LinkTokenUsedError, NotFoundError, NotLinkedError, RateLimitedError,
)
from app.services.security.rate_limiter import SlidingWindowRateLimiter
from app.utils.timezones import safe_zoneinfo
from mock_backend.data import Membership, MockDataset, MockTrip, build_dataset


class MockTravelApiClient(TravelApiClient):
    def __init__(self, state, dataset: MockDataset | None = None,
                 now_factory: Callable[[], datetime] | None = None) -> None:
        self._state = state
        self._now = now_factory or (lambda: datetime.now(timezone.utc))
        self._data = dataset or build_dataset(self._now())
        self._sos_rate = SlidingWindowRateLimiter(max_calls=3, window_seconds=600)
        self._sos_by_idempotency: dict[str, SosTicket] = {}
        self._pending: list[NotificationEvent] = []
        self._failed_attempts: dict[str, int] = {}

    # ------------------------------------------------------------- привязка
    async def consume_link_token(self, telegram_user_id: int, token: str) -> LinkResult:
        rec = self._data.link_tokens.get(token)
        if rec is None:
            raise LinkTokenInvalidError()
        if rec.used:
            raise LinkTokenUsedError()
        if rec.expires_at < self._now():
            raise LinkTokenExpiredError()
        existing = await self._state.find_telegram_by_site_user(rec.site_user_id)
        if existing and telegram_user_id not in existing:
            raise LinkConflictError()
        relinked = (await self._state.get_link(telegram_user_id)) == rec.site_user_id
        rec.used = True  # одноразовость; открытый токен больше не принимается
        await self._state.set_link(telegram_user_id, rec.site_user_id)
        user = self._data.users[rec.site_user_id]
        return LinkResult(site_user_id=user.id, name=user.name, relinked=relinked)

    async def unlink(self, telegram_user_id: int) -> None:
        await self._require_user(telegram_user_id)
        await self._state.delete_link(telegram_user_id)
        await self._state.clear_active_trip(telegram_user_id)

    async def get_me(self, telegram_user_id: int) -> BotUser:
        user_id = await self._require_user(telegram_user_id)
        user = self._data.users[user_id]
        active = await self._state.get_active_trip(telegram_user_id)
        return BotUser(site_user_id=user.id, name=user.name, email=user.email,
                       active_trip_id=active)

    # ------------------------------------------------------------- доступ
    async def _require_user(self, telegram_user_id: int) -> str:
        user_id = await self._state.get_link(telegram_user_id)
        if not user_id:
            raise NotLinkedError()
        return user_id

    def _membership(self, user_id: str, trip_id: str) -> Optional[Membership]:
        for m in self._data.memberships:
            if m.trip_id == trip_id and m.user_id == user_id:
                return m
        return None

    def _require_member(self, user_id: str, trip_id: str,
                        allow_invited: bool = False) -> tuple[MockTrip, Membership]:
        trip = self._data.trips.get(trip_id)
        if trip is None:
            raise NotFoundError("Поездка не найдена.")
        m = self._membership(user_id, trip_id)
        if m is None:
            raise AccessDeniedError("Эта поездка вам недоступна.")
        if m.status == "revoked":
            raise AccessDeniedError("Доступ к поездке отозван.")
        if m.status == "invited" and not allow_invited:
            raise AccessDeniedError("Сначала примите приглашение на сайте.")
        if trip.status == "draft" and m.role != "organizer":
            raise NotFoundError("Поездка не найдена.")
        return trip, m

    def _trip_model(self, trip: MockTrip, m: Membership) -> Trip:
        return Trip(
            id=trip.id, title=trip.title, route=trip.route,
            date_start=trip.date_start.date(), date_end=trip.date_end.date(),
            timezone=trip.timezone, status=trip.status,
            role=m.role, membership_status=m.status,
        )

    # ------------------------------------------------------------- поездки
    async def get_trips(self, telegram_user_id: int) -> list[Trip]:
        user_id = await self._require_user(telegram_user_id)
        result = []
        for m in self._data.memberships:
            if m.user_id != user_id or m.status == "revoked":
                continue
            trip = self._data.trips[m.trip_id]
            if trip.status == "finished":
                continue
            if trip.status == "draft" and m.role != "organizer":
                continue
            result.append(self._trip_model(trip, m))
        return sorted(result, key=lambda t: t.date_start)

    async def get_trips_history(self, telegram_user_id: int) -> list[Trip]:
        user_id = await self._require_user(telegram_user_id)
        result = [
            self._trip_model(self._data.trips[m.trip_id], m)
            for m in self._data.memberships
            if m.user_id == user_id and m.status != "revoked"
            and self._data.trips[m.trip_id].status == "finished"
        ]
        return sorted(result, key=lambda t: t.date_start, reverse=True)

    async def get_trip(self, telegram_user_id: int, trip_id: str) -> Trip:
        user_id = await self._require_user(telegram_user_id)
        trip, m = self._require_member(user_id, trip_id, allow_invited=True)
        return self._trip_model(trip, m)

    async def select_active_trip(self, telegram_user_id: int, trip_id: str) -> None:
        user_id = await self._require_user(telegram_user_id)
        trip, _ = self._require_member(user_id, trip_id)
        if trip.status == "finished":
            raise ApiValidationError("Завершённую поездку нельзя выбрать активной.")
        await self._state.set_active_trip(telegram_user_id, trip_id)

    # ------------------------------------------------------------- события
    async def get_today(self, telegram_user_id: int, trip_id: str) -> list[TripEvent]:
        user_id = await self._require_user(telegram_user_id)
        trip, _ = self._require_member(user_id, trip_id)
        tz = safe_zoneinfo(trip.timezone)
        today_local = self._now().astimezone(tz).date()
        events = [
            e for e in self._data.events.values()
            if e.trip_id == trip_id and e.starts_at.astimezone(tz).date() == today_local
        ]
        return sorted(events, key=lambda e: e.starts_at)

    async def get_next_event(self, telegram_user_id: int, trip_id: str) -> Optional[TripEvent]:
        user_id = await self._require_user(telegram_user_id)
        self._require_member(user_id, trip_id)
        now = self._now()
        future = [
            e for e in self._data.events.values()
            if e.trip_id == trip_id and e.starts_at > now and e.status != "cancelled"
        ]
        return min(future, key=lambda e: e.starts_at) if future else None

    # ------------------------------------------------------------- документы
    def _doc_allowed(self, doc: TripDocument, user_id: str, role: str) -> bool:
        if doc.revoked or doc.deleted:
            return False
        if doc.visibility == "all":
            return True
        if doc.visibility == "organizer_only":
            return role == "organizer"
        if doc.visibility == "personal":
            return doc.owner_user_id == user_id
        return False

    async def get_documents(self, telegram_user_id: int, trip_id: str) -> list[TripDocument]:
        user_id = await self._require_user(telegram_user_id)
        _, m = self._require_member(user_id, trip_id)
        docs = [
            d for d in self._data.documents.values()
            if d.trip_id == trip_id and self._doc_allowed(d, user_id, m.role)
        ]
        return sorted(docs, key=lambda d: d.uploaded_at, reverse=True)

    async def get_document_download(
        self, telegram_user_id: int, document_id: str
    ) -> DocumentDownload:
        user_id = await self._require_user(telegram_user_id)
        doc = self._data.documents.get(document_id)
        if doc is None or doc.deleted or doc.revoked:
            raise NotFoundError("Документ не найден.")
        _, m = self._require_member(user_id, doc.trip_id)
        if not self._doc_allowed(doc, user_id, m.role):
            raise AccessDeniedError("Этот документ вам недоступен.")
        filenames = {
            "d-tickets": "demo-itinerary.pdf",
            "d-hotel": "demo-hotel-voucher.pdf",
            "d-insurance-list": "demo-insurance.pdf",
            "d-anna-passport": "demo-personal-document.pdf",
            "d-artem-passport": "demo-personal-document.pdf",
            "d-kazan-train": "demo-itinerary.pdf",
            "d-tbilisi-hotel": "demo-hotel-voucher.pdf",
        }
        filename = filenames.get(doc.id, "demo-itinerary.pdf")
        project_root = Path(__file__).resolve().parents[3]
        return DocumentDownload(
            kind="file",
            location=str(project_root / "mock_backend" / "files" / filename),
            filename=filename,
            title=doc.title,
        )

    # ------------------------------------------------------------- сообщения
    async def get_messages(self, telegram_user_id: int, trip_id: str) -> list[OrganizerMessage]:
        user_id = await self._require_user(telegram_user_id)
        self._require_member(user_id, trip_id)
        msgs = [
            m for m in self._data.messages.values()
            if m.trip_id == trip_id and m.status == "published" and m.audience == "participants"
        ]
        return sorted(msgs, key=lambda m: m.created_at, reverse=True)

    # ------------------------------------------------------------- SOS
    async def create_sos(self, telegram_user_id: int, trip_id: str, segment_id: Optional[str],
                         category: str, description: str, idempotency_key: str) -> SosTicket:
        user_id = await self._require_user(telegram_user_id)
        trip, m = self._require_member(user_id, trip_id)
        if m.role == "viewer":
            raise AccessDeniedError("Роль наблюдателя не позволяет отправлять SOS.")
        if trip.status == "finished":
            raise ApiValidationError("Поездка завершена — SOS недоступен.")
        if not description or not description.strip():
            raise ApiValidationError("Опишите проблему текстом.")
        if idempotency_key in self._sos_by_idempotency:
            return self._sos_by_idempotency[idempotency_key]
        if not self._sos_rate.allow(f"sos:{user_id}"):
            raise RateLimitedError("Слишком много SOS подряд. Подождите несколько минут.")
        number = f"SOS-{self._data.sos_counter}"
        ticket_id = f"s-{self._data.sos_counter}"
        self._data.sos_counter += 1
        segment_title = None
        if segment_id:
            ev = self._data.events.get(segment_id)
            segment_title = ev.title if ev else None
        ticket = SosTicket(
            id=ticket_id, number=number, trip_id=trip_id, author_user_id=user_id,
            category=category, description=description.strip(), status="new",
            created_at=self._now(), segment_id=segment_id, segment_title=segment_title,
        )
        self._data.sos[ticket.id] = ticket
        self._sos_by_idempotency[idempotency_key] = ticket
        await self._notify_organizers(ticket)
        return ticket

    async def _notify_organizers(self, ticket: SosTicket) -> None:
        trip = self._data.trips[ticket.trip_id]
        for m in self._data.memberships:
            if (m.trip_id != ticket.trip_id or m.role != "organizer"
                    or m.status != "member" or m.user_id == ticket.author_user_id):
                continue
            for tg_id in await self._state.find_telegram_by_site_user(m.user_id):
                self._pending.append(NotificationEvent(
                    id=f"n-sos-{ticket.id}-{tg_id}",
                    event_id=f"sos-created-{ticket.id}-{tg_id}",
                    type="sos_received", recipient_telegram_id=tg_id,
                    trip_id=ticket.trip_id, trip_title=trip.title,
                    title="🆘 Получен SOS",
                    what_changed=f"{ticket.number}: {ticket.description[:100]}",
                    occurred_at=self._now(), source="бот",
                    sos_id=ticket.id, deep_link_target="sos",
                ))

    async def get_my_sos(self, telegram_user_id: int, trip_id: str) -> list[SosTicket]:
        user_id = await self._require_user(telegram_user_id)
        self._require_member(user_id, trip_id)
        own = [s for s in self._data.sos.values()
               if s.trip_id == trip_id and s.author_user_id == user_id]
        return sorted(own, key=lambda s: s.created_at, reverse=True)

    async def get_sos(self, telegram_user_id: int, sos_id: str) -> SosTicket:
        user_id = await self._require_user(telegram_user_id)
        ticket = self._data.sos.get(sos_id)
        if ticket is None:
            raise NotFoundError("SOS не найден.")
        if ticket.author_user_id != user_id:
            raise AccessDeniedError("Чужие SOS недоступны в боте.")
        return ticket

    # ------------------------------------------------------------- настройки
    async def get_notification_preferences(self, telegram_user_id: int) -> NotificationPreferences:
        await self._require_user(telegram_user_id)
        return await self._state.get_preferences(telegram_user_id)

    async def update_notification_preferences(self, telegram_user_id: int,
                                              updates: dict) -> NotificationPreferences:
        await self._require_user(telegram_user_id)
        prefs = await self._state.get_preferences(telegram_user_id)
        allowed = set(NotificationPreferences.model_fields)
        bad = set(updates) - allowed
        if bad:
            raise ApiValidationError(f"Неизвестные настройки: {', '.join(sorted(bad))}")
        new_prefs = prefs.model_copy(update=updates)
        await self._state.set_preferences(telegram_user_id, new_prefs)
        return new_prefs

    # ------------------------------------------------------------- очередь
    async def get_pending_notifications(self, limit: int = 50) -> list[NotificationEvent]:
        return list(self._pending[:limit])

    async def confirm_notification_delivered(self, notification_id: str) -> None:
        self._pending = [n for n in self._pending if n.id != notification_id]

    async def mark_notification_failed(self, notification_id: str, reason: str = "") -> None:
        attempts = self._failed_attempts.get(notification_id, 0) + 1
        self._failed_attempts[notification_id] = attempts
        if attempts >= 5:
            self._pending = [n for n in self._pending if n.id != notification_id]

    # ------------------------------------------------------------- AI-контекст
    async def get_assistant_context(self, telegram_user_id: int, trip_id: str) -> AssistantContext:
        user_id = await self._require_user(telegram_user_id)
        trip, m = self._require_member(user_id, trip_id)
        cutoff = self._now() - timedelta(hours=12)
        events = sorted(
            (e for e in self._data.events.values()
             if e.trip_id == trip_id and e.starts_at >= cutoff),
            key=lambda e: e.starts_at,
        )
        return AssistantContext(
            trip=self._trip_model(trip, m),
            events=events,
            documents=await self.get_documents(telegram_user_id, trip_id),
            messages=await self.get_messages(telegram_user_id, trip_id),
            own_sos=await self.get_my_sos(telegram_user_id, trip_id),
            recent_changes=list(self._data.recent_changes.get(trip_id, [])),
        )

    # ------------------------------------------------------------- /demo
    async def simulate_event(self, kind: str, telegram_user_id: int) -> NotificationEvent:
        await self._require_user(telegram_user_id)
        presets = {
            "approaching": ("segment_reminder", "⏰ Скоро трансфер",
                            "Трансфер в отель — через 1 час", None, None, "trip"),
            "time_change": ("time_change", "🕒 Изменено время трансфера",
                            "Время трансфера в отель изменено", "13:00", "13:40", "monitoring"),
            "gate_change": ("gate_change", "🚪 Изменён выход на посадку",
                            "Рейс домой TK-413: новый выход", "B7", "C2", "monitoring"),
            "delay": ("delay", "⏳ Задержка рейса",
                      "Рейс домой TK-413 задержан", "16:20", "17:05", "monitoring"),
            "cancellation": ("cancellation", "❌ Отмена события",
                             "Приветственный ужин отменён", None, None, "trip"),
            "transfer_change": ("transfer_change", "🚐 Изменение трансфера",
                                "Назначен другой автомобиль", "Седан", "Минивэн", "monitoring"),
            "hotel_change": ("hotel_change", "🏨 Изменение отеля",
                             "Изменён номер бронирования", None, "Deluxe 412", "trip"),
            "new_document": ("new_document", "📄 Новый документ",
                             "Добавлен документ «Страховка группы»", None, None, "documents"),
            "invitation": ("trip_invitation", "✉️ Приглашение в поездку",
                           "Вас пригласили в поездку «Минск с друзьями»", None, None, "home"),
            "sos_status": ("sos_status_change", "🆘 Статус SOS обновлён",
                           "SOS-100: статус изменён", "в работе", "решён", "sos"),
            "violation": ("violation_confirmed", "⚠️ Подтверждено нарушение",
                          "Организатор подтвердил нарушение по сегменту «Трансфер в отель»",
                          None, None, "monitoring"),
            "plan_b": ("plan_b_published", "🅱️ Опубликован План Б",
                       "Организатор опубликовал План Б по трансферу", None, None, "messages"),
            "organizer_message": ("organizer_message", "💬 Сообщение организатора",
                                  "Новое сообщение: «Собираемся в лобби в 12:40»", None, None, "messages"),
        }
        preset = presets.get(kind)
        if preset is None:
            raise ApiValidationError("Неизвестный тип симуляции.")
        ntype, title, what, old, new, target = preset
        trip_id = "t-minsk" if kind == "invitation" else "t-turkey"
        trip = self._data.trips[trip_id]
        sos_id = "s-100" if kind == "sos_status" else None

        if kind == "time_change":
            ev = self._data.events["e-tr-transfer"]
            self._data.events["e-tr-transfer"] = ev.model_copy(update={
                "starts_at": ev.starts_at + timedelta(minutes=40), "status": "changed",
            })
            self._data.recent_changes.setdefault("t-turkey", []).append(
                "Трансфер в отель перенесён на 13:40")
        if kind == "sos_status" and "s-100" in self._data.sos:
            self._data.sos["s-100"] = self._data.sos["s-100"].model_copy(
                update={"status": "resolved"})

        event = NotificationEvent(
            id=f"n-demo-{uuid.uuid4().hex[:10]}",
            event_id=f"demo-{kind}-{uuid.uuid4().hex[:10]}",
            type=ntype, recipient_telegram_id=telegram_user_id,
            trip_id=trip_id, trip_title=trip.title, title=title,
            what_changed=what, old_value=old, new_value=new,
            occurred_at=self._now(), source="демо-симуляция",
            sos_id=sos_id, deep_link_target=target,
        )
        self._pending.append(event)
        return event
