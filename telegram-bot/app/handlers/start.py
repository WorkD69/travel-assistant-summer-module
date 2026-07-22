"""/start: приветствие, привязка по link_<token>, /unlink."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.config import Settings
from app.keyboards.inline import unlink_confirm_kb, unlinked_start_kb
from app.keyboards.reply import main_menu
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient
from app.services.travel_api.errors import NotLinkedError, TravelApiError
from app.utils.formatting import event_line

router = Router(name="start")

NOT_LINKED_TEXT = (
    "Подключите Telegram к аккаунту Тревел-помощника.\n\n"
    "Откройте сайт, войдите в Профиль и нажмите «Подключить Telegram» — "
    "сайт откроет бота со специальной ссылкой привязки."
)


async def _show_linked_home(message: Message, api: TravelApiClient, tg_id: int) -> None:
    me = await api.get_me(tg_id)
    lines = [f"Здравствуйте, {me.name}! 👋"]
    if me.active_trip_id:
        try:
            trip = await api.get_trip(tg_id, me.active_trip_id)
            lines.append(f"Активная поездка: {trip.title}")
            nxt = await api.get_next_event(tg_id, me.active_trip_id)
            if nxt:
                lines.append("Ближайшее событие:\n" + event_line(nxt, trip.timezone))
        except TravelApiError:
            pass
    else:
        lines.append("Активная поездка не выбрана — откройте 🧳 Мои поездки.")
    await message.answer("\n\n".join(lines), reply_markup=main_menu())


@router.message(CommandStart(deep_link=True))
async def cmd_start_deep_link(message: Message, command: CommandObject,
                              api: TravelApiClient, deep_links: DeepLinkService,
                              state: FSMContext) -> None:
    await state.clear()
    payload = (command.args or "").strip()
    if not payload.startswith("link_"):
        await cmd_start(message, api, deep_links, state)
        return
    token = payload[len("link_"):]
    result = await api.consume_link_token(message.from_user.id, token)
    if result.relinked:
        text = f"Готово! Привязка обновлена. Вы снова на связи, {result.name}!"
    else:
        text = f"Готово! Telegram подключён к аккаунту {result.name}."
    await message.answer(text, reply_markup=main_menu())
    await _show_linked_home(message, api, message.from_user.id)


@router.message(CommandStart())
async def cmd_start(message: Message, api: TravelApiClient,
                    deep_links: DeepLinkService, state: FSMContext) -> None:
    await state.clear()
    try:
        await _show_linked_home(message, api, message.from_user.id)
    except NotLinkedError:
        await message.answer(NOT_LINKED_TEXT,
                             reply_markup=unlinked_start_kb(deep_links.home()))


@router.message(Command("unlink"))
async def cmd_unlink(message: Message) -> None:
    await message.answer(
        "Отвязать Telegram от аккаунта Тревел-помощника?\n"
        "Уведомления и команды перестанут работать до повторной привязки.",
        reply_markup=unlink_confirm_kb(),
    )


@router.callback_query(F.data == "unlink:confirm")
async def cb_unlink_confirm(callback: CallbackQuery, api: TravelApiClient) -> None:
    await api.unlink(callback.from_user.id)
    if callback.message:
        await callback.message.edit_text(
            "Telegram отвязан. Чтобы подключиться снова — откройте Профиль на сайте.")
    await callback.answer()


@router.callback_query(F.data == "help:link")
async def cb_help_link(callback: CallbackQuery, app_settings: Settings) -> None:
    username = app_settings.telegram_bot_username or "<имя_бота>"
    text = (
        "Как подключить:\n"
        "1. Войдите на сайт Тревел-помощника.\n"
        "2. Откройте Профиль → «Подключить Telegram».\n"
        f"3. Сайт откроет @{username} с одноразовой ссылкой (действует 10 минут).\n"
        "4. Нажмите Start — и готово."
    )
    if callback.message:
        await callback.message.answer(text)
    await callback.answer()
