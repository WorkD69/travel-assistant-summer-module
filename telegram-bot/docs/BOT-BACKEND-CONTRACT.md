# Контракт бот ↔ backend

Источник истины: [bot-api.openapi.yaml](bot-api.openapi.yaml), OpenAPI 3.1.

## Архитектура

```text
Сайт → общий backend API ← Telegram-бот
```

Бот не читает localStorage сайта и не имеет отдельной production-копии поездок. `HttpTravelApiClient` использует только REST. Переключение `mock`/`api` не меняет handlers.

## Аутентификация

Все запросы: `Authorization: Bearer <TRAVEL_API_SERVICE_TOKEN>`. Пользовательские операции также передают `X-Telegram-User-Id`. Это числовой Telegram ID, а не доверенная роль: backend заново определяет привязку, membership и permissions.

Link token одноразовый, короткоживущий и не является site JWT. SOS требует `Idempotency-Key`.

## Ошибки

Backend возвращает JSON:

```json
{"error":{"code":"access_denied","message_ru":"Недостаточно прав."}}
```

Поддержаны 401, 403, 404, 409, 422, 429 и 5xx. GET имеет ограниченный retry; POST автоматически не повторяется.

## Pagination

Списки принимают `cursor` и `limit` (1..100), возвращают `items` и `next_cursor`. Клиент собирает страницы для handlers и защищён от cursor loop.

## Что требует готового backend

Реальные аккаунты/link tokens, поездки, события, временные ссылки документов, сообщения/Plan B, SOS и его статусы, preferences, очередь/ack уведомлений и assistant context. До готовности этих endpoints демонстрация выполняется в mock mode.

Передайте backend-разработчику файл `docs/bot-api.openapi.yaml` и checklist `docs/INTEGRATION-CHECKLIST.md`.
