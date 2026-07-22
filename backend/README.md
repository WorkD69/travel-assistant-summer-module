# Travel Assistant API

Express API является единым источником поездок для frontend и Telegram-бота.
Данные хранятся в PostgreSQL через Prisma; SQLite бота используется только как
локальное состояние диспетчера и rollback-копия.

## Требования

- Node.js 20+;
- PostgreSQL 15+ или Neon;
- переменные из `.env.example` без добавления `.env` в Git.

## Локальный запуск

```powershell
npm ci
npx prisma validate
npx prisma migrate deploy
npm run seed
npm start
```

Safe seed требует `DEMO_ORGANIZER_PASSWORD`, `DEMO_PARTICIPANT_PASSWORD` и
`DEMO_NO_ACCESS_PASSWORD`. Их значения создаются и хранятся вне репозитория.

## Проверка

```powershell
npm test
npm audit --omit=dev
```

`telegram-bot/docs/bot-api.openapi.yaml` — неизменяемый consumer contract.
Service endpoints требуют `Authorization: Bearer …`; пользовательские bot routes
дополнительно требуют `X-Telegram-User-Id`. Browser не получает service token.

## Production

Backend разворачивается отдельным Vercel-проектом с root directory `backend`.
Runtime использует pooled `DATABASE_URL`, migrations — `DIRECT_URL`. Health:
`/api/health`; readiness с запросом к БД: `/api/ready`.
