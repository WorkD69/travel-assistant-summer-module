"""/help — справка по боту."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.reply import main_menu

router = Router(name="help")

HELP_TEXT = (
    "Справка\n\n"
    "🧳 /trips — открыть доступные поездки и их краткий статус.\n\n"
    "Telegram — companion к Web Workspace. Действия, которые меняют поездку, выполняются на сайте."
)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(HELP_TEXT, reply_markup=main_menu())


@router.callback_query(F.data == "help:main")
async def cb_help(callback: CallbackQuery) -> None:
    if callback.message:
        await callback.message.answer(HELP_TEXT)
    await callback.answer()
