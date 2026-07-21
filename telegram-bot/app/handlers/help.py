"""/help — справка по боту."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.keyboards.reply import main_menu

router = Router(name="help")

HELP_TEXT = (
    "🆘 Справка по боту «Тревел-помощник»\n\n"
    "🧳 /trips — мои поездки (активные, завершённые, приглашения)\n"
    "📜 /history — завершённые поездки\n"
    "📅 /today — события на сегодня\n"
    "⏭ /next — ближайшее событие\n"
    "📄 /documents — доступные документы\n"
    "💬 /messages — сообщения организатора и опубликованный План Б\n"
    "🆘 /sos — отправить сигнал о проблеме\n"
    "📋 /mysos — мои SOS по активной поездке\n"
    "💬 /assistant — AI-помощник по поездке\n"
    "🔔 /notifications — настройки уведомлений\n"
    "⚙️ /settings — настройки\n"
    "🔓 /unlink — отвязать Telegram\n"
    "❌ /cancel — отменить текущее действие\n\n"
    "Кнопки меню внизу дублируют команды — запоминать их не нужно."
)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(HELP_TEXT, reply_markup=main_menu())


@router.callback_query(F.data == "help:main")
async def cb_help(callback: CallbackQuery) -> None:
    if callback.message:
        await callback.message.answer(HELP_TEXT)
    await callback.answer()
