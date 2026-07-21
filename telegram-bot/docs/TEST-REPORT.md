# Test Report

Дата offline-прогона: 2026-07-20.

## Результаты

- `python -m pytest -q`: **109 passed**.
- `RUN_TESTS.bat`: **109 passed**, exit code 0.
- `python -m compileall -q app mock_backend scripts tests`: exit code 0.
- импорт всех модулей пакета `app`: **62 модуля**, ошибок нет.
- `CHECK_BOT.bat --no-pause`: exit code 0; конфигурация, timezone, `app.bot`, 12 routers, middleware, SQLite, API/Mock, AI, уведомления и graceful shutdown проверены.
- `START_BOT.bat --check-only`: exit code 0; Telegram polling и сеть не запускались.
- `python -m app.bot` без токена: ожидаемый exit code 1 и одна понятная ошибка настройки без traceback.
- `docs/bot-api.openapi.yaml`: проходит OpenAPI 3.1 validator в составе pytest.

Тесты покрывают реальную application factory, lifecycle `main`, регистрацию routers/middleware, mock/API adapters, handlers через mocked Telegram session, PDF, SOS, уведомления, защиту AI-истории, Gemini errors/fallback, Windows timezone, конфигурацию и deep links.

## Границы проверки

Live polling не проверен, потому что настоящий `TELEGRAM_BOT_TOKEN` не предоставлен. Для offline startup-check использован только синтетический токен, сеть Telegram не вызывалась. REST adapter проверен через `httpx.MockTransport`, без готового backend. Gemini проверен через fake provider responses, без реального API key. Frontend не изменялся; deep link открывает нужную поездку, вкладку пользователь выбирает вручную.
