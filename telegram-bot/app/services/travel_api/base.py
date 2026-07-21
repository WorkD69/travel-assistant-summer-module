"""Абстрактный интерфейс TravelApiClient.

Handlers работают ТОЛЬКО через этот интерфейс. Переключение mock -> api меняет
только реализацию (MockTravelApiClient / HttpTravelApiClient), но не handlers.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from app.schemas.models import (
    AssistantContext,
    BotUser,
    DocumentDownload,
    LinkResult,
    NotificationEvent,
    NotificationPreferences,
    OrganizerMessage,
    SosTicket,
    Trip,
    TripDocument,
    TripEvent,
)


class TravelApiClient(ABC):
    # --- привязка ---
    @abstractmethod
    async def consume_link_token(self, telegram_user_id: int, token: str) -> LinkResult: ...

    @abstractmethod
    async def unlink(self, telegram_user_id: int) -> None: ...

    @abstractmethod
    async def get_me(self, telegram_user_id: int) -> BotUser: ...

    # --- поездки ---
    @abstractmethod
    async def get_trips(self, telegram_user_id: int) -> list[Trip]: ...

    @abstractmethod
    async def get_trips_history(self, telegram_user_id: int) -> list[Trip]: ...

    @abstractmethod
    async def get_trip(self, telegram_user_id: int, trip_id: str) -> Trip: ...

    @abstractmethod
    async def select_active_trip(self, telegram_user_id: int, trip_id: str) -> None: ...

    # --- события ---
    @abstractmethod
    async def get_today(self, telegram_user_id: int, trip_id: str) -> list[TripEvent]: ...

    @abstractmethod
    async def get_next_event(self, telegram_user_id: int, trip_id: str) -> Optional[TripEvent]: ...

    # --- документы ---
    @abstractmethod
    async def get_documents(self, telegram_user_id: int, trip_id: str) -> list[TripDocument]: ...

    @abstractmethod
    async def get_document_download(
        self, telegram_user_id: int, document_id: str
    ) -> DocumentDownload: ...

    # --- сообщения организатора ---
    @abstractmethod
    async def get_messages(self, telegram_user_id: int, trip_id: str) -> list[OrganizerMessage]: ...

    # --- SOS ---
    @abstractmethod
    async def create_sos(
        self,
        telegram_user_id: int,
        trip_id: str,
        segment_id: Optional[str],
        category: str,
        description: str,
        idempotency_key: str,
    ) -> SosTicket: ...

    @abstractmethod
    async def get_my_sos(self, telegram_user_id: int, trip_id: str) -> list[SosTicket]: ...

    @abstractmethod
    async def get_sos(self, telegram_user_id: int, sos_id: str) -> SosTicket: ...

    # --- настройки уведомлений ---
    @abstractmethod
    async def get_notification_preferences(
        self, telegram_user_id: int
    ) -> NotificationPreferences: ...

    @abstractmethod
    async def update_notification_preferences(
        self, telegram_user_id: int, updates: dict
    ) -> NotificationPreferences: ...

    # --- очередь уведомлений ---
    @abstractmethod
    async def get_pending_notifications(self, limit: int = 50) -> list[NotificationEvent]: ...

    @abstractmethod
    async def confirm_notification_delivered(self, notification_id: str) -> None: ...

    @abstractmethod
    async def mark_notification_failed(self, notification_id: str, reason: str = "") -> None: ...

    # --- AI ---
    @abstractmethod
    async def get_assistant_context(
        self, telegram_user_id: int, trip_id: str
    ) -> AssistantContext: ...

    async def close(self) -> None:  # pragma: no cover
        return None
