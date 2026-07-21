"""FSM-состояния сценария SOS."""
from aiogram.fsm.state import State, StatesGroup


class SosStates(StatesGroup):
    choosing_trip = State()
    choosing_segment = State()
    choosing_category = State()
    entering_description = State()
    confirming = State()
