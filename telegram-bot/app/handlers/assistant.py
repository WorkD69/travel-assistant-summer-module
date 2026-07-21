"""💬 Помощник — переписка с AI по выбранной поездке (только разрешённый контекст)."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.keyboards.inline import assistant_kb, pick_trip_kb
from app.keyboards.reply import BTN_ASSISTANT, main_menu
from app.repositories.bot_state import BotStateRepository
from app.services.ai.base import AIProvider
from app.services.ai.sanitizer import build_safe_context, sanitize_text
from app.services.deep_links.service import DeepLinkService
from app.services.travel_api.base import TravelApiClient
from app.states.assistant import AssistantStates
from app.utils.active_trip import resolve_active_trip

router = Router(name="assistant")


async def _enter_chat(message: Message, state: FSMContext, trip_title: str) -> None:
    await state.set_state(AssistantStates.chatting)
    await message.answer(
        f"💬 Режим помощника по поездке «{trip_title}».\n"
        "Задайте вопрос обычным текстом, например: «Во сколько завтра выезд?»",
        reply_markup=assistant_kb(),
    )


@router.message(Command("assistant"))
@router.message(F.text == BTN_ASSISTANT)
async def cmd_assistant(message: Message, api: TravelApiClient,
                        state: FSMContext) -> None:
    trip, selectable = await resolve_active_trip(api, message.from_user.id)
    if trip is None:
        if not selectable:
            await message.answer("У вас пока нет доступных поездок.")
            return
        await message.answer("Выберите поездку для помощника:",
                             reply_markup=pick_trip_kb(selectable, "ai"))
        return
    await _enter_chat(message, state, trip.title)


@router.callback_query(F.data.startswith("pick:ai:"))
async def cb_pick_ai(callback: CallbackQuery, api: TravelApiClient,
                     state: FSMContext) -> None:
    trip_id = callback.data.split(":")[2]
    await api.select_active_trip(callback.from_user.id, trip_id)
    trip = await api.get_trip(callback.from_user.id, trip_id)
    if callback.message:
        await _enter_chat(callback.message, state, trip.title)
    await callback.answer()


@router.callback_query(F.data == "ai:stop")
async def cb_ai_stop(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    if callback.message:
        await callback.message.answer("Диалог завершён.", reply_markup=main_menu())
    await callback.answer()


@router.callback_query(F.data == "ai:clear")
async def cb_ai_clear(callback: CallbackQuery, api: TravelApiClient,
                      state_repo: BotStateRepository) -> None:
    me = await api.get_me(callback.from_user.id)
    if me.active_trip_id:
        await state_repo.clear_assistant_history(callback.from_user.id, me.active_trip_id)
    await callback.answer("История очищена")


@router.callback_query(F.data == "ai:switch")
async def cb_ai_switch(callback: CallbackQuery, api: TravelApiClient,
                       state: FSMContext) -> None:
    await state.clear()
    trips = [t for t in await api.get_trips(callback.from_user.id)
             if t.membership_status == "member"]
    if callback.message:
        await callback.message.answer("Выберите поездку для помощника:",
                                      reply_markup=pick_trip_kb(trips, "ai"))
    await callback.answer()


@router.message(AssistantStates.chatting, F.text)
async def msg_assistant_question(message: Message, api: TravelApiClient, ai: AIProvider,
                                 state_repo: BotStateRepository) -> None:
    question = (message.text or "").strip()
    if not question or question.startswith("/"):
        return
    tg_id = message.from_user.id
    me = await api.get_me(tg_id)
    if not me.active_trip_id:
        await message.answer("Сначала выберите поездку (🧳 Мои поездки).")
        return
    trip_id = me.active_trip_id
    ctx = await api.get_assistant_context(tg_id, trip_id)
    context_text = build_safe_context(ctx)
    safe_question = sanitize_text(question)
    history = [
        (role, sanitize_text(text))
        for role, text in await state_repo.get_assistant_history(tg_id, trip_id)
    ]
    answer = await ai.generate(safe_question, context_text, history)
    await state_repo.add_assistant_message(tg_id, trip_id, "user", safe_question)
    await state_repo.add_assistant_message(
        tg_id, trip_id, "assistant", sanitize_text(answer)
    )
    await message.answer(answer, reply_markup=assistant_kb())
