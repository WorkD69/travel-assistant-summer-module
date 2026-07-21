"""⚙️ Настройки: уведомления + отвязка Telegram."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import settings_kb, unlink_confirm_kb
from app.keyboards.reply import BTN_SETTINGS

router = Router(name="settings")


@router.message(Command("settings"))
@router.message(F.text == BTN_SETTINGS)
async def cmd_settings(message: Message) -> None:
    await message.answer("⚙️ Настройки:", reply_markup=settings_kb())


@router.callback_query(F.data == "settings:unlink")
async def cb_settings_unlink(callback: CallbackQuery) -> None:
    if callback.message:
        await callback.message.edit_text(
            "Отвязать Telegram от аккаунта Тревел-помощника?",
            reply_markup=unlink_confirm_kb())
    await callback.answer()
