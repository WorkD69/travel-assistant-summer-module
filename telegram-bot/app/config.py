"""Конфигурация бота. Все секреты — только через .env."""
from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlsplit
try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ModuleNotFoundError:  # pragma: no cover - запасной вариант для сред без pydantic-settings
    import os

    from pydantic import BaseModel

    def SettingsConfigDict(**kwargs):  # type: ignore[misc]
        return dict(**kwargs)

    class BaseSettings(BaseModel):  # type: ignore[no-redef]
        """Минимальная замена pydantic-settings: .env + переменные окружения."""

        def __init__(self, _env_file="__unset__", **values):
            data: dict = {}
            cfg = dict(getattr(type(self), "model_config", {}) or {})
            env_file = cfg.get("env_file") if _env_file == "__unset__" else _env_file
            if isinstance(env_file, str):
                try:
                    with open(env_file, encoding="utf-8") as fh:
                        for line in fh:
                            line = line.strip()
                            if not line or line.startswith("#") or "=" not in line:
                                continue
                            key, value = line.split("=", 1)
                            data[key.strip().lower()] = value.strip()
                except OSError:
                    pass
            for name in type(self).model_fields:
                if name.upper() in os.environ:
                    data[name] = os.environ[name.upper()]
            data = {k: v for k, v in data.items() if k in type(self).model_fields}
            data.update(values)
            super().__init__(**data)


class ConfigError(RuntimeError):
    """Понятная ошибка настройки, показывается при старте."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    bot_env: str = "development"
    bot_data_mode: str = "mock"
    bot_update_mode: str = "polling"

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""

    travel_api_base_url: str = "http://localhost:8000"
    travel_api_service_token: str = ""
    travel_api_timeout_seconds: float = 15

    web_app_base_url: str = "http://localhost:8011"

    gemini_enabled: bool = False
    gemini_api_key: str = ""
    gemini_model: str = ""
    ai_provider: str = "mock"
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_proxy_url: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_fallback_model: str = "openai/gpt-oss-20b"
    ai_fallback_to_mock: bool = True
    ai_timeout_seconds: float = 20
    ai_max_retries: int = 1
    ai_max_history_messages: int = 8
    ai_max_context_characters: int = 16000
    ai_max_output_tokens: int = 700

    notification_mode: str = "polling"
    notification_poll_interval_seconds: float = 10

    database_url: str = "sqlite+aiosqlite:///./bot_state.db"
    log_level: str = "INFO"

    @property
    def is_development(self) -> bool:
        return self.bot_env == "development"

    @property
    def is_mock(self) -> bool:
        return self.bot_data_mode == "mock"

    @property
    def demo_enabled(self) -> bool:
        """/demo доступна только в development + mock."""
        return self.is_development and self.is_mock

    @property
    def sqlite_path(self) -> str:
        url = self.database_url
        if "///" in url:
            return url.split("///", 1)[1]
        return "./bot_state.db"

    def validate_for_start(self) -> list[str]:
        problems: list[str] = []
        if not self.telegram_bot_token:
            problems.append(
                "TELEGRAM_BOT_TOKEN не задан. Откройте файл .env и вставьте токен, "
                "полученный у @BotFather (команда /newbot)."
            )
        else:
            try:
                from aiogram.utils.token import validate_token

                validate_token(self.telegram_bot_token)
            except Exception:
                problems.append(
                    "Неверный формат TELEGRAM_BOT_TOKEN. Скопируйте token целиком из @BotFather."
                )
        if self.bot_env not in {"development", "production"}:
            problems.append("BOT_ENV должен быть development или production.")
        if self.bot_data_mode not in {"mock", "api"}:
            problems.append("BOT_DATA_MODE должен быть mock или api.")
        if not self.is_mock and not self.travel_api_service_token:
            problems.append(
                "BOT_DATA_MODE=api требует TRAVEL_API_SERVICE_TOKEN. "
                "Запросите служебный токен у backend-разработчика и добавьте в .env."
            )
        if self.bot_update_mode == "webhook":
            problems.append(
                "BOT_UPDATE_MODE=webhook пока не поддерживается. "
                "Для текущей версии установите BOT_UPDATE_MODE=polling."
            )
        elif self.bot_update_mode != "polling":
            problems.append("BOT_UPDATE_MODE должен быть polling.")
        if self.notification_mode != "polling":
            problems.append("NOTIFICATION_MODE должен быть polling.")
        if self.ai_provider not in {"mock", "gemini", "groq", "backend"}:
            problems.append("AI_PROVIDER должен быть mock, gemini, groq или backend.")
        if self.ai_provider == "groq":
            if self.groq_proxy_url:
                try:
                    proxy = urlsplit(self.groq_proxy_url)
                    proxy_port = proxy.port
                except ValueError:
                    proxy = None
                    proxy_port = None
                if (
                    proxy is None
                    or proxy.scheme not in {"http", "https", "socks5"}
                    or not proxy.hostname
                    or proxy_port is None
                ):
                    problems.append(
                        "GROQ_PROXY_URL must be an HTTP(S) or SOCKS5 URL with a port."
                    )
            if not self.groq_base_url.startswith(("http://", "https://")):
                problems.append("GROQ_BASE_URL должен быть HTTP(S)-адресом.")
            if not self.groq_model:
                problems.append("GROQ_MODEL не задан.")
            if not self.groq_fallback_model:
                problems.append("GROQ_FALLBACK_MODEL не задан.")
            if not self.groq_api_key and not self.ai_fallback_to_mock:
                problems.append(
                    "GROQ_API_KEY не задан, а AI_FALLBACK_TO_MOCK отключён."
                )
        if self.ai_timeout_seconds <= 0:
            problems.append("AI_TIMEOUT_SECONDS должен быть больше нуля.")
        if self.ai_max_retries < 0:
            problems.append("AI_MAX_RETRIES не может быть отрицательным.")
        if self.ai_max_history_messages <= 0:
            problems.append("AI_MAX_HISTORY_MESSAGES должен быть больше нуля.")
        if self.ai_max_context_characters <= 0:
            problems.append("AI_MAX_CONTEXT_CHARACTERS должен быть больше нуля.")
        if self.ai_max_output_tokens <= 0:
            problems.append("AI_MAX_OUTPUT_TOKENS должен быть больше нуля.")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
