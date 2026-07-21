"""🆘 SOS — FSM: поездка → сегмент → проблема → описание → предпросмотр → подтверждение."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import (
    open_trip_kb, sos_categories_kb, sos_confirm_kb, sos_segments_kb, sos_trips_kb,
)
from app.keyboards.reply import BTN_SOS, main_menu
from app.services.deep_links.service import DeepLinkService
from app.services.security.idempotency import new_idempotency_key
from app.services.travel_api.base import TravelApiClient
from app.states.sos import SosStates
from app.utils.formatting import SOS_CATEGORY_LABELS, sos_card

router = Router(name="sos")


@router.message(Command("sos"))
@router.message(F.text == BTN_SOS)
async def cmd_sos(message: Message, api: TravelApiClient, state: FSMContext) -> None:
    await state.clear()
    trips = [t for t in await api.get_trips(message.from_user.id)
             if t.membership_status == "member" and t.status != "finished"]
    if not trips:
        await message.answer("Нет поездок, для которых можно отправить SOS.")
        return
    await state.set_state(SosStates.choosing_trip)
    await message.answer("🆘 По какой поездке нужна помощь?",
                         reply_markup=sos_trips_kb(trips))


@router.callback_query(SosStates.choosing_trip, F.data.startswith("sos:trip:"))
async def cb_sos_trip(callback: CallbackQuery, api: TravelApiClient,
                      state: FSMContext) -> None:
    trip_id = callback.data.split(":")[2]
    trip = await api.get_trip(callback.from_user.id, trip_id)  # проверка доступа
    await state.update_data(trip_id=trip_id, trip_title=trip.title)
    events = await api.get_today(callback.from_user.id, trip_id)
    if not events:
        nxt = await api.get_next_event(callback.from_user.id, trip_id)
        events = [nxt] if nxt else []
    await state.set_state(SosStates.choosing_segment)
    if callback.message:
        await callback.message.edit_text("К какому сегменту относится проблема?",
                                         reply_markup=sos_segments_kb(events))
    await callback.answer()


@router.callback_query(SosStates.choosing_segment, F.data.startswith("sos:seg:"))
async def cb_sos_segment(callback: CallbackQuery, state: FSMContext) -> None:
    seg = callback.data.split(":")[2]
    await state.update_data(segment_id=None if seg == "all" else seg)
    await state.set_state(SosStates.choosing_category)
    if callback.message:
        await callback.message.edit_text("Что случилось?", reply_markup=sos_categories_kb())
    await callback.answer()


@router.callback_query(SosStates.choosing_category, F.data.startswith("sos:cat:"))
async def cb_sos_category(callback: CallbackQuery, state: FSMContext) -> None:
    category = callback.data.split(":")[2]
    await state.update_data(category=category)
    await state.set_state(SosStates.entering_description)
    if callback.message:
        await callback.message.edit_text(
            "Опишите проблему одним сообщением (или /cancel для отмены).")
    await callback.answer()


@router.message(SosStates.entering_description, F.text)
async def msg_sos_description(message: Message, state: FSMContext) -> None:
    description = (message.text or "").strip()
    if not description or description.startswith("/"):
        await message.answer("Опишите проблему текстом, пожалуйста.")
        return
    data = await state.get_data()
    await state.update_data(description=description,
                            idempotency_key=new_idempotency_key())
    await state.set_state(SosStates.confirming)
    preview = (
        "Проверьте SOS перед отправкой:\n\n"
        f"Поездка: {data.get('trip_title')}\n"
        f"Проблема: {SOS_CATEGORY_LABELS.get(data.get('category'), data.get('category'))}\n"
        f"Описание: {description}"
    )
    await message.answer(preview, reply_markup=sos_confirm_kb())


@router.callback_query(SosStates.confirming, F.data == "sos:confirm")
async def cb_sos_confirm(callback: CallbackQuery, api: TravelApiClient,
                         deep_links: DeepLinkService, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()  # защита от двойного нажатия: второй клик уже вне состояния
    ticket = await api.create_sos(
        callback.from_user.id,
        trip_id=data["trip_id"],
        segment_id=data.get("segment_id"),
        category=data["category"],
        description=data["description"],
        idempotency_key=data["idempotency_key"],
    )
    if callback.message:
        await callback.message.edit_text(
            "✅ SOS отправлен. Организатор получит уведомление.\n\n" + sos_card(ticket))
        await callback.message.answer(
            "Статус можно проверить командой /mysos или на сайте.",
            reply_markup=open_trip_kb(
                deep_links.sos(ticket.trip_id, ticket.id), "Открыть SOS на сайте"))
    await callback.answer()


@router.message(Command("mysos"))
async def cmd_my_sos(message: Message, api: TravelApiClient) -> None:
    me = await api.get_me(message.from_user.id)
    if not me.active_trip_id:
        await message.answer("Сначала выберите активную поездку (🧳 Мои поездки).",
                             reply_markup=main_menu())
        return
    tickets = await api.get_my_sos(message.from_user.id, me.active_trip_id)
    if not tickets:
        await message.answer("У вас нет SOS по активной поездке.")
        return
    await message.answer("\n\n".join(sos_card(t) for t in tickets[:5]))
