"""/demo — симуляция событий (только development + mock)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.filters.demo import DemoEnabledFilter
from app.keyboards.inline import demo_kb
from app.services.demo import DEMO_KINDS, DemoService

router = Router(name="demo")


@router.message(Command("demo"), DemoEnabledFilter())
async def cmd_demo(message: Message) -> None:
    await message.answer(
        "🧪 Демо-симуляция уведомлений. Выберите событие — оно попадёт в очередь "
        "и придёт вам как настоящее уведомление:",
        reply_markup=demo_kb(DEMO_KINDS),
    )


@router.callback_query(F.data.startswith("demo:"))
async def cb_demo(callback: CallbackQuery, demo: DemoService) -> None:
    kind = callback.data.split(":", 1)[1]
    await demo.simulate(kind, callback.from_user.id)
    await callback.answer("Событие добавлено в очередь — уведомление придёт через несколько секунд")
