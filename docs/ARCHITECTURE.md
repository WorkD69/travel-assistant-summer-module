# Архитектура Version B2

## Компоненты

```text
Browser frontend
    │ JWT / REST
    ▼
Express backend ─── Prisma ─── SQLite (/data in Railway)
    │       │
    │       ├── Open-Meteo / geocoding
    │       ├── Groq-compatible AI endpoint
    │       └── OCR (PDF.js / Tesseract)
    │ service token
    ▼
Telegram bot (single polling consumer)
```

Frontend — статические страницы без build-time framework. `api-client.js`
добавляет JWT и согласует API errors; специализированные sync-модули
гидратируют поездки, маршруты, погоду, документы, участников и Plan B.

Backend — CommonJS Express application. Prisma инкапсулирует SQLite-модели.
Site routes работают с пользовательским JWT; bot routes требуют отдельный
Bearer service token. AI получает структурированный assistant-context, а не
только свободный текст.

Telegram-бот — Python 3.12/aiogram. `HttpTravelApiClient` реализует основной
контракт с backend; mock client и harness позволяют тестировать consumer без
реального polling. AI provider chain поддерживает Groq, Gemini и mock/fallback.

## Основные потоки

### Авторизация

Пользователь регистрируется или входит через backend, получает JWT, frontend
восстанавливает сессию и загружает принадлежащие пользователю поездки.

### Связь Telegram

Frontend запрашивает одноразовый link token. Deep link открывает бота, который
передаёт token backend с service credential. Telegram account связывается с
пользователем, после чего bot consumer читает поездки и уведомления.

### Маршрут и Plan B

Изменение маршрута сохраняется в Trip, записывает TripChange и создаёт
уведомление. Plan B service формирует три структурированно различающиеся
альтернативы, валидирует их и при применении обновляет маршрут с новой записью
изменения.

### AI

Backend подготавливает контекст поездки, маршрута и погоды и вызывает
OpenAI-compatible endpoint. Telegram имеет собственную provider chain, но при
API data mode получает факты о поездке через backend.

## Trust boundaries

- Browser ↔ backend: JWT и точный CORS allowlist.
- Telegram ↔ backend: `BOT_SERVICE_TOKEN`, отдельный от Telegram token.
- Backend ↔ AI: `AI_API_KEY` только в platform variables.
- Persisted data: SQLite Volume; миграции требуют backup/dry-run.

