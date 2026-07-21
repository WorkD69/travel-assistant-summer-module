"""/notifications — настройки уведомлений; раздел «Сообщения» поездки."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import PREF_LABELS, open_trip_kb, prefs_kb, settings_kb, timezones_kb
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient

router = Router(name="notifications")


async def send_messages(message: Message, api: TravelApiClient, deep_links: DeepLinkService,
                        tg_id: int, trip_id: str) -> None:
    trip = await api.get_trip(tg_id, trip_id)
    msgs = await api.get_messages(tg_id, trip_id)
    if not msgs:
        await message.answer(f"💬 {trip.title}\nОпубликованных сообщений нет.")
        return
    blocks = []
    for m in msgs[:5]:
        header = f"🅱️ План Б: {m.title}" if m.is_plan_b else f"💬 {m.title}"
        block = [header, m.text, f"— {m.author_name}, {m.created_at.strftime('%d.%m %H:%M')}"]
        if m.segment_title:
            block.insert(1, f"Сегмент: {m.segment_title}")
        blocks.append("\n".join(block))
    await message.answer(
        "\n\n".join(blocks),
        reply_markup=open_trip_kb(
            deep_links.messages(trip_id), "Открыть сообщения на сайте"
        ),
    )


@router.message(Command("messages"))
async def cmd_messages(message: Message, api: TravelApiClient,
                       deep_links: DeepLinkService) -> None:
    me = await api.get_me(message.from_user.id)
    if not me.active_trip_id:
        await message.answer("Сначала выберите активную поездку (🧳 Мои поездки).")
        return
    await send_messages(
        message,
        api,
        deep_links,
        message.from_user.id,
        me.active_trip_id,
    )


@router.message(Command("notifications"))
async def cmd_notifications(message: Message, api: TravelApiClient) -> None:
    prefs = await api.get_notification_preferences(message.from_user.id)
    await message.answer("🔔 Настройки уведомлений:", reply_markup=prefs_kb(prefs))


@router.callback_query(F.data == "settings:prefs")
async def cb_prefs(callback: CallbackQuery, api: TravelApiClient) -> None:
    prefs = await api.get_notification_preferences(callback.from_user.id)
    if callback.message:
        await callback.message.edit_text("🔔 Настройки уведомлений:",
                                         reply_markup=prefs_kb(prefs))
    await callback.answer()


@router.callback_query(F.data.startswith("pref:toggle:"))
async def cb_pref_toggle(callback: CallbackQuery, api: TravelApiClient) -> None:
    field = callback.data.split(":")[2]
    prefs = await api.get_notification_preferences(callback.from_user.id)
    new_prefs = await api.update_notification_preferences(
        callback.from_user.id, {field: not getattr(prefs, field, True)})
    if callback.message:
        await callback.message.edit_reply_markup(reply_markup=prefs_kb(new_prefs))
    await callback.answer()


@router.callback_query(F.data.in_({"pref:all_on", "pref:all_off"}))
async def cb_pref_all(callback: CallbackQuery, api: TravelApiClient) -> None:
    value = callback.data == "pref:all_on"
    updates = {key: value for key in PREF_LABELS}
    new_prefs = await api.update_notification_preferences(callback.from_user.id, updates)
    if callback.message:
        await callback.message.edit_reply_markup(reply_markup=prefs_kb(new_prefs))
    await callback.answer("Готово")


@router.callback_query(F.data == "pref:tz")
async def cb_pref_tz(callback: CallbackQuery) -> None:
    if callback.message:
        await callback.message.edit_text("Выберите часовой пояс:",
                                         reply_markup=timezones_kb())
    await callback.answer()


@router.callback_query(F.data.startswith("pref:tz:"))
async def cb_pref_tz_set(callback: CallbackQuery, api: TravelApiClient) -> None:
    tz = callback.data.split("pref:tz:", 1)[1]
    new_prefs = await api.update_notification_preferences(
        callback.from_user.id, {"timezone": tz})
    if callback.message:
        await callback.message.edit_text("🔔 Настройки уведомлений:",
                                         reply_markup=prefs_kb(new_prefs))
    await callback.answer(f"Часовой пояс: {tz}")


@router.callback_query(F.data == "pref:back")
async def cb_pref_back(callback: CallbackQuery) -> None:
    if callback.message:
        await callback.message.edit_text("⚙️ Настройки:", reply_markup=settings_kb())
    await callback.answer()
