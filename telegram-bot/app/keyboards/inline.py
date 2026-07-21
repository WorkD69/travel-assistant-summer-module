"""Inline-клавиатуры контекстных действий (не более 2–3 кнопок в ряду)."""
from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.schemas.models import Trip, TripEvent
from app.utils.formatting import SOS_CATEGORY_LABELS


def _btn(text: str, callback_data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=callback_data)


def site_link_btn(text: str, url: str) -> InlineKeyboardButton:
    parsed = urlsplit(url)
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        trip_ids = parse_qs(parsed.query).get("tripId", [])
        callback_data = (
            f"local_site:trip:{trip_ids[0]}" if trip_ids else "local_site:home"
        )
        return _btn(text, callback_data)
    return InlineKeyboardButton(text=text, url=url)


def unlinked_start_kb(site_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [site_link_btn("🌐 Открыть сайт", site_url)],
        [_btn("❓ Как подключить", "help:link"), _btn("🆘 Помощь", "help:main")],
    ])


def trips_sections_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("🟢 Активные", "trips:section:active:0")],
        [_btn("🏁 Завершённые", "trips:section:finished:0"),
         _btn("✉️ Приглашения", "trips:section:invited:0")],
    ])


def trips_list_kb(trips: list[Trip], section: str, page: int,
                  page_size: int = 5) -> InlineKeyboardMarkup:
    start_i = page * page_size
    chunk = trips[start_i:start_i + page_size]
    rows = [[_btn(t.title, f"trips:open:{t.id}")] for t in chunk]
    nav = []
    if page > 0:
        nav.append(_btn("⬅️ Назад", f"trips:section:{section}:{page - 1}"))
    if start_i + page_size < len(trips):
        nav.append(_btn("➡️ Дальше", f"trips:section:{section}:{page + 1}"))
    if nav:
        rows.append(nav)
    rows.append([_btn("⬅️ К разделам", "trips:sections")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def trip_card_kb(trip: Trip, site_url: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if trip.status != "finished" and trip.membership_status == "member":
        rows.append([_btn("✅ Выбрать активной", f"trips:select:{trip.id}")])
    if trip.membership_status == "member":
        rows.append([_btn("📅 Сегодня", f"trips:today:{trip.id}"),
                     _btn("⏭ Ближайшее", f"trips:next:{trip.id}")],)
        rows.append([_btn("📄 Документы", f"trips:docs:{trip.id}"),
                     _btn("💬 Сообщения", f"trips:msgs:{trip.id}")])
    rows.append([site_link_btn("Открыть поездку", site_url)])
    rows.append([_btn("⬅️ К разделам", "trips:sections")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def pick_trip_kb(trips: list[Trip], action: str) -> InlineKeyboardMarkup:
    rows = [[_btn(t.title, f"pick:{action}:{t.id}")] for t in trips]
    rows.append([_btn("❌ Отмена", "cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def open_trip_kb(url: str, text: str = "Открыть поездку") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[site_link_btn(text, url)]])


def documents_kb(doc_ids_titles: list[tuple[str, str]], site_url: str) -> InlineKeyboardMarkup:
    rows = [[_btn(f"📥 {title}", f"doc:get:{doc_id}")] for doc_id, title in doc_ids_titles]
    rows.append([site_link_btn("Открыть документы на сайте", site_url)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


# ---------------------------------------------------------------- SOS

def sos_trips_kb(trips: list[Trip]) -> InlineKeyboardMarkup:
    rows = [[_btn(t.title, f"sos:trip:{t.id}")] for t in trips]
    rows.append([_btn("❌ Отмена", "cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def sos_segments_kb(events: list[TripEvent]) -> InlineKeyboardMarkup:
    rows = [[_btn(e.title, f"sos:seg:{e.id}")] for e in events[:8]]
    rows.append([_btn("🧳 Вся поездка", "sos:seg:all")])
    rows.append([_btn("❌ Отмена", "cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def sos_categories_kb() -> InlineKeyboardMarkup:
    items = list(SOS_CATEGORY_LABELS.items())
    rows = []
    for i in range(0, len(items), 2):
        rows.append([_btn(label.capitalize(), f"sos:cat:{key}")
                     for key, label in items[i:i + 2]])
    rows.append([_btn("❌ Отмена", "cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def sos_confirm_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("✅ Отправить SOS", "sos:confirm")],
        [_btn("❌ Отмена", "cancel")],
    ])


# ---------------------------------------------------------------- AI

def assistant_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("🚪 Завершить диалог", "ai:stop"),
         _btn("🧹 Очистить историю", "ai:clear")],
        [_btn("🔄 Сменить поездку", "ai:switch")],
    ])


# ---------------------------------------------------------------- настройки

PREF_LABELS: dict[str, str] = {
    "segment_reminders": "Напоминания о сегментах",
    "time_changes": "Изменения времени",
    "departure_changes": "Изменения места отправления",
    "delays_cancellations": "Задержки и отмены",
    "transfer_changes": "Изменения трансфера",
    "hotel_changes": "Изменения отеля",
    "new_documents": "Новые документы",
    "invitations": "Приглашения",
    "own_sos": "Собственные SOS",
    "violations": "Нарушения",
    "plan_b": "План Б",
    "organizer_messages": "Сообщения организатора",
}


def settings_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("🔔 Настройки уведомлений", "settings:prefs")],
        [_btn("🔓 Отвязать Telegram", "settings:unlink")],
    ])


def prefs_kb(prefs) -> InlineKeyboardMarkup:
    rows = []
    for key, label in PREF_LABELS.items():
        mark = "✅" if getattr(prefs, key, True) else "⬜"
        rows.append([_btn(f"{mark} {label}", f"pref:toggle:{key}")])
    quiet_mark = "✅" if prefs.quiet_hours_enabled else "⬜"
    rows.append([_btn(f"{quiet_mark} Тихие часы ({prefs.quiet_hours_start}–{prefs.quiet_hours_end})",
                      "pref:toggle:quiet_hours_enabled")])
    rows.append([_btn(f"🌍 Часовой пояс: {prefs.timezone}", "pref:tz")])
    rows.append([_btn("✅ Включить всё", "pref:all_on"),
                 _btn("⬜ Отключить всё", "pref:all_off")])
    rows.append([_btn("⬅️ Назад", "pref:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


TIMEZONES = ["Europe/Moscow", "Europe/Minsk", "Europe/Istanbul", "Asia/Tbilisi", "UTC"]


def timezones_kb() -> InlineKeyboardMarkup:
    rows = [[_btn(tz, f"pref:tz:{tz}")] for tz in TIMEZONES]
    rows.append([_btn("⬅️ Назад", "settings:prefs")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def unlink_confirm_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [_btn("✅ Да, отвязать", "unlink:confirm")],
        [_btn("❌ Отмена", "cancel")],
    ])


def demo_kb(kinds: dict[str, str]) -> InlineKeyboardMarkup:
    items = list(kinds.items())
    rows = []
    for i in range(0, len(items), 2):
        rows.append([_btn(label, f"demo:{key}") for key, label in items[i:i + 2]])
    return InlineKeyboardMarkup(inline_keyboard=rows)
