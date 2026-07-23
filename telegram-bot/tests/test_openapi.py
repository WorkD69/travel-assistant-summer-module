"""Validation and coverage checks for the backend handoff contract."""
from __future__ import annotations

from pathlib import Path

import yaml
from openapi_spec_validator import validate

CONTRACT = Path(__file__).resolve().parents[1] / "docs" / "bot-api.openapi.yaml"

REQUIRED_OPERATIONS = {
    ("post", "/api/integrations/telegram/link-token/consume"),
    ("delete", "/api/integrations/telegram"),
    ("get", "/api/bot/me"),
    ("get", "/api/bot/trips"),
    ("get", "/api/bot/trips/history"),
    ("get", "/api/bot/trips/{trip_id}"),
    ("post", "/api/bot/trips/{trip_id}/select-active"),
    ("get", "/api/bot/trips/{trip_id}/today"),
    ("get", "/api/bot/trips/{trip_id}/next"),
    ("get", "/api/bot/trips/{trip_id}/documents"),
    ("post", "/api/bot/documents/{document_id}/temporary-link"),
    ("get", "/api/bot/trips/{trip_id}/messages"),
    ("post", "/api/bot/trips/{trip_id}/sos"),
    ("get", "/api/bot/trips/{trip_id}/sos/mine"),
    ("get", "/api/bot/sos/{sos_id}"),
    ("get", "/api/bot/notification-preferences"),
    ("patch", "/api/bot/notification-preferences"),
    ("get", "/api/bot/notifications/pending"),
    ("post", "/api/bot/notifications/{notification_id}/delivered"),
    ("post", "/api/bot/notifications/{notification_id}/failed"),
    ("get", "/api/bot/trips/{trip_id}/assistant-context"),
}


def load_contract() -> dict:
    return yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))


def test_openapi_31_contract_is_valid() -> None:
    contract = load_contract()

    assert contract["openapi"].startswith("3.1.")
    validate(contract)


def test_contract_covers_every_client_operation_with_auth_roles_and_errors() -> None:
    contract = load_contract()

    for method, path in REQUIRED_OPERATIONS:
        operation = contract["paths"][path][method]
        assert operation["security"] == [{"ServiceToken": []}]
        assert operation["x-roles"]
        assert operation["responses"]
        assert "default" in operation["responses"]


def test_paginated_operations_define_cursor_and_limit() -> None:
    contract = load_contract()
    paginated_paths = {
        "/api/bot/trips",
        "/api/bot/trips/history",
        "/api/bot/trips/{trip_id}/documents",
        "/api/bot/trips/{trip_id}/messages",
        "/api/bot/trips/{trip_id}/sos/mine",
        "/api/bot/notifications/pending",
    }

    for path in paginated_paths:
        parameters = contract["paths"][path]["get"].get("parameters", [])
        refs = {parameter.get("$ref", "") for parameter in parameters}
        assert refs >= {
            "#/components/parameters/Cursor",
            "#/components/parameters/Limit",
        }


def test_sos_declares_idempotency_key() -> None:
    operation = load_contract()["paths"]["/api/bot/trips/{trip_id}/sos"]["post"]

    assert {item.get("$ref") for item in operation["parameters"]} >= {
        "#/components/parameters/TripId",
        "#/components/parameters/TelegramUserId",
        "#/components/parameters/IdempotencyKey",
    }


def test_b2_notification_and_assistant_schemas_match_live_payloads() -> None:
    contract = load_contract()
    schemas = contract["components"]["schemas"]
    pending = contract["paths"]["/api/bot/notifications/pending"]["get"]
    pending_schema = pending["responses"]["200"]["content"]["application/json"]["schema"]

    assert pending_schema == {"$ref": "#/components/schemas/NotificationPage"}
    assert schemas["NotificationPage"]["required"] == ["items", "next_cursor"]
    assert schemas["AssistantContext"]["properties"]["recent_changes"] == {
        "type": "array",
        "items": {"$ref": "#/components/schemas/RecentTripChange"},
    }
    assert schemas["AssistantContext"]["properties"]["weather"] == {
        "type": "array",
        "items": {"$ref": "#/components/schemas/WeatherSnapshot"},
    }
    assert {"members", "invitation"} <= set(
        schemas["NotificationEvent"]["properties"]["deep_link_target"]["enum"]
    )
