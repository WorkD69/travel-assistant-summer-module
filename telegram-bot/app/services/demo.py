"""/demo — симуляция событий в mock-режиме. Только development."""
from __future__ import annotations

from app.services.travel_api.base import TravelApiClient
from app.services.travel_api.errors import AccessDeniedError, ApiValidationError

DEMO_KINDS: dict[str, str] = {
    "approaching": "⏰ Приближение события",
    "time_change": "🕒 Изменение времени",
    "gate_change": "🚪 Смена выхода",
    "delay": "⏳ Задержка",
    "cancellation": "❌ Отмена",
    "transfer_change": "🚐 Изменение трансфера",
    "hotel_change": "🏨 Изменение отеля",
    "new_document": "📄 Новый документ",
    "invitation": "✉️ Приглашение",
    "sos_status": "🆘 Статус SOS",
    "violation": "⚠️ Подтверждение нарушения",
    "plan_b": "🅱️ Публикация Плана Б",
    "organizer_message": "💬 Сообщение организатора",
}


class DemoService:
    def __init__(self, api: TravelApiClient, enabled: bool) -> None:
        self._api = api
        self._enabled = enabled

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def simulate(self, kind: str, telegram_user_id: int):
        if not self._enabled:
            raise AccessDeniedError("Команда /demo отключена в production.")
        simulate_event = getattr(self._api, "simulate_event", None)
        if simulate_event is None:
            raise ApiValidationError("Симуляция доступна только в mock-режиме.")
        return await simulate_event(kind, telegram_user_id)
