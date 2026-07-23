from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import SendMessage

from app.bot import AiogramSender
from app.services.notifications.dispatcher import SendResult, TelegramNotificationMessage


async def test_chat_not_found_is_a_permanent_blocked_delivery():
    class ChatNotFoundBot:
        async def send_message(self, **kwargs):
            raise TelegramBadRequest(
                method=SendMessage(chat_id=kwargs["chat_id"], text=kwargs["text"]),
                message="Bad Request: chat not found",
            )

    sender = AiogramSender(ChatNotFoundBot())
    message = TelegramNotificationMessage(chat_id=999999999, text="test")

    assert await sender.send(message) is SendResult.BLOCKED
