"""Focused contract tests for the minimal Telegram Companion V1 flow."""
from __future__ import annotations

from app.bot import BOT_COMMANDS
from app.keyboards.main_menu import MENU_BUTTON_TEXTS, main_menu_keyboard
from app.schemas.models import Trip
from app.services.deep_links.service import DeepLinkService
from app.utils import formatting


def make_trip(demo_disruption=None) -> Trip:
    payload = {
        "id": "trip-1",
        "title": "Москва — Казань",
        "route": "Москва → Казань",
        "date_start": "2026-09-01",
        "date_end": "2026-09-02",
        "status": "active",
        "role": "participant",
        "membership_status": "member",
        "demo_disruption": demo_disruption,
    }
    return Trip.model_validate(payload)


def test_trip_accepts_nullable_factual_demo_disruption_projection() -> None:
    trip = make_trip({
        "category": "plan_b_disruption",
        "source": "DEMO_SIMULATION",
        "status": "active",
        "type": "CANCELLED",
        "context": {"segment": "Москва → Казань"},
    })
    assert getattr(trip, "demo_disruption", None) is not None
    assert trip.demo_disruption.source == "DEMO_SIMULATION"
    assert trip.demo_disruption.type == "CANCELLED"


def test_companion_summary_renders_only_factual_demo_wording() -> None:
    renderer = getattr(formatting, "companion_trip_summary", None)
    assert callable(renderer)
    rendered = renderer(make_trip({
        "category": "plan_b_disruption",
        "source": "DEMO_SIMULATION",
        "status": "active",
        "type": "CANCELLED",
        "context": {"segment": "Москва → Казань"},
    }))
    assert "Москва → Казань" in rendered
    assert "Статус:" in rendered
    assert "⚠️ Демо-событие" in rendered
    assert "Для демонстрации в поездке создано событие" in rendered
    assert "CANCELLED" in rendered
    assert "Детали: segment: Москва → Казань" in rendered
    assert "{" not in rendered
    assert "Tutu обнаружил" not in rendered
    assert "Перевозчик сообщил" not in rendered
    assert "live cancellation" not in rendered.lower()
    for forbidden in ("PNR", "билет", "место", "стоимость", "покупка"):
        assert forbidden not in rendered


def test_companion_summary_omits_warning_when_no_active_demo_projection() -> None:
    renderer = getattr(formatting, "companion_trip_summary", None)
    assert callable(renderer)
    rendered = renderer(make_trip())
    assert "⚠️ Демо-событие" not in rendered
    assert "Для демонстрации" not in rendered


def test_web_trip_deeplink_uses_one_base_and_only_urlencoded_trip_id() -> None:
    url = DeepLinkService("https://travel.example/").trip("trip with space")
    assert url == "https://travel.example/trips/trip%20with%20space"
    for forbidden in ("jwt", "token", "selectiontoken", "proposal", "secret"):
        assert forbidden not in url.lower()


def test_v1_menu_and_commands_expose_only_my_trips_flow() -> None:
    assert {command.command for command in BOT_COMMANDS} == {"start", "trips", "help"}
    assert MENU_BUTTON_TEXTS == {"🧳 Мои поездки"}
    keyboard = main_menu_keyboard()
    assert [[button.text for button in row] for row in keyboard.keyboard] == [["🧳 Мои поездки"]]


async def test_my_trips_lists_only_member_trips_with_active_first() -> None:
    from app.handlers.trips import show_my_trips
    from tests.helpers import ARTEM_TG, link_both, make_env

    env = make_env()
    await link_both(env.api)

    class RecordingMessage:
        from_user = type("User", (), {"id": ARTEM_TG})()
        text = ""
        keyboard = None

        async def answer(self, text, reply_markup=None, **kwargs):
            self.text = text
            self.keyboard = reply_markup

    message = RecordingMessage()
    await show_my_trips(message, env.api, ARTEM_TG)

    assert message.text == "Мои поездки:"
    callbacks = [row[0].callback_data for row in message.keyboard.inline_keyboard]
    assert callbacks and all(callback.startswith("v1:trip:") for callback in callbacks)
    listed_ids = [callback.removeprefix("v1:trip:") for callback in callbacks]
    available = {trip.id: trip for trip in await env.api.get_trips(ARTEM_TG)}
    assert available[listed_ids[0]].status == "active"
    assert all(available[trip_id].membership_status == "member" for trip_id in listed_ids)


async def test_open_trip_callback_uses_factual_summary_and_safe_v1_deeplink() -> None:
    from types import SimpleNamespace
    from app.handlers.trips import cb_open_trip
    from app.services.deep_links.service import DeepLinkService
    from tests.helpers import ARTEM_TG, link_both, make_env

    env = make_env()
    await link_both(env.api)

    class RecordingMessage:
        text = ""
        keyboard = None

        async def edit_text(self, text, reply_markup=None, **kwargs):
            self.text = text
            self.keyboard = reply_markup

    class RecordingCallback:
        data = "v1:trip:t-turkey"
        from_user = SimpleNamespace(id=ARTEM_TG)
        message = RecordingMessage()
        answered = False

        async def answer(self, *args, **kwargs):
            self.answered = True

    callback = RecordingCallback()
    await cb_open_trip(callback, env.api, DeepLinkService("https://travel.example"))

    assert "Москва → Анталья" in callback.message.text
    assert "PNR" not in callback.message.text
    assert "билет" not in callback.message.text
    button = callback.message.keyboard.inline_keyboard[0][0]
    assert button.url == "https://travel.example/trips/t-turkey"
    assert callback.answered is True


async def test_unrelated_and_revoked_trip_access_are_denied_before_any_companion_summary() -> None:
    from app.services.travel_api.errors import AccessDeniedError
    from tests.helpers import ANNA_TG, link_both, make_env

    env = make_env()
    await link_both(env.api)
    try:
        await env.api.get_trip(ANNA_TG, "t-kazan")
    except AccessDeniedError:
        pass
    else:
        raise AssertionError("unrelated Trip must be denied")

    for membership in env.api._data.memberships:
        if membership.trip_id == "t-turkey" and membership.user_id == "u-anna":
            membership.status = "revoked"
    try:
        await env.api.get_trip(ANNA_TG, "t-turkey")
    except AccessDeniedError:
        pass
    else:
        raise AssertionError("revoked Trip access must be denied")
