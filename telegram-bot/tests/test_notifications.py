"""Тесты NOTIFICATIONS: типы, настройки, тихие часы, дубли, повторы, доставка."""
from __future__ import annotations

import uuid
from typing import get_args

from app.schemas.models import NotificationEvent, NotificationType
from app.services.deep_links.service import DeepLinkService
from app.services.demo import DEMO_KINDS
from app.services.notifications.dispatcher import (
    NotificationDispatcher,
    SendResult,
    TelegramNotificationMessage,
)
from app.services.notifications.texts import TYPE_TITLES
from tests.helpers import ANNA_TG, ARTEM_TG, FIXED_NOW, FakeSender, link_both, make_env


def _dispatcher(env, sender) -> NotificationDispatcher:
    return NotificationDispatcher(
        env.api, sender, env.repo, DeepLinkService("http://localhost:8011"),
        now_factory=lambda: env.now, retry_delay_seconds=0)


def _event(**kw) -> NotificationEvent:
    base = dict(
        id="n-" + uuid.uuid4().hex[:8], event_id="ev-" + uuid.uuid4().hex[:8],
        type="delay", recipient_telegram_id=ANNA_TG, trip_id="t-turkey",
        trip_title="Отпуск в Турции", what_changed="Рейс задержан на 40 минут",
        occurred_at=FIXED_NOW, deep_link_target="trip")
    base.update(kw)
    return NotificationEvent(**base)


def test_all_supported_types_have_titles():
    assert set(get_args(NotificationType)) == set(TYPE_TITLES)


async def test_all_demo_kinds_delivered():
    env = make_env()
    await link_both(env.api)
    for kind in DEMO_KINDS:
        await env.api.simulate_event(kind, ARTEM_TG)
    sender = FakeSender()
    stats = await _dispatcher(env, sender).process_pending()
    assert stats["sent"] >= 13
    assert stats["failed"] == 0


async def test_dispatch_sends_message():
    env = make_env()
    await link_both(env.api)
    sender = FakeSender()
    status = await _dispatcher(env, sender).dispatch(_event())
    assert status == "sent" and len(sender.sent) == 1


async def test_duplicate_event_not_resent():
    env = make_env()
    await link_both(env.api)
    sender = FakeSender()
    d = _dispatcher(env, sender)
    ev = _event()
    assert await d.dispatch(ev) == "sent"
    assert await d.dispatch(ev) == "duplicate"
    assert len(sender.sent) == 1


async def test_disabled_pref_skips_send():
    env = make_env()
    await link_both(env.api)
    await env.api.update_notification_preferences(ANNA_TG, {"organizer_messages": False})
    sender = FakeSender()
    status = await _dispatcher(env, sender).dispatch(
        _event(type="organizer_message", what_changed="Новое сообщение"))
    assert status == "skipped_pref" and sender.sent == []


async def test_quiet_hours_defer_but_not_sos():
    env = make_env()
    await link_both(env.api)
    await env.api.update_notification_preferences(ANNA_TG, {
        "quiet_hours_enabled": True,
        "quiet_hours_start": "00:00",
        "quiet_hours_end": "23:59",
    })
    sender = FakeSender()
    d = _dispatcher(env, sender)
    assert await d.dispatch(_event(type="delay")) == "deferred"
    assert await d.dispatch(_event(type="sos_received", sos_id="s-100",
                                   deep_link_target="sos",
                                   what_changed="Получен SOS")) == "sent"


async def test_transient_error_retried_then_sent():
    env = make_env()
    await link_both(env.api)
    sender = FakeSender(fail_times=2)
    status = await _dispatcher(env, sender).dispatch(_event())
    assert status == "sent" and sender.attempts == 3


async def test_dispatcher_sends_typed_message_with_trip_button():
    env = make_env()
    await link_both(env.api)
    sender = FakeSender()

    assert await _dispatcher(env, sender).dispatch(_event()) == "sent"

    message = sender.messages[0]
    assert isinstance(message, TelegramNotificationMessage)
    assert message.chat_id == ANNA_TG
    button = message.inline_keyboard.inline_keyboard[0][0]
    assert button.text == "Открыть поездку"
    assert button.url is None
    assert button.callback_data == "local_site:trip:t-turkey"


async def test_blocked_bot_is_not_retried_and_is_marked_failed():
    env = make_env()
    await link_both(env.api)

    class BlockedSender:
        attempts = 0

        async def send(self, message: TelegramNotificationMessage) -> SendResult:
            self.attempts += 1
            return SendResult.BLOCKED

    sender = BlockedSender()
    event = _event()

    assert await _dispatcher(env, sender).dispatch(event) == "failed"
    assert sender.attempts == 1
    assert env.api._failed_attempts[event.id] == 1
