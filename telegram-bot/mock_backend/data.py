"""Безопасные демонстрационные данные для mock-режима (без реальных ПДн)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.schemas.models import OrganizerMessage, SosTicket, TripDocument, TripEvent

ARTEM = "u-artem"
ANNA = "u-anna"


@dataclass
class MockUser:
    id: str
    name: str
    email: str


@dataclass
class MockTrip:
    id: str
    title: str
    route: str
    date_start: datetime
    date_end: datetime
    timezone: str
    status: str


@dataclass
class Membership:
    trip_id: str
    user_id: str
    role: str
    status: str  # member | invited | revoked


@dataclass
class LinkTokenRecord:
    token: str
    site_user_id: str
    expires_at: datetime
    used: bool = False


@dataclass
class MockDataset:
    users: dict[str, MockUser]
    trips: dict[str, MockTrip]
    memberships: list[Membership]
    events: dict[str, TripEvent]
    documents: dict[str, TripDocument]
    messages: dict[str, OrganizerMessage]
    sos: dict[str, SosTicket]
    link_tokens: dict[str, LinkTokenRecord]
    recent_changes: dict[str, list[str]] = field(default_factory=dict)
    sos_counter: int = 101


def _at(day, hour, minute, tz):
    return datetime.combine(day, time(hour, minute), tzinfo=tz)


def build_dataset(now: datetime | None = None) -> MockDataset:
    now = now or datetime.now(timezone.utc)
    ist = ZoneInfo("Europe/Istanbul")
    msk = ZoneInfo("Europe/Moscow")
    mns = ZoneInfo("Europe/Minsk")
    tbs = ZoneInfo("Asia/Tbilisi")

    d_ist = now.astimezone(ist).date()
    d_msk = now.astimezone(msk).date()

    users = {
        ARTEM: MockUser(ARTEM, "Артём", "artem@example.test"),
        ANNA: MockUser(ANNA, "Анна", "anna@example.test"),
    }

    trips = {
        "t-turkey": MockTrip(
            "t-turkey", "Отпуск в Турции", "Москва → Анталья",
            _at(d_ist - timedelta(days=1), 6, 0, ist), _at(d_ist + timedelta(days=6), 23, 0, ist),
            "Europe/Istanbul", "active",
        ),
        "t-kazan": MockTrip(
            "t-kazan", "Соло-выезд в Казань", "Москва → Казань",
            _at(d_msk + timedelta(days=1), 6, 0, msk), _at(d_msk + timedelta(days=4), 22, 0, msk),
            "Europe/Moscow", "planned",
        ),
        "t-minsk": MockTrip(
            "t-minsk", "Минск с друзьями", "Москва → Минск",
            _at(d_msk + timedelta(days=14), 7, 0, mns), _at(d_msk + timedelta(days=17), 21, 0, mns),
            "Europe/Minsk", "planned",
        ),
        "t-tbilisi": MockTrip(
            "t-tbilisi", "Поездка в Тбилиси", "Москва → Тбилиси",
            _at(d_msk - timedelta(days=40), 8, 0, tbs), _at(d_msk - timedelta(days=33), 20, 0, tbs),
            "Asia/Tbilisi", "finished",
        ),
        "t-draft": MockTrip(
            "t-draft", "Черновик: Питер на выходные", "Москва → Санкт-Петербург",
            _at(d_msk + timedelta(days=30), 8, 0, msk), _at(d_msk + timedelta(days=32), 22, 0, msk),
            "Europe/Moscow", "draft",
        ),
    }

    memberships = [
        Membership("t-turkey", ARTEM, "organizer", "member"),
        Membership("t-turkey", ANNA, "participant", "member"),
        Membership("t-kazan", ARTEM, "organizer", "member"),
        Membership("t-minsk", ARTEM, "organizer", "member"),
        Membership("t-minsk", ANNA, "participant", "invited"),
        Membership("t-tbilisi", ARTEM, "organizer", "member"),
        Membership("t-tbilisi", ANNA, "participant", "member"),
        Membership("t-draft", ARTEM, "organizer", "member"),
    ]

    events = {}
    def _ev(**kw):
        e = TripEvent(**kw)
        events[e.id] = e

    _ev(id="e-tr-transfer", trip_id="t-turkey", type="transfer", title="Трансфер в отель",
        starts_at=_at(d_ist, 13, 0, ist), departure_place="Аэропорт Анталья (AYT)",
        arrival_place="Отель Sunrise Beach", note="Водитель встречает с табличкой")
    _ev(id="e-tr-checkin", trip_id="t-turkey", type="checkin", title="Заселение в отель",
        starts_at=_at(d_ist, 15, 0, ist), arrival_place="Отель Sunrise Beach",
        document_id="d-hotel", document_title="Ваучер отеля Sunrise Beach")
    _ev(id="e-tr-dinner", trip_id="t-turkey", type="activity", title="Приветственный ужин",
        starts_at=_at(d_ist, 19, 30, ist), departure_place="Лобби отеля")
    _ev(id="e-tr-excursion", trip_id="t-turkey", type="activity", title="Экскурсия в Каппадокию",
        starts_at=_at(d_ist + timedelta(days=2), 8, 0, ist), departure_place="Лобби отеля")
    _ev(id="e-tr-back", trip_id="t-turkey", type="flight", title="Рейс домой TK-413",
        starts_at=_at(d_ist + timedelta(days=6), 16, 20, ist), departure_place="Анталья (AYT)",
        arrival_place="Москва (VKO)", document_id="d-tickets", document_title="Авиабилеты туда-обратно")
    _ev(id="e-kz-train", trip_id="t-kazan", type="train", title="Поезд 002Й Москва → Казань",
        starts_at=_at(d_msk + timedelta(days=1), 8, 10, msk), departure_place="Казанский вокзал",
        arrival_place="Казань-1", document_id="d-kazan-train", document_title="Ж/д билет в Казань")
    _ev(id="e-kz-checkin", trip_id="t-kazan", type="checkin", title="Заселение в хостел",
        starts_at=_at(d_msk + timedelta(days=1), 14, 0, msk), arrival_place="Хостел «Казань-Центр»")
    _ev(id="e-mn-bus", trip_id="t-minsk", type="bus", title="Автобус Москва → Минск",
        starts_at=_at(d_msk + timedelta(days=14), 7, 30, mns), departure_place="Автовокзал «Саларьево»",
        arrival_place="Минск, Центральный автовокзал")
    _ev(id="e-tb-flight", trip_id="t-tbilisi", type="flight", title="Рейс в Тбилиси",
        starts_at=_at(d_msk - timedelta(days=40), 10, 0, tbs), status="completed",
        departure_place="Москва (SVO)", arrival_place="Тбилиси (TBS)")

    documents = {}
    def _doc(**kw):
        d = TripDocument(**kw)
        documents[d.id] = d

    _doc(id="d-tickets", trip_id="t-turkey", title="Авиабилеты туда-обратно", doc_type="билеты",
         segment_title="Рейс домой TK-413", uploaded_at=now - timedelta(days=3), visibility="all")
    _doc(id="d-hotel", trip_id="t-turkey", title="Ваучер отеля Sunrise Beach", doc_type="ваучер",
         segment_title="Заселение в отель", uploaded_at=now - timedelta(days=3), visibility="all")
    _doc(id="d-insurance-list", trip_id="t-turkey", title="Список страховок группы", doc_type="служебный",
         uploaded_at=now - timedelta(days=2), visibility="organizer_only")
    _doc(id="d-anna-passport", trip_id="t-turkey", title="Скан загранпаспорта (Анна)", doc_type="личный",
         uploaded_at=now - timedelta(days=2), visibility="personal", owner_user_id=ANNA)
    _doc(id="d-artem-passport", trip_id="t-turkey", title="Скан загранпаспорта (Артём)", doc_type="личный",
         uploaded_at=now - timedelta(days=2), visibility="personal", owner_user_id=ARTEM)
    _doc(id="d-revoked", trip_id="t-turkey", title="Старая программа поездки", doc_type="программа",
         uploaded_at=now - timedelta(days=5), visibility="all", revoked=True)
    _doc(id="d-kazan-train", trip_id="t-kazan", title="Ж/д билет в Казань", doc_type="билеты",
         segment_title="Поезд 002Й", uploaded_at=now - timedelta(days=1), visibility="all")
    _doc(id="d-tbilisi-hotel", trip_id="t-tbilisi", title="Ваучер отеля в Тбилиси", doc_type="ваучер",
         uploaded_at=now - timedelta(days=45), visibility="all")

    messages = {}
    def _msg(**kw):
        m = OrganizerMessage(**kw)
        messages[m.id] = m

    _msg(id="m-welcome", trip_id="t-turkey", title="Добро пожаловать!",
         text="Собираемся в лобби отеля в 19:00 перед ужином.", author_name="Артём",
         created_at=now - timedelta(hours=5), segment_title="Приветственный ужин")
    _msg(id="m-planb", trip_id="t-turkey", title="План Б: запасной трансфер",
         text="Если трансфер опоздает больше чем на 30 минут, едем на такси партнёра; "
              "расходы компенсируются.", author_name="Артём",
         created_at=now - timedelta(hours=2), segment_title="Трансфер в отель", is_plan_b=True)
    _msg(id="m-draft", trip_id="t-turkey", title="Черновик объявления",
         text="Ещё не опубликовано.", author_name="Артём", created_at=now - timedelta(hours=1),
         status="draft")
    _msg(id="m-supplier", trip_id="t-turkey", title="Запрос поставщику трансфера",
         text="Подтвердите минивэн на 12 мест.", author_name="Артём", created_at=now - timedelta(hours=8),
         audience="suppliers")
    _msg(id="m-internal", trip_id="t-turkey", title="Служебная заметка",
         text="Проверить оплату отеля.", author_name="Артём", created_at=now - timedelta(hours=7),
         audience="internal")

    sos = {
        "s-100": SosTicket(
            id="s-100", number="SOS-100", trip_id="t-turkey", author_user_id=ANNA,
            category="transport", description="Автобус-шаттл не пришёл на остановку.",
            status="in_review", created_at=now - timedelta(hours=3),
            segment_id="e-tr-transfer", segment_title="Трансфер в отель",
        ),
    }

    link_tokens = {
        "demo-artem": LinkTokenRecord("demo-artem", ARTEM, now + timedelta(hours=12)),
        "demo-anna": LinkTokenRecord("demo-anna", ANNA, now + timedelta(hours=12)),
        "demo-expired": LinkTokenRecord("demo-expired", ANNA, now - timedelta(minutes=1)),
        "demo-used": LinkTokenRecord("demo-used", ANNA, now + timedelta(hours=12), used=True),
    }

    return MockDataset(
        users=users, trips=trips, memberships=memberships, events=events,
        documents=documents, messages=messages, sos=sos, link_tokens=link_tokens,
        recent_changes={"t-turkey": ["Уточнено время трансфера в отель", "Добавлен ваучер отеля"]},
        sos_counter=101,
    )
