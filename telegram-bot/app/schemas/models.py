"""Общие pydantic-модели данных бота (совпадают со схемами bot-api.openapi.yaml)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["organizer", "participant", "viewer"]
TripStatus = Literal["draft", "planned", "active", "finished"]
MembershipStatus = Literal["member", "invited", "revoked"]
EventType = Literal[
    "flight", "train", "bus", "transfer", "checkin", "checkout", "activity", "manual"
]
EventStatus = Literal["scheduled", "changed", "delayed", "cancelled", "completed"]
DocumentVisibility = Literal["all", "organizer_only", "personal"]
SosCategory = Literal["late", "lost_document", "transport", "accommodation", "need_help", "other"]
SosStatus = Literal["new", "in_review", "resolved", "rejected"]
NotificationType = Literal[
    "segment_reminder", "time_change", "gate_change", "terminal_change", "platform_change",
    "departure_place_change", "delay", "cancellation", "transfer_change", "hotel_change",
    "new_document", "trip_invitation", "sos_status_change", "sos_received",
    "violation_confirmed", "plan_b_published", "organizer_message",
    "route_changed", "dates_changed", "segments_changed", "event_changed",
    "participant_changed", "document_added", "plan_b_created", "plan_b_applied",
    "risk_detected", "sos_created", "sos_status_changed",
]
DeepLinkTarget = Literal["home", "trip", "monitoring", "documents", "messages", "sos", "members", "invitation"]


class BotUser(BaseModel):
    site_user_id: str
    name: str
    email: str = ""
    active_trip_id: Optional[str] = None


class LinkResult(BaseModel):
    site_user_id: str
    name: str
    relinked: bool = False


class Trip(BaseModel):
    id: str
    title: str
    route: str = ""
    date_start: date
    date_end: date
    timezone: str = "Europe/Moscow"
    status: TripStatus = "planned"
    role: Role = "participant"
    membership_status: MembershipStatus = "member"


class TripEvent(BaseModel):
    id: str
    trip_id: str
    type: EventType
    title: str
    starts_at: datetime
    ends_at: Optional[datetime] = None
    departure_place: str = ""
    arrival_place: str = ""
    status: EventStatus = "scheduled"
    note: str = ""
    document_id: Optional[str] = None
    document_title: str = ""


class TripDocument(BaseModel):
    id: str
    trip_id: str
    title: str
    doc_type: str = "документ"
    segment_title: str = ""
    uploaded_at: datetime
    visibility: DocumentVisibility = "all"
    owner_user_id: Optional[str] = None
    revoked: bool = False
    deleted: bool = False


class DocumentDownload(BaseModel):
    kind: Literal["file", "url"]
    location: str
    filename: Optional[str] = None
    title: str = "Документ поездки"


class SosTicket(BaseModel):
    id: str
    number: str
    trip_id: str
    author_user_id: str
    category: SosCategory
    description: str
    status: SosStatus = "new"
    created_at: datetime
    segment_id: Optional[str] = None
    segment_title: Optional[str] = None


class OrganizerMessage(BaseModel):
    id: str
    trip_id: str
    title: str
    text: str
    author_name: str
    created_at: datetime
    segment_title: str = ""
    is_plan_b: bool = False
    audience: str = "participants"
    status: str = "published"


class NotificationPreferences(BaseModel):
    segment_reminders: bool = True
    time_changes: bool = True
    departure_changes: bool = True
    delays_cancellations: bool = True
    transfer_changes: bool = True
    hotel_changes: bool = True
    new_documents: bool = True
    invitations: bool = True
    own_sos: bool = True
    violations: bool = True
    plan_b: bool = True
    organizer_messages: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "23:00"
    quiet_hours_end: str = "08:00"
    timezone: str = "Europe/Moscow"


class NotificationEvent(BaseModel):
    id: str
    event_id: str
    type: NotificationType
    recipient_telegram_id: int
    trip_id: Optional[str] = None
    trip_title: str = ""
    title: Optional[str] = None
    what_changed: str = ""
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    occurred_at: datetime
    source: str = "backend"
    sos_id: Optional[str] = None
    deep_link_target: DeepLinkTarget = "trip"


class RecentTripChange(BaseModel):
    id: str
    type: str
    old_value: Optional[str] = Field(default=None, alias="oldValue")
    new_value: Optional[str] = Field(default=None, alias="newValue")
    created_at: datetime = Field(alias="createdAt")


class WeatherSnapshot(BaseModel):
    city: str
    temperature: Optional[float] = None
    conditions: str = ""
    wind_speed: Optional[float] = Field(default=None, alias="windSpeed")
    updated_at: datetime = Field(alias="updatedAt")
    source: str = "Open-Meteo"


class AssistantContext(BaseModel):
    trip: Trip
    events: list[TripEvent] = Field(default_factory=list)
    documents: list[TripDocument] = Field(default_factory=list)
    messages: list[OrganizerMessage] = Field(default_factory=list)
    own_sos: list[SosTicket] = Field(default_factory=list)
    recent_changes: list[str | RecentTripChange] = Field(default_factory=list)
    weather: list[WeatherSnapshot] = Field(default_factory=list)
