"""Validate cutover dotenv files without exposing any values."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def load_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value
    return result


current = load_env(Path(sys.argv[1]))
staged = load_env(Path(sys.argv[2]))
print(json.dumps({
    "bot_data_mode_api": staged.get("BOT_DATA_MODE") == "api",
    "bot_update_mode_polling": staged.get("BOT_UPDATE_MODE") == "polling",
    "username_ok": staged.get("TELEGRAM_BOT_USERNAME") == "travel_assistent10_bot",
    "base_url_ok": staged.get("TRAVEL_API_BASE_URL") == (
        "https://travel-assistant-teammate-backend-production.up.railway.app"
    ),
    "service_token_present": bool(staged.get("TRAVEL_API_SERVICE_TOKEN")),
    "telegram_token_preserved": bool(current.get("TELEGRAM_BOT_TOKEN")) and (
        staged.get("TELEGRAM_BOT_TOKEN") == current.get("TELEGRAM_BOT_TOKEN")
    ),
    "groq_key_preserved": bool(current.get("GROQ_API_KEY")) and (
        staged.get("GROQ_API_KEY") == current.get("GROQ_API_KEY")
    ),
    "ai_chain_preserved": all(
        staged.get(key) == current.get(key)
        for key in ("AI_PROVIDER", "GROQ_MODEL", "GROQ_FALLBACK_MODEL")
    ),
}))
