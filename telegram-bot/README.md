# Telegram-бот «Тревел-помощник»

Aiogram 3 Telegram Companion для привязки аккаунта сайта, просмотра доступных canonical Trips, краткого factual статуса и безопасного перехода в Web Workspace.

## Требования

- Windows 10/11;
- Python 3.12+ в `PATH`;
- Telegram-токен от [@BotFather](https://t.me/BotFather);
- интернет только для реального Telegram polling и Gemini;
- общий backend нужен только для `BOT_DATA_MODE=api`.

## Быстрый запуск на Windows

1. Запустите `START_BOT.bat`.
2. При первом запуске скрипт создаст `.venv` и `.env`, затем остановится.
3. Откройте `.env`, заполните `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME`.
4. Повторно запустите `START_BOT.bat`.
5. Для диагностики используйте `CHECK_BOT.bat`, для тестов - `RUN_TESTS.bat`, для остановки - `STOP_BOT.bat`.

Подробно: [docs/LOCAL-RUN.md](docs/LOCAL-RUN.md).

## Режимы

`BOT_DATA_MODE=mock` работает автономно: демонстрационные пользователи, поездки, события, локальные PDF, SOS, уведомления, роли и одноразовые link tokens находятся за интерфейсом `MockTravelApiClient`.

`BOT_DATA_MODE=api` включает только `HttpTravelApiClient`. Бот обращается к общему backend по REST, передаёт service token и не читает базу сайта напрямую. Контракт: [docs/bot-api.openapi.yaml](docs/bot-api.openapi.yaml).

Единственный поддерживаемый режим Telegram updates - `BOT_UPDATE_MODE=polling`. Webhook честно отмечен как post-MVP и отклоняется валидатором конфигурации.

## Команды

`/start`, `/trips`, `/help`.

V1 — короткий companion flow: `/start` → «Мои поездки» → краткий factual status → «Открыть поездку». Бот не создаёт shadow Trip, не выполняет Plan B Apply/Revert, не подтверждает покупку или перебронирование и не заявляет live monitoring от Tutu.

Для detail Trip backend может передать nullable factual `demo_disruption` только при active signal с `category=plan_b_disruption`, `source=DEMO_SIMULATION` и `status=active`. В этом случае бот использует только формулировку демо-события; он не делает provider/live-cancellation claims. Если pipeline backend не enqueue уведомление о таком signal, статус остаётся `TELEGRAM_NOTIFICATION_BACKEND_BLOCKER`.

Web переход строится через единственный существующий `WEB_APP_BASE_URL` и canonical route `trip-overview.html?tripId=<URL-encoded factual Trip ID>`. JWT, service token, selectionToken, proposal ID и другие secrets в deeplink не передаются.

## Структура

- `app/handlers/` - V1 команды и callbacks; legacy modules могут храниться локально, но не включаются в V1 router set;
- `app/services/travel_api/` - общий интерфейс, mock и HTTP реализации;
- `app/services/notifications/` - очередь, настройки, deduplication и retry;
- `app/services/ai/` - Mock/Gemini, исключения и очистка данных;
- `app/repositories/` - техническое SQLite-состояние и persistent FSM;
- `mock_backend/` - только вымышленные демонстрационные данные и PDF;
- `docs/` - запуск, безопасность, API, demo и тестовый отчёт;
- `tests/` - offline-тесты без отправки реальных Telegram-сообщений.

## Gemini

По умолчанию `AI_PROVIDER=mock` и ключ не нужен. Для Gemini задайте `AI_PROVIDER=gemini`, `GEMINI_ENABLED=true`, `GEMINI_API_KEY` и `GEMINI_MODEL`. Ошибка AI не останавливает остальные команды. Подробно: [docs/GEMINI.md](docs/GEMINI.md).

## Ограничения

- Live polling нельзя считать проверенным без настоящего Telegram token.
- Полный end-to-end API-режим требует готового общего backend.
- Финальный production origin Web Workspace определяется значением `WEB_APP_BASE_URL`; V1 использует существующий `trip-overview.html?tripId=<tripId>` и не меняет frontend production code.
- SQLite FSM предназначен для одного локального процесса бота, не для горизонтального кластера.

Безопасность: [docs/SECURITY.md](docs/SECURITY.md). Demo защиты: [docs/DEMO-SCENARIO.md](docs/DEMO-SCENARIO.md). Актуальные результаты: [docs/TEST-REPORT.md](docs/TEST-REPORT.md).
