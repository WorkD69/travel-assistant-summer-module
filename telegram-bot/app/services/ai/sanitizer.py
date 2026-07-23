"""Защита данных перед отправкой в Gemini: маскировка ПДн и минимальный контекст."""
from __future__ import annotations

import re
from app.schemas.models import AssistantContext
from app.utils.timezones import safe_zoneinfo

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PASSPORT_RE = re.compile(r"\b\d{4}\s?\d{6}\b")
_CARD_RE = re.compile(r"\b(?:\d[ -]?){13,19}\b")
_TOKEN_RE = re.compile(r"\b[A-Za-z0-9_-]{28,}\b")
_PHONE_RE = re.compile(r"\+?\d[\d\s()-]{8,}\d")


def sanitize_text(text: str) -> str:
    """Маскирует email, паспорта, карты, токены и телефоны."""
    masked = _EMAIL_RE.sub("[email скрыт]", text)
    masked = _PASSPORT_RE.sub("[скрыто]", masked)
    masked = _CARD_RE.sub("[скрыто]", masked)
    masked = _TOKEN_RE.sub("[скрыто]", masked)
    masked = _PHONE_RE.sub("[телефон скрыт]", masked)
    return masked


def build_safe_context(ctx: AssistantContext) -> str:
    """Минимальный текстовый контекст из УЖЕ отфильтрованных по роли данных."""
    tz = safe_zoneinfo(ctx.trip.timezone)
    lines: list[str] = [
        f"Поездка: {ctx.trip.title} ({ctx.trip.route}), "
        f"{ctx.trip.date_start} — {ctx.trip.date_end}, статус: {ctx.trip.status}, "
        f"ваша роль: {ctx.trip.role}, часовой пояс: {ctx.trip.timezone}.",
    ]
    if ctx.events:
        lines.append("События:")
        for e in ctx.events[:15]:
            local = e.starts_at.astimezone(tz).strftime("%d.%m %H:%M")
            place = f" ({e.departure_place} → {e.arrival_place})" if e.departure_place else ""
            lines.append(f"- {local} {e.title}{place}, статус: {e.status}. {e.note}".rstrip())
    if ctx.documents:
        lines.append("Доступные документы (только названия):")
        for d in ctx.documents[:15]:
            lines.append(f"- {d.title} ({d.doc_type})")
    if ctx.messages:
        lines.append("Сообщения организатора (опубликованные):")
        for m in ctx.messages[:10]:
            planb = " [План Б]" if m.is_plan_b else ""
            lines.append(f"- {m.title}{planb}: {m.text}")
    if ctx.own_sos:
        lines.append("Ваши SOS:")
        for s in ctx.own_sos[:5]:
            lines.append(f"- {s.number}: {s.category}, статус {s.status}")
    if ctx.recent_changes:
        lines.append("Последние изменения:")
        for c in ctx.recent_changes[:10]:
            lines.append(f"- {c}")
    if ctx.weather:
        lines.append("Погода по маршруту:")
        for weather in ctx.weather[:4]:
            temperature = (
                f"{weather.temperature:g} °C"
                if weather.temperature is not None
                else "температура недоступна"
            )
            wind = (
                f", ветер {weather.wind_speed:g} км/ч"
                if weather.wind_speed is not None
                else ""
            )
            lines.append(
                f"- {weather.city}: {temperature}, {weather.conditions}{wind}; "
                f"источник {weather.source}, обновлено {weather.updated_at.isoformat()}."
            )
    return sanitize_text("\n".join(lines))
