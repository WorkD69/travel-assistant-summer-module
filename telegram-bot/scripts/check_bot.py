"""Offline health check used by CHECK_BOT.bat; never starts Telegram polling."""
from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import Settings


async def check() -> int:
    settings = Settings()
    problems = settings.validate_for_start()
    if problems:
        for problem in problems:
            print(f"[ERROR] {problem}")
        return 1

    print("[OK] Конфигурация прочитана")
    print(f"     BOT_DATA_MODE={settings.bot_data_mode}")
    print(f"     BOT_UPDATE_MODE={settings.bot_update_mode}")
    print(f"     AI_PROVIDER={settings.ai_provider}")
    print(f"     NOTIFICATION_MODE={settings.notification_mode}")

    for timezone_name in ("Europe/Moscow", "Europe/Istanbul", "Europe/Berlin"):
        ZoneInfo(timezone_name)
    print("[OK] Windows tzdata доступна")

    from app.bot import build_application

    with tempfile.TemporaryDirectory(prefix="travel-bot-check-") as temp_dir:
        offline_settings = settings.model_copy(update={
            "database_url": f"sqlite+aiosqlite:///{Path(temp_dir) / 'check.db'}",
        })
        application = await build_application(offline_settings)
        try:
            router_names = {router.name for router in application.dispatcher.sub_routers}
            if len(router_names) < 12:
                print(f"[ERROR] Зарегистрировано слишком мало routers: {router_names}")
                return 1
            if application.notification_dispatcher is None:
                print("[ERROR] NotificationDispatcher не создан")
                return 1
            print(f"[OK] app.bot импортирован, routers={len(router_names)}")
            print("[OK] Middleware, SQLite, API/Mock, AI и уведомления созданы")
        finally:
            await application.close()

    print("[OK] Graceful shutdown выполнен")
    print("[INFO] Polling и сеть Telegram в CHECK_BOT не запускались")
    return 0


def main() -> int:
    try:
        return asyncio.run(check())
    except Exception as exc:
        print(f"[ERROR] Offline-проверка: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
