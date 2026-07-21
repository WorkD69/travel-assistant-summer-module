"""Главное reply-меню бота."""
from __future__ import annotations

from aiogram.types import KeyboardButton, ReplyKeyboardMarkup

BTN_TRIPS = "\U0001f9f3 Мои поездки"
BTN_TODAY = "\U0001f4c5 Сегодня"
BTN_NEXT = "\u23ed Ближайшее событие"
BTN_DOCUMENTS = "\U0001f4c4 Документы"
BTN_SOS = "\U0001f198 SOS"
BTN_ASSISTANT = "\U0001f4ac Помощник"
BTN_SETTINGS = "\u2699\ufe0f Настройки"

MENU_BUTTON_TEXTS: set[str] = {
    BTN_TRIPS,
    BTN_TODAY,
    BTN_NEXT,
    BTN_DOCUMENTS,
    BTN_SOS,
    BTN_ASSISTANT,
    BTN_SETTINGS,
}


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=BTN_TRIPS), KeyboardButton(text=BTN_TODAY)],
            [KeyboardButton(text=BTN_NEXT), KeyboardButton(text=BTN_DOCUMENTS)],
            [KeyboardButton(text=BTN_SOS), KeyboardButton(text=BTN_ASSISTANT)],
            [KeyboardButton(text=BTN_SETTINGS)],
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите действие…",
    )
