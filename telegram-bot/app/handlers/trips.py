"""🧳 Мои поездки: разделы, карточки, выбор активной, /history."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import trip_card_kb, trips_list_kb, trips_sections_kb
from app.keyboards.reply import BTN_TRIPS
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient
from app.utils.formatting import trip_card
from app.handlers.today import send_today
from app.handlers.next_event import send_next
from app.handlers.documents import send_documents

router = Router(name="trips")

SECTION_TITLES = {"active": "🟢 Активные поездки", "finished": "🏁 Завершённые поездки",
                  "invited": "✉️ Приглашения"}


@router.message(Command("trips"))
@router.message(F.text == BTN_TRIPS)
async def cmd_trips(message: Message) -> None:
    await message.answer("Выберите раздел:", reply_markup=trips_sections_kb())


@router.message(Command("history"))
async def cmd_history(message: Message, api: TravelApiClient) -> None:
    trips = await api.get_trips_history(message.from_user.id)
    if not trips:
        await message.answer("Завершённых поездок пока нет.")
        return
    await message.answer(SECTION_TITLES["finished"] + ":",
                         reply_markup=trips_list_kb(trips, "finished", 0))


async def _section_trips(api: TravelApiClient, tg_id: int, section: str):
    if section == "finished":
        return await api.get_trips_history(tg_id)
    trips = await api.get_trips(tg_id)
    if section == "invited":
        return [t for t in trips if t.membership_status == "invited"]
    return [t for t in trips if t.membership_status == "member"]


@router.callback_query(F.data == "trips:sections")
async def cb_sections(callback: CallbackQuery) -> None:
    if callback.message:
        await callback.message.edit_text("Выберите раздел:", reply_markup=trips_sections_kb())
    await callback.answer()


@router.callback_query(F.data.startswith("trips:section:"))
async def cb_section(callback: CallbackQuery, api: TravelApiClient) -> None:
    _, _, section, page_s = callback.data.split(":")
    trips = await _section_trips(api, callback.from_user.id, section)
    if not trips:
        empty = {"active": "Активных поездок нет.", "finished": "Завершённых поездок нет.",
                 "invited": "Приглашений нет."}[section]
        if callback.message:
            await callback.message.edit_text(empty, reply_markup=trips_sections_kb())
        await callback.answer()
        return
    if callback.message:
        await callback.message.edit_text(
            SECTION_TITLES[section] + ":",
            reply_markup=trips_list_kb(trips, section, int(page_s)))
    await callback.answer()


@router.callback_query(F.data.startswith("trips:open:"))
async def cb_open(callback: CallbackQuery, api: TravelApiClient,
                  deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    trip = await api.get_trip(callback.from_user.id, trip_id)
    if callback.message:
        await callback.message.edit_text(
            trip_card(trip), reply_markup=trip_card_kb(trip, deep_links.trip(trip.id)))
    await callback.answer()


@router.callback_query(F.data.startswith("trips:select:"))
async def cb_select(callback: CallbackQuery, api: TravelApiClient) -> None:
    trip_id = callback.data.split(":")[2]
    await api.select_active_trip(callback.from_user.id, trip_id)
    trip = await api.get_trip(callback.from_user.id, trip_id)
    if callback.message:
        await callback.message.answer(f"✅ Активная поездка: {trip.title}")
    await callback.answer("Выбрано")


@router.callback_query(F.data.startswith("trips:today:"))
async def cb_today(callback: CallbackQuery, api: TravelApiClient,
                   deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    if callback.message:
        await send_today(callback.message, api, deep_links, callback.from_user.id, trip_id)
    await callback.answer()


@router.callback_query(F.data.startswith("trips:next:"))
async def cb_next(callback: CallbackQuery, api: TravelApiClient,
                  deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    if callback.message:
        await send_next(callback.message, api, deep_links, callback.from_user.id, trip_id)
    await callback.answer()


@router.callback_query(F.data.startswith("trips:docs:"))
async def cb_docs(callback: CallbackQuery, api: TravelApiClient,
                  deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    if callback.message:
        await send_documents(callback.message, api, deep_links, callback.from_user.id, trip_id)
    await callback.answer()


@router.callback_query(F.data.startswith("trips:msgs:"))
async def cb_msgs(callback: CallbackQuery, api: TravelApiClient,
                  deep_links: DeepLinkService) -> None:
    trip_id = callback.data.split(":")[2]
    from app.handlers.notifications import send_messages

    if callback.message:
        await send_messages(callback.message, api, deep_links, callback.from_user.id, trip_id)
    await callback.answer()
