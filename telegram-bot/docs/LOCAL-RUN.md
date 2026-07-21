# Локальный запуск на Windows

## 1. Создание Telegram-бота

1. Откройте `@BotFather` в Telegram.
2. Выполните `/newbot`, задайте отображаемое имя и username, заканчивающийся на `bot`.
3. Скопируйте token. Не отправляйте его в чат команды и не добавляйте в ZIP.

## 2. Настройка

Первый `START_BOT.bat` создаёт `.venv`, устанавливает зависимости, копирует `.env.example` в `.env` и останавливается. Заполните:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=username_без_@
BOT_ENV=development
BOT_DATA_MODE=mock
BOT_UPDATE_MODE=polling
AI_PROVIDER=mock
GEMINI_ENABLED=false
```

`.env` исключён из Git/ZIP.

## 3. Offline-проверка и запуск

- `CHECK_BOT.bat` проверяет конфигурацию, `tzdata`, импорт `app.bot`, SQLite, routers, middleware, API/mock, AI, уведомления и shutdown. Telegram polling не запускается.
- `START_BOT.bat` после успешной проверки запускает `.venv\Scripts\python.exe -m app.bot` в фоне и записывает только его PID в `bot.pid`.
- stdout: `logs\bot.stdout.log`; stderr: `logs\bot.stderr.log`.
- `STOP_BOT.bat` проверяет PID, executable path и `-m app.bot`, поэтому не завершает посторонние Python-процессы.

## 4. Проверка mock-режима

Откройте ссылки, заменив `<bot_username>`:

```text
https://t.me/<bot_username>?start=link_demo-artem
https://t.me/<bot_username>?start=link_demo-anna
```

Link token одноразовый в рамках запущенного mock dataset. Для повторного сценария перезапустите бот с чистой технической БД или используйте `/unlink` и другой неиспользованный token.

## 5. API-режим

```dotenv
BOT_DATA_MODE=api
TRAVEL_API_BASE_URL=https://backend.example
TRAVEL_API_SERVICE_TOKEN=
```

Handlers менять не требуется. До готовности backend используйте mock. Файл для backend-разработчика: `docs/bot-api.openapi.yaml`.

## Ошибки

- `TELEGRAM_BOT_TOKEN не задан` - заполните `.env`.
- `BOT_UPDATE_MODE=webhook пока не поддерживается` - верните `polling`.
- `TRAVEL_API_SERVICE_TOKEN` - нужен только в API-режиме.
- Процесс сразу завершился - откройте `logs\bot.stderr.log`.
