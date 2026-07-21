"""Reply-клавиатура главного меню."""
from aiogram.types import KeyboardButton, ReplyKeyboardMarkup

BTN_TRIPS = "🧳 Мои поездки"
BTN_TODAY = "📅 Сегодня"
BTN_NEXT = "⏭ Ближайшее событие"
BTN_DOCUMENTS = "📄 Документы"
BTN_SOS = "🆘 SOS"
BTN_ASSISTANT = "💬 Помощник"
BTN_SETTINGS = "⚙️ Настройки"


def main_menu() -> ReplyKeyboardMarkup:
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
