"""/next — ближайшее будущее событие с остатком времени."""
from __future__ import annotations

from datetime import datetime, timezone

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import open_trip_kb, pick_trip_kb
from app.keyboards.reply import BTN_NEXT
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient
from app.utils.active_trip import resolve_active_trip
from app.utils.formatting import event_line, time_left

router = Router(name="next")


async def send_next(message: Message, api: TravelApiClient, deep_links: DeepLinkService,
                    tg_id: int, trip_id: str) -> None:
    trip = await api.get_trip(tg_id, trip_id)
    event = await api.get_next_event(tg_id, trip_id)
    if event is None:
        await message.answer(f"⏭ {trip.title}\nБудущих событий не запланировано.",
                             reply_markup=open_trip_kb(deep_links.trip(trip_id)))
        return
    delta = (event.starts_at - datetime.now(timezone.utc)).total_seconds()
    lines = [f"⏭ Ближайшее событие — {trip.title}:",
             event_line(event, trip.timezone),
             f"⏳ Осталось: {time_left(max(delta, 0))}"]
    if event.document_title:
        lines.append(f"📄 Связанный документ: {event.document_title}")
    await message.answer("\n\n".join(lines),
                         reply_markup=open_trip_kb(deep_links.trip(trip_id)))


@router.message(Command("next"))
@router.message(F.text == BTN_NEXT)
async def cmd_next(message: Message, api: TravelApiClient,
                   deep_links: DeepLinkService) -> None:
    trip, selectable = await resolve_active_trip(api, message.from_user.id)
    if trip is None:
        if not selectable:
            await message.answer("У вас пока нет доступных поездок.")
            return
        await message.answer("Выберите поездку:", reply_markup=pick_trip_kb(selectable, "next"))
        return
    await send_next(message, api, deep_links, message.from_user.id, trip.id)


@router.callback_query(F.data.startswith("pick:next:"))
async def cb_pick_next(callback: CallbackQuery, api: TravelApiClient,
                       deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    await api.select_active_trip(callback.from_user.id, trip_id)
    if callback.message:
        await send_next(callback.message, api, deep_links, callback.from_user.id, trip_id)
    await callback.answer()
