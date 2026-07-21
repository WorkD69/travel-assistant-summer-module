"""Фабрика TravelApiClient по BOT_DATA_MODE."""
from __future__ import annotations

from app.config import Settings
from app.services.travel_api.base import TravelApiClient


def create_travel_api_client(settings: Settings, state) -> TravelApiClient:
    if settings.is_mock:
        from app.services.travel_api.mock_client import MockTravelApiClient

        return MockTravelApiClient(state)
    from app.services.travel_api.http_client import HttpTravelApiClient

    return HttpTravelApiClient(
        base_url=settings.travel_api_base_url,
        service_token=settings.travel_api_service_token,
        timeout_seconds=settings.travel_api_timeout_seconds,
    )
