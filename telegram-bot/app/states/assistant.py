"""FSM-состояние режима переписки с AI-помощником."""
from aiogram.fsm.state import State, StatesGroup


class AssistantStates(StatesGroup):
    chatting = State()
