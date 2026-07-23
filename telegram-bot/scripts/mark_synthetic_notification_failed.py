"""Remove a synthetic E2E notification from the live delivery queue."""

from __future__ import annotations

import asyncio
import json
import sys

from dotenv import load_dotenv

from app.config import Settings
from app.services.travel_api.http_client import HttpTravelApiClient


async def main() -> None:
    load_dotenv("/etc/travel-assistant-bot.env", override=True)
    settings = Settings()
    client = HttpTravelApiClient(
        settings.travel_api_base_url,
        settings.travel_api_service_token,
    )
    try:
        await client.mark_notification_failed(sys.argv[1], "synthetic_e2e_chat_not_found")
    finally:
        await client.close()
    print(json.dumps({"ok": True, "synthetic_notification_removed": True}))


asyncio.run(main())
