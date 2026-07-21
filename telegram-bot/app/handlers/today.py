"""/today — события выбранной поездки на сегодня (в timezone поездки)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import open_trip_kb, pick_trip_kb
from app.keyboards.reply import BTN_TODAY
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient
from app.utils.active_trip import resolve_active_trip
from app.utils.formatting import event_line

router = Router(name="today")

NO_EVENTS = "На сегодня запланированных событий нет."


async def send_today(message: Message, api: TravelApiClient, deep_links: DeepLinkService,
                     tg_id: int, trip_id: str) -> None:
    trip = await api.get_trip(tg_id, trip_id)
    events = await api.get_today(tg_id, trip_id)
    if not events:
        await message.answer(f"📅 {trip.title}\n{NO_EVENTS}",
                             reply_markup=open_trip_kb(deep_links.trip(trip_id)))
        return
    blocks = [f"📅 Сегодня — {trip.title}:"]
    blocks += [event_line(e, trip.timezone) for e in events]
    await message.answer("\n\n".join(blocks),
                         reply_markup=open_trip_kb(deep_links.trip(trip_id)))


@router.message(Command("today"))
@router.message(F.text == BTN_TODAY)
async def cmd_today(message: Message, api: TravelApiClient,
                    deep_links: DeepLinkService) -> None:
    trip, selectable = await resolve_active_trip(api, message.from_user.id)
    if trip is None:
        if not selectable:
            await message.answer("У вас пока нет доступных поездок.")
            return
        await message.answer("Выберите поездку:", reply_markup=pick_trip_kb(selectable, "today"))
        return
    await send_today(message, api, deep_links, message.from_user.id, trip.id)


@router.callback_query(F.data.startswith("pick:today:"))
async def cb_pick_today(callback: CallbackQuery, api: TravelApiClient,
                        deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    await api.select_active_trip(callback.from_user.id, trip_id)
    if callback.message:
        await send_today(callback.message, api, deep_links, callback.from_user.id, trip_id)
    await callback.answer()
