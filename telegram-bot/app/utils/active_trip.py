"""Помощник выбора активной поездки для команд /today /next /documents /sos /assistant."""
from __future__ import annotations

from typing import Optional

from app.schemas.models import Trip
from app.services.travel_api.base import TravelApiClient


async def resolve_active_trip(api: TravelApiClient,
                              telegram_user_id: int) -> tuple[Optional[Trip], list[Trip]]:
    """Возвращает (активная_поездка | None, доступные_поездки_для_выбора).

    - если активная уже выбрана и доступна — возвращаем её;
    - если доступна ровно одна поездка (не приглашение) — выбираем автоматически;
    - иначе активной нет, вызывающий показывает выбор из списка.
    """
    trips = await api.get_trips(telegram_user_id)
    selectable = [t for t in trips if t.membership_status == "member"]
    me = await api.get_me(telegram_user_id)
    if me.active_trip_id:
        for t in selectable:
            if t.id == me.active_trip_id:
                return t, selectable
    if len(selectable) == 1:
        await api.select_active_trip(telegram_user_id, selectable[0].id)
        return selectable[0], selectable
    return None, selectable
