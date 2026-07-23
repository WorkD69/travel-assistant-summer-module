# Deployment guide

Эта инструкция описывает процесс, но не является разрешением менять действующий
стенд. Все окружения должны быть отдельными, а секреты вводятся только через
variables целевой платформы.

## Backend

Минимальные variables:

- `NODE_ENV=production`
- `DATABASE_URL=file:/data/prod.db`
- `JWT_SECRET` — новое случайное значение
- `BOT_SERVICE_TOKEN` — новое случайное значение
- `FRONTEND_ORIGIN` — точный HTTPS origin frontend
- `PUBLIC_BASE_URL` — публичный URL backend
- `AI_BASE_URL=https://api.groq.com/openai/v1`
- `AI_API_KEY` — ключ provider
- `AI_MODEL=llama-3.3-70b-versatile`
- `TELEGRAM_BOT_USERNAME` — имя без `@`

Для Railway требуется persistent Volume с mount `/data`. Health после запуска:
`GET /api/health` должен вернуть HTTP 200 и `ok=true`.

### Новая база

`npm start` выполняет `prisma db push --skip-generate` и запускает server.
Для production предпочтительнее вынести изменение схемы в отдельный
контролируемый release step.

### Обновление существующей B до B2

1. Остановить записи или обеспечить maintenance window.
2. Скопировать `prod.db`, `-wal` и `-shm` при их наличии.
3. Проверить SHA-256 копии.
4. Выполнить migration dry-run только на копии.
5. Проверить Prisma client, schema и критические API flows.
6. Применять к исходной базе только после отдельного подтверждения.

## Frontend

`frontend/` — статический Vercel project. До публикации задайте корректный API
base через существующий runtime/config mechanism, затем проверьте login, trip
persistence, CORS и service-worker cache. Preview проверяется до promotion.

## Telegram

Бот запускается отдельно от backend. Нужны:

- `TELEGRAM_BOT_TOKEN` только в bot environment;
- `BOT_DATA_MODE=api`;
- `BOT_UPDATE_MODE=polling`;
- `TRAVEL_API_BASE_URL`;
- `TRAVEL_API_SERVICE_TOKEN`, точно равный backend `BOT_SERVICE_TOKEN`;
- `WEB_APP_BASE_URL`.

Перед start остановите предыдущий consumer и убедитесь, что с этим token не
работает второй polling process. `TELEGRAM_BOT_TOKEN` нельзя копировать в
backend.

## Smoke

- health 200/ok/ai;
- registration/login;
- существующая поездка и route persistence после refresh;
- Telegram notification и новый маршрут;
- AI route/weather;
- три разных Plan B и применение одного;
- один Telegram polling process, без 409/traceback/restart loop.

