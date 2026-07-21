"""Windows packaging, timezone, scripts, and documentation checks."""
from __future__ import annotations

from pathlib import Path
from zoneinfo import ZoneInfo

from app.config import Settings

ROOT = Path(__file__).resolve().parents[1]


def test_windows_timezone_database_contains_demo_zones() -> None:
    assert ZoneInfo("Europe/Moscow").key == "Europe/Moscow"
    assert ZoneInfo("Europe/Istanbul").key == "Europe/Istanbul"
    assert ZoneInfo("Europe/Berlin").key == "Europe/Berlin"


def test_invalid_timezone_uses_utc_fallback() -> None:
    from app.utils.timezones import safe_zoneinfo

    assert safe_zoneinfo("Invalid/Timezone").key == "UTC"


def test_requirements_include_windows_and_contract_dependencies() -> None:
    requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8").lower()

    assert "tzdata" in requirements
    assert "pyyaml" in requirements
    assert "openapi-spec-validator" in requirements
    assert "httpx[socks]" in requirements


def test_env_example_has_safe_demo_defaults_and_all_modes() -> None:
    text = (ROOT / ".env.example").read_text(encoding="utf-8")

    assert "BOT_ENV=development" in text
    assert "BOT_DATA_MODE=mock" in text
    assert "BOT_UPDATE_MODE=polling" in text
    assert "AI_PROVIDER=mock" in text
    assert "GEMINI_ENABLED=false" in text
    assert "TELEGRAM_BOT_TOKEN=" in text
    assert "TRAVEL_API_SERVICE_TOKEN=" in text


def test_env_example_documents_non_secret_groq_settings_only() -> None:
    text = (ROOT / ".env.example").read_text(encoding="utf-8")

    for setting in (
        "GROQ_BASE_URL=https://api.groq.com/openai/v1",
        "GROQ_MODEL=llama-3.3-70b-versatile",
        "GROQ_FALLBACK_MODEL=openai/gpt-oss-20b",
        "GROQ_PROXY_URL=",
        "AI_FALLBACK_TO_MOCK=true",
        "AI_TIMEOUT_SECONDS=20",
        "AI_MAX_RETRIES=1",
        "AI_MAX_HISTORY_MESSAGES=8",
        "AI_MAX_CONTEXT_CHARACTERS=16000",
        "AI_MAX_OUTPUT_TOKENS=700",
    ):
        assert setting in text
    assert "GROQ_API_KEY" not in text
    assert "gsk_" not in text
    assert "127.0.0.1:10808" not in text
    assert (ROOT / "docs" / "GROQ.md").is_file()


def test_settings_defaults_are_offline_safe() -> None:
    settings = Settings(_env_file=None)

    assert settings.bot_data_mode == "mock"
    assert settings.bot_update_mode == "polling"
    assert settings.ai_provider == "mock"
    assert settings.gemini_enabled is False


def test_windows_scripts_exist_and_target_only_this_bot() -> None:
    required = ["START_BOT.bat", "STOP_BOT.bat", "CHECK_BOT.bat", "RUN_TESTS.bat"]
    for filename in required:
        assert (ROOT / filename).is_file(), filename

    start = (ROOT / "START_BOT.bat").read_text(encoding="utf-8").lower()
    stop = (ROOT / "STOP_BOT.bat").read_text(encoding="utf-8").lower()
    check = (ROOT / "CHECK_BOT.bat").read_text(encoding="utf-8").lower()
    assert "python -m app.bot" in start or "-m app.bot" in start
    assert "bot.pid" in start
    assert "bot.pid" in stop
    assert "taskkill /f /im python.exe" not in stop
    assert "scripts\\check_bot.py" in check


def test_start_script_persists_pid_before_launcher_shell_exits() -> None:
    start = (ROOT / "START_BOT.bat").read_text(encoding="utf-8").lower()

    assert "set-content" in start
    assert "bot.pid" in start
    assert "[environment]::exit(0)" in start


def test_required_documentation_exists() -> None:
    required = [
        "README.md",
        "docs/LOCAL-RUN.md",
        "docs/TELEGRAM-FUNCTIONS.md",
        "docs/BOT-BACKEND-CONTRACT.md",
        "docs/bot-api.openapi.yaml",
        "docs/GEMINI.md",
        "docs/SECURITY.md",
        "docs/DEMO-SCENARIO.md",
        "docs/TEST-REPORT.md",
        "docs/KNOWN-ISSUES.md",
        "docs/INTEGRATION-CHECKLIST.md",
    ]
    for relative in required:
        assert (ROOT / relative).is_file(), relative


def test_archive_verifier_exists() -> None:
    assert (ROOT / "scripts" / "verify_archive.py").is_file()


def test_known_issues_contains_exact_frozen_frontend_limitation() -> None:
    text = (ROOT / "docs" / "KNOWN-ISSUES.md").read_text(encoding="utf-8")
    expected = (
        "Текущая версия frontend не обрабатывает query-параметр tab. "
        "Deep link открывает рабочее пространство нужной поездки, после чего "
        "пользователь выбирает вкладку вручную. Исправление маршрутизации frontend "
        "отложено, поскольку frontend зафиксирован и параллельно интегрируется с backend"
    )

    assert expected in text


def test_gitignore_excludes_runtime_secrets_and_caches() -> None:
    text = (ROOT / ".gitignore").read_text(encoding="utf-8")

    for entry in (".env", ".venv/", "__pycache__/", ".pytest_cache/", "*.log", "bot.pid"):
        assert entry in text
