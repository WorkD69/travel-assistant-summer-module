"""Regression tests for startup configuration validation."""
from __future__ import annotations

from app.config import Settings


def make_settings(**overrides) -> Settings:
    values = {
        "bot_env": "development",
        "bot_data_mode": "mock",
        "bot_update_mode": "polling",
        "telegram_bot_token": "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        "ai_provider": "mock",
        "gemini_enabled": False,
        "notification_mode": "polling",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_missing_token_returns_readable_problem() -> None:
    problems = make_settings(telegram_bot_token="").validate_for_start()

    assert isinstance(problems, list)
    assert any("TELEGRAM_BOT_TOKEN" in problem for problem in problems)


def test_api_mode_requires_service_token() -> None:
    problems = make_settings(
        bot_data_mode="api", travel_api_service_token=""
    ).validate_for_start()

    assert any("TRAVEL_API_SERVICE_TOKEN" in problem for problem in problems)


def test_unsupported_webhook_returns_readable_problem() -> None:
    problems = make_settings(bot_update_mode="webhook").validate_for_start()

    assert any("webhook" in problem.lower() for problem in problems)


def test_valid_mock_polling_configuration_has_no_problems() -> None:
    assert make_settings().validate_for_start() == []


def test_invalid_token_is_reported_before_bot_construction() -> None:
    problems = make_settings(telegram_bot_token="not-a-token").validate_for_start()

    assert any("формат TELEGRAM_BOT_TOKEN" in problem for problem in problems)


def test_invalid_modes_return_readable_problems() -> None:
    problems = make_settings(
        bot_data_mode="broken",
        bot_update_mode="broken",
        notification_mode="webhook",
        ai_provider="broken",
    ).validate_for_start()

    assert any("BOT_DATA_MODE" in problem for problem in problems)
    assert any("BOT_UPDATE_MODE" in problem for problem in problems)
    assert any("NOTIFICATION_MODE" in problem for problem in problems)
    assert any("AI_PROVIDER" in problem for problem in problems)


def test_groq_configuration_is_parsed_and_validated() -> None:
    settings = make_settings(
        ai_provider="groq",
        groq_api_key="",
        groq_base_url="https://api.groq.com/openai/v1",
        groq_model="llama-3.3-70b-versatile",
        groq_fallback_model="openai/gpt-oss-20b",
        ai_fallback_to_mock=True,
        ai_timeout_seconds=20,
        ai_max_retries=1,
        ai_max_history_messages=8,
        ai_max_context_characters=16000,
        ai_max_output_tokens=700,
    )

    assert settings.ai_provider == "groq"
    assert settings.groq_model == "llama-3.3-70b-versatile"
    assert settings.groq_fallback_model == "openai/gpt-oss-20b"
    assert settings.ai_fallback_to_mock is True
    assert settings.validate_for_start() == []


def test_default_groq_models_match_the_supported_chain() -> None:
    settings = Settings(_env_file=None)

    assert settings.groq_model == "llama-3.3-70b-versatile"
    assert settings.groq_fallback_model == "openai/gpt-oss-20b"


def test_groq_proxy_is_empty_by_default_and_parses_explicit_socks_url() -> None:
    defaults = Settings(_env_file=None)
    configured = make_settings(
        ai_provider="groq",
        groq_proxy_url="socks5://127.0.0.1:10808",
    )

    assert defaults.groq_proxy_url == ""
    assert configured.groq_proxy_url == "socks5://127.0.0.1:10808"
    assert configured.validate_for_start() == []


def test_invalid_groq_proxy_url_returns_readable_problem() -> None:
    problems = make_settings(
        ai_provider="groq",
        groq_proxy_url="file:///tmp/not-a-proxy",
    ).validate_for_start()

    assert any("GROQ_PROXY_URL" in problem for problem in problems)


def test_backend_provider_name_is_reserved_for_future_factory() -> None:
    problems = make_settings(ai_provider="backend").validate_for_start()

    assert not any("AI_PROVIDER" in problem for problem in problems)


def test_invalid_ai_limits_and_groq_url_return_readable_problems() -> None:
    problems = make_settings(
        ai_provider="groq",
        groq_base_url="file:///tmp/groq",
        ai_timeout_seconds=0,
        ai_max_retries=-1,
        ai_max_history_messages=0,
        ai_max_context_characters=0,
        ai_max_output_tokens=0,
    ).validate_for_start()

    for field in (
        "GROQ_BASE_URL",
        "AI_TIMEOUT_SECONDS",
        "AI_MAX_RETRIES",
        "AI_MAX_HISTORY_MESSAGES",
        "AI_MAX_CONTEXT_CHARACTERS",
        "AI_MAX_OUTPUT_TOKENS",
    ):
        assert any(field in problem for problem in problems)
