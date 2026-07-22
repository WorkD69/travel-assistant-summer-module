# Canonical Telegram bot source

This sanitized archive is derived from `travel-telegram-bot-integrated.zip`.

Use it as the canonical Telegram bot compatibility source for integration with
the teammate backend.

Compared with the earlier `travel-assistant-summer-module-main.zip`, the bot
source is identical except for:

1. `app/services/travel_api/http_client.py`:
   document download now resolves the backend temporary link, downloads the
   actual bytes to a temporary file, and returns a URL only as a fallback.
2. The integrated source contained a local `.env`; it has intentionally been
   removed from this sanitized archive.

The AI provider chain, assistant handlers, SOS handlers, document handlers,
OpenAPI contract, dependencies, and tests are otherwise unchanged.

Never add real Telegram, Groq, Gemini, backend service, or other secrets to the
archive. Configure them only through the target environment.
