"""Тексты уведомлений, соответствие тип → настройка, тихие часы."""
from __future__ import annotations

from datetime import datetime, time
from typing import Optional
from app.schemas.models import NotificationEvent, NotificationPreferences
from app.utils.timezones import safe_zoneinfo

TYPE_TITLES: dict[str, str] = {
    "segment_reminder": "⏰ Приближается событие",
    "time_change": "🕒 Изменение времени",
    "gate_change": "🚪 Изменение выхода",
    "terminal_change": "🏬 Изменение терминала",
    "platform_change": "🚉 Изменение платформы",
    "departure_place_change": "📍 Изменение места отправления",
    "delay": "⏳ Задержка",
    "cancellation": "❌ Отмена",
    "transfer_change": "🚐 Изменение трансфера",
    "hotel_change": "🏨 Изменение отеля",
    "new_document": "📄 Новый документ",
    "trip_invitation": "✉️ Приглашение в поездку",
    "sos_status_change": "🆘 Статус вашего SOS изменён",
    "sos_received": "🆘 Получен SOS",
    "violation_confirmed": "⚠️ Подтверждено нарушение",
    "plan_b_published": "🅱️ Опубликован План Б",
    "organizer_message": "💬 Сообщение организатора",
    "route_changed": "🧭 Маршрут изменён",
    "dates_changed": "🗓 Даты поездки изменены",
    "segments_changed": "🔀 Сегменты маршрута изменены",
    "event_changed": "📌 Событие поездки изменено",
    "participant_changed": "👥 Состав участников изменён",
    "document_added": "📄 Добавлен документ",
    "plan_b_created": "🅱️ Создан Plan B",
    "plan_b_applied": "✅ Применён Plan B",
    "risk_detected": "⚠️ Обнаружен риск",
    "sos_created": "🆘 Получен SOS",
    "sos_status_changed": "🆘 Статус SOS изменён",
}

# Тип уведомления → поле настроек. None = отправлять всегда (SOS организатору).
PREF_KEY_BY_TYPE: dict[str, Optional[str]] = {
    "segment_reminder": "segment_reminders",
    "time_change": "time_changes",
    "gate_change": "departure_changes",
    "terminal_change": "departure_changes",
    "platform_change": "departure_changes",
    "departure_place_change": "departure_changes",
    "delay": "delays_cancellations",
    "cancellation": "delays_cancellations",
    "transfer_change": "transfer_changes",
    "hotel_change": "hotel_changes",
    "new_document": "new_documents",
    "trip_invitation": "invitations",
    "sos_status_change": "own_sos",
    "sos_received": None,
    "violation_confirmed": "violations",
    "plan_b_published": "plan_b",
    "organizer_message": "organizer_messages",
    "route_changed": "departure_changes",
    "dates_changed": "time_changes",
    "segments_changed": "transfer_changes",
    "event_changed": "segment_reminders",
    "participant_changed": "invitations",
    "document_added": "new_documents",
    "plan_b_created": "plan_b",
    "plan_b_applied": "plan_b",
    "risk_detected": "delays_cancellations",
    "sos_created": None,
    "sos_status_changed": "own_sos",
}


def format_notification(event: NotificationEvent) -> str:
    title = event.title or TYPE_TITLES.get(event.type, "🔔 Уведомление")
    lines = [title]
    if event.trip_title:
        lines.append(f"Поездка: {event.trip_title}")
    if event.what_changed:
        lines.append(event.what_changed)
    if event.old_value:
        lines.append(f"Было: {event.old_value}")
    if event.new_value:
        lines.append(f"Стало: {event.new_value}")
    lines.append(f"Время: {event.occurred_at.strftime('%d.%m.%Y %H:%M')} (UTC)")
    if event.source:
        lines.append(f"Источник: {event.source}")
    return "\n".join(lines)


def is_quiet_now(prefs: NotificationPreferences, now: datetime) -> bool:
    if not prefs.quiet_hours_enabled:
        return False
    tz = safe_zoneinfo(prefs.timezone)
    local = now.astimezone(tz).time()
    start = time.fromisoformat(prefs.quiet_hours_start)
    end = time.fromisoformat(prefs.quiet_hours_end)
    if start <= end:
        return start <= local <= end
    return local >= start or local <= end  # окно через полночь
