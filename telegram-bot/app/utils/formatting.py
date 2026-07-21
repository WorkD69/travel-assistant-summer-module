"""Форматирование карточек и строк для сообщений бота (без технических ID)."""
from __future__ import annotations

from app.utils.timezones import safe_zoneinfo

from app.schemas.models import SosTicket, Trip, TripDocument, TripEvent

EVENT_TYPE_LABELS = {
    "flight": "рейс",
    "train": "поезд",
    "bus": "автобус",
    "transfer": "трансфер",
    "checkin": "заселение",
    "checkout": "выселение",
    "activity": "мероприятие",
    "manual": "ручной сегмент",
}

EVENT_STATUS_LABELS = {
    "scheduled": "по плану",
    "changed": "изменено",
    "delayed": "задержка",
    "cancelled": "отменено",
    "completed": "завершено",
}

TRIP_STATUS_LABELS = {
    "draft": "черновик",
    "planned": "запланирована",
    "active": "идёт сейчас",
    "finished": "завершена",
}

ROLE_LABELS = {
    "organizer": "организатор",
    "participant": "участник",
    "viewer": "наблюдатель",
}

SOS_STATUS_LABELS = {
    "new": "новый",
    "in_review": "в работе",
    "resolved": "решён",
    "rejected": "отклонён",
}

SOS_CATEGORY_LABELS = {
    "late": "опаздываю",
    "lost_document": "потерял документ",
    "transport": "проблема с транспортом",
    "accommodation": "проблема с проживанием",
    "need_help": "нужна помощь",
    "other": "другое",
}

VISIBILITY_LABELS = {
    "all": "всем участникам",
    "organizer_only": "только организатору",
    "personal": "личный",
}


def event_line(event: TripEvent, tz_str: str) -> str:
    tz = safe_zoneinfo(tz_str)
    local = event.starts_at.astimezone(tz)
    parts = [
        f"{local.strftime('%H:%M')} — {EVENT_TYPE_LABELS.get(event.type, event.type)}: "
        f"{event.title}",
    ]
    if event.departure_place and event.arrival_place:
        parts.append(f"📍 {event.departure_place} → {event.arrival_place}")
    elif event.departure_place:
        parts.append(f"📍 Откуда: {event.departure_place}")
    elif event.arrival_place:
        parts.append(f"📍 Куда: {event.arrival_place}")
    parts.append(f"Статус: {EVENT_STATUS_LABELS.get(event.status, event.status)}")
    if event.note:
        parts.append(f"❗ {event.note}")
    return "\n".join(parts)


def trip_card(trip: Trip) -> str:
    lines = [f"🧳 {trip.title}"]
    if trip.route:
        lines.append(f"Маршрут: {trip.route}")
    lines.append(
        f"Даты: {trip.date_start.strftime('%d.%m.%Y')} — {trip.date_end.strftime('%d.%m.%Y')}")
    lines.append(f"Ваша роль: {ROLE_LABELS.get(trip.role, trip.role)}")
    lines.append(f"Статус: {TRIP_STATUS_LABELS.get(trip.status, trip.status)}")
    if trip.membership_status == "invited":
        lines.append("✉️ Вы приглашены — примите приглашение на сайте.")
    return "\n".join(lines)


def document_card(doc: TripDocument, trip_title: str = "") -> str:
    lines = [f"📄 {doc.title}", f"Тип: {doc.doc_type}"]
    if trip_title:
        lines.append(f"Поездка: {trip_title}")
    if doc.segment_title:
        lines.append(f"Сегмент: {doc.segment_title}")
    lines.append(f"Загружен: {doc.uploaded_at.strftime('%d.%m.%Y')}")
    lines.append(f"Видимость: {VISIBILITY_LABELS.get(doc.visibility, doc.visibility)}")
    return "\n".join(lines)


def sos_card(ticket: SosTicket) -> str:
    lines = [
        f"🆘 {ticket.number}",
        f"Проблема: {SOS_CATEGORY_LABELS.get(ticket.category, ticket.category)}",
        f"Описание: {ticket.description}",
        f"Статус: {SOS_STATUS_LABELS.get(ticket.status, ticket.status)}",
    ]
    if ticket.segment_title:
        lines.insert(1, f"Сегмент: {ticket.segment_title}")
    return "\n".join(lines)


def time_left(delta_seconds: float) -> str:
    minutes = int(delta_seconds // 60)
    if minutes < 60:
        return f"{minutes} мин"
    hours, mins = divmod(minutes, 60)
    if hours < 48:
        return f"{hours} ч {mins} мин"
    days, rem_h = divmod(hours, 24)
    return f"{days} дн. {rem_h} ч"
