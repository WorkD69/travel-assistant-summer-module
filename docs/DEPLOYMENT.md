# Развёртывание

## 1. Vercel и Neon

1. Backend project: `travel-assistant-api`, root `backend`, stable production URL
   `https://travel-assistant-api-chi.vercel.app`.
2. Neon Marketplace resource: `travel-assistant-db`, plan `free_v3`, region
   `fra1`, Neon Auth disabled.
3. Подключить production, preview и development environments.
4. Убедиться, что `DATABASE_URL` является pooled URL, а `DIRECT_URL` — direct URL.

Никогда не выводить значения connection strings в терминальный отчёт или Git.

## 2. Backend variables

Обязательные: `NODE_ENV=production`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`,
`TRAVEL_API_SERVICE_TOKEN`, `ALLOWED_ORIGINS`, `BACKEND_PUBLIC_URL`. JWT/service
token генерируются независимо, минимум 32 случайных байта. `AI_API_KEY`
необязателен; без него Plan B остаётся deterministic.

## 3. Database

```powershell
npx prisma migrate deploy
npm run seed
```

Seed создаёт только фиксированные safe demo IDs и ровно три Plan B-кандидата. Он
не создаёт Telegram links и не переносит документы из ZIP.

## 4. Deploy и smoke

Сначала deploy backend preview, затем проверить `/api/health`, `/api/ready`,
auth/RBAC/OpenAPI и реальный `HttpTravelApiClient`. После этого обновить точный
backend URL в `frontend/vercel.json` и развернуть существующий frontend project.

## 5. Telegram switch

До отдельного подтверждения оставить `BOT_DATA_MODE=mock`. После свежего backup и
consumer smoke разрешено изменить только:

- `BOT_DATA_MODE=api`;
- `TRAVEL_API_BASE_URL`;
- `TRAVEL_API_SERVICE_TOKEN`.

Затем перезапускается только `travel-assistant-bot.service`. Telegram token,
username, frontend URL, Groq key/models, x-ui, firewall, DNS, routes и VPN ports
не меняются.
