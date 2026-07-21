# Тревел-помощник

Монорепозиторий объединяет финальный статический frontend и безопасную копию
исходников Telegram-бота. Общий backend разрабатывается отдельно и будет
добавлен после стабилизации API-контракта.

## Структура

- `frontend/` — статическое HTML/CSS/JavaScript-приложение;
- `telegram-bot/` — Telegram-бот на Aiogram 3;
- `docs/` — документация монорепозитория;
- `backend/` — зарезервированное будущее направление, сейчас каталога нет.

## Архитектура

```text
Frontend ───────┐
                ├── Backend ─── Database
Telegram Bot ───┘
```

Сейчас frontend использует демонстрационное состояние в браузере, Telegram-бот
получает данные через `MockTravelApiClient` при `BOT_DATA_MODE=mock`, а его
AI-функции работают через Groq с безопасным локальным fallback. После готовности
backend frontend и бот должны перейти на единый API; для бота предусмотрен
`BOT_DATA_MODE=api`.

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

## Развёртывание

Vercel публикует только каталог `frontend` как статический проект с Framework
Preset `Other`. Telegram-бот на Vercel не запускается. Backend на Vercel в рамках
этой версии не создаётся.
