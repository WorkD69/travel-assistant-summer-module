"""Фильтры для кнопок главного меню."""
from __future__ import annotations

from aiogram.filters import BaseFilter
from aiogram.types import Message

from app.keyboards.main_menu import MENU_BUTTON_TEXTS


class IsMenuButton(BaseFilter):
    def __init__(self, button_text: str) -> None:
        self.button_text = button_text

    async def __call__(self, message: Message) -> bool:
        return (message.text or "").strip() == self.button_text


class NotMenuButton(BaseFilter):
    """True, если текст — не кнопка меню и не команда (для FSM-ввода)."""

    async def __call__(self, message: Message) -> bool:
        text = (message.text or "").strip()
        if not text:
            return False
        return text not in MENU_BUTTON_TEXTS and not text.startswith("/")
