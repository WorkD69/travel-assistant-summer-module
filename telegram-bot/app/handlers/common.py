"""Общие обработчики: /cancel, кнопка «Отмена», noop."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.keyboards.reply import main_menu
from app.services.deep_links.service import DeepLinkService

router = Router(name="common")


@router.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("Действие отменено.", reply_markup=main_menu())


@router.callback_query(F.data == "cancel")
async def cb_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    if callback.message:
        await callback.message.edit_text("Действие отменено.")
    await callback.answer()


@router.callback_query(F.data == "noop")
async def cb_noop(callback: CallbackQuery) -> None:
    await callback.answer()


@router.callback_query(F.data.startswith("local_site:"))
async def cb_local_site(callback: CallbackQuery, deep_links: DeepLinkService) -> None:
    if callback.data == "local_site:home":
        url = deep_links.home()
    else:
        trip_id = callback.data.split(":", 2)[2]
        url = deep_links.trip(trip_id)
    if callback.message:
        await callback.message.answer(
            "Локальная ссылка:\n"
            f"{url}\n\n"
            "Откройте её в Telegram Desktop на этом же компьютере. "
            "С телефона localhost не откроет сайт компьютера."
        )
    await callback.answer()
