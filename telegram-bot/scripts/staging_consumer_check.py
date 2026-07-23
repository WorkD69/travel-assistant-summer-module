"""Non-polling VPS check for the production API consumer configuration."""

from __future__ import annotations

import asyncio
import json
import sys

from dotenv import load_dotenv

from app.config import Settings
from app.services.travel_api.http_client import HttpTravelApiClient


async def main() -> None:
    load_dotenv(sys.argv[1], override=True)
    settings = Settings()
    problems = settings.validate_for_start()
    if problems:
        raise RuntimeError("configuration validation failed")
    if settings.bot_data_mode != "api" or settings.bot_update_mode != "polling":
        raise RuntimeError("unexpected bot modes")

    client = HttpTravelApiClient(
        settings.travel_api_base_url,
        settings.travel_api_service_token,
    )
    try:
        pending = await client.get_pending_notifications(limit=1)
    finally:
        await client.close()

    print(json.dumps({
        "ok": True,
        "client": "HttpTravelApiClient",
        "pending_response": isinstance(pending, list),
        "ai_provider": settings.ai_provider,
        "primary_model": settings.groq_model,
        "fallback_model": settings.groq_fallback_model,
    }))


asyncio.run(main())
