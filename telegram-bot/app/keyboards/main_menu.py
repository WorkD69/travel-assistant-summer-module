"""Главное reply-меню бота."""
from __future__ import annotations

from aiogram.types import KeyboardButton, ReplyKeyboardMarkup

BTN_TRIPS = "\U0001f9f3 Мои поездки"

MENU_BUTTON_TEXTS: set[str] = {BTN_TRIPS}


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=BTN_TRIPS)]],
        resize_keyboard=True,
        input_field_placeholder="Выберите действие…",
    )
