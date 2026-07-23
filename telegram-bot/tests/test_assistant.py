"""Тесты ASSISTANT: контекст по правам, MockAIProvider, фолбэк без ключа, маскировка, история."""
from __future__ import annotations

import importlib
import json
import logging
import time
from types import SimpleNamespace

import httpx
import pytest

from app.config import Settings
from app.handlers.assistant import msg_assistant_question
from app.services.ai.base import (
    AIProviderError,
    AIProviderInvalidResponseError,
    AIProviderQuotaError,
    AIProviderTimeoutError,
    AIProviderUnavailableError,
)
from app.services.ai.factory import create_ai_provider
from app.services.ai.fallback import FallbackAIProvider
from app.services.ai.gemini import GeminiAIProvider
from app.services.ai.groq import GroqAIProvider
from app.services.ai.mock import MockAIProvider
from app.schemas.models import AssistantContext
from app.services.ai.sanitizer import build_safe_context, sanitize_text
from tests.helpers import ANNA_TG, link_both, make_env


class RecordingProvider:
    name = "recording"

    def __init__(self, result: str = "answer", error: Exception | None = None):
        self.result = result
        self.error = error
        self.calls = 0
        self.close_calls = 0

    async def generate(self, question, context_text, history):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.result

    async def close(self):
        self.close_calls += 1


def fallback_provider_type():
    try:
        module = importlib.import_module("app.services.ai.fallback")
    except ModuleNotFoundError:
        return None
    return getattr(module, "FallbackAIProvider", None)


def groq_provider_type():
    try:
        module = importlib.import_module("app.services.ai.groq")
    except ModuleNotFoundError:
        return None
    return getattr(module, "GroqAIProvider", None)


def make_groq_provider(transport: httpx.MockTransport | None, **overrides):
    provider_type = groq_provider_type()
    assert provider_type is not None
    values = {
        "api_key": "unit-test-key",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
        "fallback_model": "openai/gpt-oss-20b",
        "timeout_seconds": 20,
        "max_retries": 1,
        "max_history_messages": 8,
        "max_context_characters": 16000,
        "max_output_tokens": 700,
        "transport": transport,
    }
    values.update(overrides)
    return provider_type(**values)


async def test_context_contains_allowed_data():
    env = make_env()
    await link_both(env.api)
    ctx = await env.api.get_assistant_context(ANNA_TG, "t-turkey")
    assert ctx.trip.id == "t-turkey" and ctx.events
    assert "d-tickets" in {d.id for d in ctx.documents}
    assert {"m-welcome", "m-planb"} <= {m.id for m in ctx.messages}
    assert "s-100" in {s.id for s in ctx.own_sos}


async def test_context_excludes_forbidden_data():
    env = make_env()
    await link_both(env.api)
    ctx = await env.api.get_assistant_context(ANNA_TG, "t-turkey")
    doc_ids = {d.id for d in ctx.documents}
    msg_ids = {m.id for m in ctx.messages}
    assert "d-insurance-list" not in doc_ids
    assert not ({"m-supplier", "m-internal", "m-draft"} & msg_ids)


async def test_mock_ai_provider_answers_without_key():
    ai = MockAIProvider()
    answer = await ai.generate("Во сколько сегодня трансфер?",
                               "Поездка: Отпуск в Турции", [])
    assert "Демо-режим" in answer


async def test_fallback_provider_returns_labelled_mock_after_primary_error():
    provider_type = fallback_provider_type()
    assert provider_type is not None
    primary = RecordingProvider(error=AIProviderUnavailableError("offline"))
    fallback = RecordingProvider(result="MockAIProvider answer")
    provider = provider_type(primary, fallback, enabled=True)

    answer = await provider.generate("question", "context", [])

    assert "Groq" in answer
    assert "MockAIProvider" in answer
    assert primary.calls == 1
    assert fallback.calls == 1


async def test_fallback_provider_propagates_when_disabled():
    provider_type = fallback_provider_type()
    assert provider_type is not None
    error = AIProviderUnavailableError("offline")
    provider = provider_type(
        RecordingProvider(error=error), RecordingProvider(), enabled=False
    )

    with pytest.raises(AIProviderError) as raised:
        await provider.generate("question", "context", [])

    assert raised.value is error


async def test_fallback_provider_closes_each_child_once():
    provider_type = fallback_provider_type()
    assert provider_type is not None
    primary = RecordingProvider()
    fallback = RecordingProvider()
    provider = provider_type(primary, fallback, enabled=True)

    await provider.close()
    await provider.close()

    assert primary.close_calls == 1
    assert fallback.close_calls == 1


async def test_fallback_provider_labels_authentication_problem():
    provider_type = fallback_provider_type()
    assert provider_type is not None
    base = importlib.import_module("app.services.ai.base")
    auth_error_type = getattr(base, "AIProviderAuthenticationError", None)
    assert auth_error_type is not None
    provider = provider_type(
        RecordingProvider(error=auth_error_type("denied")),
        RecordingProvider(result="MockAIProvider answer"),
        enabled=True,
    )

    answer = await provider.generate("question", "context", [])

    assert "ключ" in answer.lower() or "доступ" in answer.lower()
    assert "MockAIProvider" in answer


async def test_groq_success_uses_official_chat_completions_payload():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "  Groq answer  "}}]},
        )

    provider = make_groq_provider(httpx.MockTransport(handler))
    answer = await provider.generate(
        "Когда трансфер?", "Поездка: Турция", [("user", "Старый вопрос")]
    )

    assert answer == "Groq answer"
    assert len(requests) == 1
    request = requests[0]
    assert str(request.url) == "https://api.groq.com/openai/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer unit-test-key"
    assert request.headers["Content-Type"].startswith("application/json")
    body = json.loads(request.content)
    assert body["model"] == "llama-3.3-70b-versatile"
    assert body["temperature"] == 0.2
    assert body["max_completion_tokens"] == 700
    assert body["stream"] is False
    assert body["messages"][-1] == {"role": "user", "content": "Когда трансфер?"}
    await provider.close()


async def test_groq_caps_context_and_history_before_request():
    bodies = []

    async def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    provider = make_groq_provider(
        httpx.MockTransport(handler),
        max_context_characters=12,
        max_history_messages=2,
    )
    await provider.generate(
        "question",
        "1234567890ABCDEFGHIJ",
        [("user", "one"), ("assistant", "two"), ("user", "three")],
    )

    messages = bodies[0]["messages"]
    assert "1234567890AB" in messages[1]["content"]
    assert "CDEFGHIJ" not in messages[1]["content"]
    assert messages[2:4] == [
        {"role": "assistant", "content": "two"},
        {"role": "user", "content": "three"},
    ]
    await provider.close()


async def test_groq_reuses_one_client_and_closes_idempotently():
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    provider = make_groq_provider(httpx.MockTransport(handler))
    client = provider._client

    await provider.generate("one", "context", [])
    await provider.generate("two", "context", [])
    await provider.close()
    await provider.close()

    assert provider._client is client
    assert client.is_closed is True


def test_groq_client_allows_standard_proxy_environment(monkeypatch):
    captured = {}

    class RecordingAsyncClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:18080")
    monkeypatch.setattr("app.services.ai.groq.httpx.AsyncClient", RecordingAsyncClient)

    make_groq_provider(None, proxy_url="")

    assert captured["proxy"] is None
    assert captured["trust_env"] is True


def test_groq_explicit_proxy_has_priority_and_never_contains_api_key(
    monkeypatch, caplog
):
    captured = {}

    class RecordingAsyncClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    explicit_proxy = "http://proxy-user:proxy-password@127.0.0.1:18081"
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:18080")
    monkeypatch.setattr("app.services.ai.groq.httpx.AsyncClient", RecordingAsyncClient)
    caplog.set_level(logging.INFO, logger="app.services.ai.groq")

    make_groq_provider(
        None,
        api_key="sentinel-api-key",
        proxy_url=explicit_proxy,
    )

    assert captured["proxy"] == explicit_proxy
    assert captured["trust_env"] is True
    assert "sentinel-api-key" not in repr(captured["proxy"])
    assert "proxy-user" not in caplog.text
    assert "proxy-password" not in caplog.text


def test_factory_passes_proxy_only_to_groq_provider(monkeypatch):
    captured = {}

    class RecordingGroqProvider:
        name = "groq"

        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(
        "app.services.ai.groq.GroqAIProvider", RecordingGroqProvider
    )
    settings = Settings(
        _env_file=None,
        telegram_bot_token="123:test",
        ai_provider="groq",
        groq_api_key="local-test-key",
        groq_proxy_url="socks5://127.0.0.1:10808",
        ai_fallback_to_mock=True,
    )

    provider = create_ai_provider(settings)

    assert isinstance(provider, FallbackAIProvider)
    assert captured["proxy_url"] == "socks5://127.0.0.1:10808"


@pytest.mark.parametrize("status_code", [401, 403])
async def test_groq_authentication_errors_do_not_retry(status_code):
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status_code, json={"error": {"message": "denied"}})

    provider = make_groq_provider(httpx.MockTransport(handler))
    base = importlib.import_module("app.services.ai.base")
    auth_error_type = getattr(base, "AIProviderAuthenticationError")

    with pytest.raises(auth_error_type):
        await provider.generate("question", "context", [])

    assert len(calls) == 1
    await provider.close()


async def test_groq_primary_404_switches_immediately_to_fallback_model():
    models = []
    authorizations = []

    async def handler(request: httpx.Request) -> httpx.Response:
        model = json.loads(request.content)["model"]
        models.append(model)
        authorizations.append(request.headers["Authorization"])
        if model == "llama-3.3-70b-versatile":
            return httpx.Response(404, json={"error": {"message": "missing"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": "fallback"}}]})

    provider = make_groq_provider(httpx.MockTransport(handler))

    assert await provider.generate("question", "context", []) == "fallback"
    assert models == ["llama-3.3-70b-versatile", "openai/gpt-oss-20b"]
    assert authorizations == ["Bearer unit-test-key", "Bearer unit-test-key"]
    await provider.close()


async def test_groq_gpt_oss_fallback_uses_low_reasoning_without_trace():
    bodies = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if body["model"] == "llama-3.3-70b-versatile":
            return httpx.Response(404, json={"error": {"message": "missing"}})
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "fallback"}}]},
        )

    provider = make_groq_provider(httpx.MockTransport(handler))

    assert await provider.generate("question", "context", []) == "fallback"
    assert "include_reasoning" not in bodies[0]
    assert "reasoning_effort" not in bodies[0]
    assert bodies[1]["include_reasoning"] is False
    assert bodies[1]["reasoning_effort"] == "low"
    await provider.close()


@pytest.mark.parametrize("status_code", [429, 500, 503])
async def test_groq_retryable_status_retries_then_uses_fallback_model(status_code):
    models = []

    async def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        if len(models) < 3:
            return httpx.Response(status_code, json={"error": {"message": "temporary"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": "fallback"}}]})

    provider = make_groq_provider(httpx.MockTransport(handler))

    assert await provider.generate("question", "context", []) == "fallback"
    assert models == [
        "llama-3.3-70b-versatile",
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-20b",
    ]
    await provider.close()


@pytest.mark.parametrize("error_type", [httpx.ReadTimeout, httpx.ConnectError])
async def test_groq_transport_errors_retry_then_use_fallback_model(error_type):
    models = []

    async def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        if len(models) < 3:
            raise error_type("temporary", request=request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "fallback"}}]})

    provider = make_groq_provider(httpx.MockTransport(handler))

    assert await provider.generate("question", "context", []) == "fallback"
    assert models[-1] == "openai/gpt-oss-20b"
    assert len(models) == 3
    await provider.close()


async def test_groq_invalid_response_retries_then_uses_fallback_model():
    models = []

    async def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        if len(models) < 3:
            return httpx.Response(200, json={"choices": []})
        return httpx.Response(200, json={"choices": [{"message": {"content": "fallback"}}]})

    provider = make_groq_provider(httpx.MockTransport(handler))

    assert await provider.generate("question", "context", []) == "fallback"
    assert models == [
        "llama-3.3-70b-versatile",
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-20b",
    ]
    await provider.close()


async def test_groq_exhausted_5xx_raises_typed_unavailable_error():
    models = []

    async def handler(request: httpx.Request) -> httpx.Response:
        models.append(json.loads(request.content)["model"])
        return httpx.Response(503, json={"error": {"message": "offline"}})

    provider = make_groq_provider(httpx.MockTransport(handler))

    with pytest.raises(AIProviderUnavailableError):
        await provider.generate("question", "context", [])

    assert models == [
        "llama-3.3-70b-versatile",
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-20b",
        "openai/gpt-oss-20b",
    ]
    await provider.close()


async def test_groq_logs_only_safe_request_metadata(caplog):
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 3:
            return httpx.Response(500, json={"raw": "response-secret"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    provider = make_groq_provider(
        httpx.MockTransport(handler), api_key="sentinel-api-key"
    )
    caplog.set_level(logging.INFO, logger="app.services.ai.groq")

    assert await provider.generate(
        "sentinel-question", "sentinel-context", []
    ) == "ok"

    logs = caplog.text
    for expected in (
        "provider=groq",
        "model=llama-3.3-70b-versatile",
        "status=500",
        "messages=",
        "context_chars=",
        "error=",
    ):
        assert expected in logs
    for forbidden in (
        "sentinel-api-key",
        "sentinel-question",
        "sentinel-context",
        "response-secret",
        "Authorization",
    ):
        assert forbidden not in logs
    await provider.close()


def test_factory_falls_back_to_mock_without_key():
    settings = Settings(_env_file=None, telegram_bot_token="123:test",
                        gemini_api_key="", ai_provider="gemini")
    assert isinstance(create_ai_provider(settings), MockAIProvider)


def test_factory_composes_groq_with_labelled_mock_fallback():
    settings = Settings(
        _env_file=None,
        telegram_bot_token="123:test",
        ai_provider="groq",
        groq_api_key="local-test-key",
        groq_model="llama-3.3-70b-versatile",
        groq_fallback_model="openai/gpt-oss-20b",
        ai_fallback_to_mock=True,
    )

    provider = create_ai_provider(settings)

    assert isinstance(provider, FallbackAIProvider)
    assert isinstance(provider.primary, GroqAIProvider)
    assert isinstance(provider.fallback, MockAIProvider)


def test_factory_uses_mock_without_groq_key_when_fallback_enabled():
    settings = Settings(
        _env_file=None,
        telegram_bot_token="123:test",
        ai_provider="groq",
        groq_api_key="",
        ai_fallback_to_mock=True,
    )

    assert isinstance(create_ai_provider(settings), MockAIProvider)


def test_sanitizer_masks_pii():
    masked = sanitize_text(
        "Паспорт 4510 123456, почта anna@example.test, телефон +79161234567")
    assert "4510 123456" not in masked
    assert "anna@example.test" not in masked
    assert "+79161234567" not in masked


def test_safe_context_includes_b2_route_weather() -> None:
    context = AssistantContext.model_validate(
        {
            "trip": {
                "id": "t-weather",
                "title": "Weather contract",
                "route": "Moscow - Kazan",
                "date_start": "2026-07-23",
                "date_end": "2026-07-24",
                "status": "active",
                "role": "organizer",
                "membership_status": "member",
            },
            "weather": [
                {
                    "city": "Moscow",
                    "temperature": 22,
                    "conditions": "Clear",
                    "windSpeed": 3,
                    "updatedAt": "2026-07-23T10:00:00.000Z",
                    "source": "Open-Meteo",
                }
            ],
        }
    )

    safe = build_safe_context(context)

    assert "Moscow" in safe
    assert "22" in safe
    assert "Clear" in safe
    assert "Open-Meteo" in safe


async def test_history_roundtrip_and_clear():
    env = make_env()
    await env.repo.add_assistant_message(ANNA_TG, "t-turkey", "user", "Вопрос")
    await env.repo.add_assistant_message(ANNA_TG, "t-turkey", "assistant", "Ответ")
    history = await env.repo.get_assistant_history(ANNA_TG, "t-turkey")
    assert len(history) == 2
    await env.repo.clear_assistant_history(ANNA_TG, "t-turkey")
    assert await env.repo.get_assistant_history(ANNA_TG, "t-turkey") == []


async def test_handler_sanitizes_persisted_message_and_all_reused_history():
    env = make_env()
    await link_both(env.api)
    await env.api.select_active_trip(ANNA_TG, "t-turkey")

    class RecordingAI:
        name = "recording"

        def __init__(self):
            self.calls = []

        async def generate(self, question, context_text, history):
            self.calls.append((question, context_text, list(history)))
            return "Безопасный ответ"

    class RecordingMessage:
        from_user = SimpleNamespace(id=ANNA_TG)

        def __init__(self, text):
            self.text = text

        async def answer(self, *args, **kwargs):
            return None

    ai = RecordingAI()
    secret = "anna.private@example.test"
    await msg_assistant_question(
        RecordingMessage(f"Моя почта {secret}, когда трансфер?"),
        env.api,
        ai,
        env.repo,
    )
    await msg_assistant_question(
        RecordingMessage("Повтори время"),
        env.api,
        ai,
        env.repo,
    )

    persisted = await env.repo.get_assistant_history(ANNA_TG, "t-turkey")
    second_history = ai.calls[1][2]
    assert secret not in repr(persisted)
    assert secret not in repr(second_history)
    assert "[email скрыт]" in repr(persisted)


def test_gemini_missing_key_uses_typed_error():
    with pytest.raises(AIProviderUnavailableError):
        GeminiAIProvider(api_key="", model="gemini-test")


async def test_gemini_429_uses_quota_error():
    provider = GeminiAIProvider(api_key="key", model="gemini-test")

    class Models:
        def generate_content(self, **kwargs):
            raise RuntimeError("429 RESOURCE_EXHAUSTED quota")

    provider._client = SimpleNamespace(models=Models())
    with pytest.raises(AIProviderQuotaError):
        await provider.generate("Вопрос", "Контекст", [])


async def test_gemini_timeout_uses_typed_error():
    provider = GeminiAIProvider(
        api_key="key", model="gemini-test", timeout_seconds=0.001
    )

    class Models:
        def generate_content(self, **kwargs):
            time.sleep(0.05)
            return SimpleNamespace(text="late")

    provider._client = SimpleNamespace(models=Models())
    with pytest.raises(AIProviderTimeoutError):
        await provider.generate("Вопрос", "Контекст", [])


async def test_gemini_empty_response_uses_typed_error():
    provider = GeminiAIProvider(api_key="key", model="gemini-test")
    provider._client = SimpleNamespace(
        models=SimpleNamespace(
            generate_content=lambda **kwargs: SimpleNamespace(text="   ")
        )
    )

    with pytest.raises(AIProviderInvalidResponseError):
        await provider.generate("Вопрос", "Контекст", [])
