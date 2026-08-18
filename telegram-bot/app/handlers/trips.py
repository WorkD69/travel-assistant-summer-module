"""Read-only Telegram Companion V1 flow for canonical Trips."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import companion_trip_kb, companion_trips_kb
from app.keyboards.reply import BTN_TRIPS
from app.schemas.models import Trip
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient
from app.utils.formatting import companion_trip_summary

router = Router(name="trips")


def _companion_trips(trips: list[Trip]) -> list[Trip]:
    """Keep the list factual and compact; active canonical Trips are first."""
    available = [trip for trip in trips if trip.membership_status == "member"]
    return sorted(available, key=lambda trip: (trip.status != "active", trip.date_start, trip.title))


async def show_my_trips(message: Message, api: TravelApiClient, telegram_user_id: int) -> None:
    trips = _companion_trips(await api.get_trips(telegram_user_id))
    if not trips:
        await message.answer("Доступных поездок пока нет.")
        return
    await message.answer("Мои поездки:", reply_markup=companion_trips_kb(trips))


@router.message(Command("trips"))
@router.message(F.text == BTN_TRIPS)
async def cmd_trips(message: Message, api: TravelApiClient) -> None:
    await show_my_trips(message, api, message.from_user.id)


@router.callback_query(F.data == "v1:trips")
async def cb_trips(callback: CallbackQuery, api: TravelApiClient) -> None:
    trips = _companion_trips(await api.get_trips(callback.from_user.id))
    if callback.message:
        if not trips:
            await callback.message.edit_text("Доступных поездок пока нет.")
        else:
            await callback.message.edit_text("Мои поездки:", reply_markup=companion_trips_kb(trips))
    await callback.answer()


@router.callback_query(F.data.startswith("v1:trip:"))
async def cb_open_trip(callback: CallbackQuery, api: TravelApiClient,
                       deep_links: DeepLinkService) -> None:
    trip_id = callback.data.removeprefix("v1:trip:")
    trip = await api.get_trip(callback.from_user.id, trip_id)
    if callback.message:
        await callback.message.edit_text(
            companion_trip_summary(trip),
            reply_markup=companion_trip_kb(deep_links.trip(trip.id)),
        )
    await callback.answer()
