"""Проверка конфигурации перед запуском (вызывается из START_BOT.bat)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings  # noqa: E402


def main() -> int:
    settings = Settings()
    problems = settings.validate_for_start()
    if problems:
        for p in problems:
            print(f"ОШИБКА НАСТРОЙКИ: {p}")
        return 1
    print(f"BOT_DATA_MODE   = {settings.bot_data_mode}")
    print(f"AI_PROVIDER     = {settings.ai_provider}"
          + ("" if settings.gemini_api_key else " (без ключа -> MockAIProvider)"))
    print(f"NOTIFICATION_MODE = {settings.notification_mode}")
    print("Логи: bot.log в корне проекта")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
