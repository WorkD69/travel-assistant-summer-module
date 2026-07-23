import json
import subprocess
import sys
from pathlib import Path


def test_secure_env_update_preserves_existing_secrets_and_is_silent(tmp_path: Path):
    env_file = tmp_path / "travel-assistant-bot.env"
    env_file.write_text(
        "TELEGRAM_BOT_TOKEN=existing-telegram-secret\n"
        "GROQ_API_KEY=existing-groq-secret\n"
        "BOT_DATA_MODE=mock\n"
        "TRAVEL_API_BASE_URL=https://old.example\n",
        encoding="utf-8",
    )
    updates = {
        "BOT_DATA_MODE": "api",
        "BOT_UPDATE_MODE": "polling",
        "TELEGRAM_BOT_USERNAME": "travel_assistent10_bot",
        "TRAVEL_API_BASE_URL": (
            "https://travel-assistant-teammate-backend-production.up.railway.app"
        ),
        "TRAVEL_API_SERVICE_TOKEN": "shared-service-secret",
    }

    result = subprocess.run(
        [sys.executable, "scripts/update_env_file.py", str(env_file)],
        input=json.dumps(updates),
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert result.stdout == ""
    assert result.stderr == ""
    updated = env_file.read_text(encoding="utf-8")
    assert "TELEGRAM_BOT_TOKEN=existing-telegram-secret" in updated
    assert "GROQ_API_KEY=existing-groq-secret" in updated
    for key, value in updates.items():
        assert updated.count(f"{key}=") == 1
        assert f"{key}={value}" in updated
