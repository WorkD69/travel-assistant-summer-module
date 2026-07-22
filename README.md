# Тревел-помощник

Монорепозиторий объединяет статический frontend, PostgreSQL-backed Express API
и Telegram-бот. Frontend и бот используют один backend и одну базу данных.

## Структура

- `frontend/` — статическое HTML/CSS/JavaScript-приложение;
- `telegram-bot/` — Telegram-бот на Aiogram 3;
- `backend/` — Express/Prisma API для сайта и Telegram-бота;
- `docs/` — архитектура, развёртывание, rollback и результаты проверок.

## Архитектура

```text
Frontend ───────┐
                ├── Backend ─── Database
Telegram Bot ───┘
```

Frontend обращается к относительному `/api`, который Vercel проксирует в отдельный
backend-проект. До явного production-переключения Telegram-бот остаётся в
`BOT_DATA_MODE=mock`; после smoke-тестов он использует тот же HTTPS API.

Frontend не должен обращаться к Groq напрямую. Браузер также не должен получать
Telegram token или backend service token.

## Локальный запуск frontend

Из каталога `frontend` запустите статический HTTP-сервер:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Затем откройте `http://127.0.0.1:8080/index.html`.

## Локальный запуск Telegram-бота

На Windows перейдите в `telegram-bot`, скопируйте `.env.example` в локальный
`.env`, заполните необходимые секреты и запустите `START_BOT.bat`. Для
диагностики используйте `CHECK_BOT.bat`, для offline-тестов — `RUN_TESTS.bat`.

Секреты хранятся только в локальном `.env` и не коммитятся. Репозиторная копия
предназначена для разработки и тестирования без реальных запросов к Telegram или
Groq.

## Локальный запуск backend

См. [`backend/README.md`](backend/README.md). Для локальной работы нужны Node.js
20+ и PostgreSQL. Секреты задаются только через локальный `.env`.

## Развёртывание

Vercel публикует `frontend` и `backend` как два отдельных проекта. Managed
PostgreSQL подключается через Neon Marketplace. Telegram-бот остаётся на VPS;
backend на VPS не размещается. Порядок действий описан в
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
