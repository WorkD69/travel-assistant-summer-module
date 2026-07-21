# Единая интеграция frontend, backend и Telegram-бота

Дата: 2026-07-22
Статус: утверждено пользователем

## Цель

Объединить существующий статический frontend, Telegram-бот на Ubuntu VPS и
очищенный backend сокомандника в одну production-систему с общим backend API и
постоянной PostgreSQL-базой. Работа считается завершённой только после
автоматических, staging и live end-to-end проверок.

## Зафиксированный baseline

- Монорепозиторий: `C:\Projects\travel-assistant-monorepo`.
- Исходный commit: `5df7b66d38d5ec90ac09a78633224db47404e0d5`.
- Frontend: `https://travel-assistant-summer-module.vercel.app`.
- Исходный frontend deployment: `dpl_95cFvSBzxw5AztkYwyt6tRhBF5HH`.
- Telegram-бот: systemd-сервис `travel-assistant-bot.service` на существующем
  Ubuntu VPS, один polling-процесс, исходный `BOT_DATA_MODE=mock`.
- VPN: `x-ui.service`; его конфигурация, порты, firewall, маршруты и DNS не
  входят в область изменений.
- В SQLite бота сохранены две связи с site user IDs `u-artem` и `u-anna`.
- Локальные и VPS backup уже созданы в путях, указанных в задании.

## Выбранная архитектура

```text
Browser
  │ https://travel-assistant-summer-module.vercel.app/api/*
  ▼
Frontend Vercel rewrite
  │ HTTPS
  ▼
Backend Vercel project: travel-assistant-api
  │ pooled PostgreSQL connection
  ▼
Neon managed PostgreSQL, free tier
  ▲
  │ HTTPS + service Bearer + X-Telegram-User-Id
Telegram bot on the existing VPS
```

Frontend и backend остаются разными Vercel-проектами. Браузер обращается к
относительному `/api/*`; frontend-проект проксирует этот путь на backend.
Telegram-бот использует прямой HTTPS URL backend. Node/Express backend не
размещается на VPS и не требует изменений VPN.

## Границы компонентов

### Frontend

Текущий `frontend/` остаётся визуальным источником истины. Из версии в ZIP
переносятся только необходимые идеи API-интеграции. Не переносятся hardcoded
credentials, localhost fallback, скрытый auto-login и небезопасные синхронизаторы,
которые молча подавляют ошибки или выполняют organizer mutations для участника.

Frontend получает session state, список поездок и trip data из backend. Локальное
состояние используется только как UI cache/offline snapshot и не считается
production-источником поездки. После refresh авторизация восстанавливается через
HttpOnly cookie и `/api/auth/me`.

### Backend

Backend создаётся в `backend/` монорепозитория как Express-приложение для Node.js
Vercel Function. Код разделяется на небольшие слои:

- config/startup validation;
- Prisma repositories и транзакции;
- site session authentication;
- Telegram service authentication;
- centralized role/object authorization;
- site routes;
- bot OpenAPI routes;
- SOS/Plan B/outbox domain services;
- document access и temporary links;
- assistant-context filtering;
- health/readiness и безопасный error middleware.

Backend — единственный production-источник пользователей, membership, ролей,
поездок, событий, документов, monitoring, Plan B, сообщений, SOS, Telegram links,
active trip state и notification outbox.

### Telegram-бот

Handlers и `HttpTravelApiClient` сохраняют существующий контракт. До полного
consumer smoke бот остаётся в `BOT_DATA_MODE=mock`. После production approval в
env меняются только `BOT_DATA_MODE`, `TRAVEL_API_BASE_URL` и новый
`TRAVEL_API_SERVICE_TOKEN`; Telegram token, username, Groq key, модели, AI provider
и frontend URL остаются неизменными.

## Аутентификация и безопасность

### Site authentication

- Пароли хешируются `bcryptjs`; plaintext никогда не сохраняется.
- JWT подписывается новым случайным `JWT_SECRET` и передаётся только в cookie
  `travel_session` с `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- Production login/register не возвращают JWT в JSON.
- State-changing cookie routes проверяют `Origin` против allowlist.
- Production CORS разрешает только точные известные frontend origins. Запросы
  бота без browser Origin обрабатываются отдельной service-auth цепочкой.
- Login имеет rate limit и единый ответ для неверного email/пароля.
- При отсутствии `DATABASE_URL`, `JWT_SECRET` или `TRAVEL_API_SERVICE_TOKEN`
  production startup завершается ошибкой до обработки запросов.

### Telegram service authentication

- `TRAVEL_API_SERVICE_TOKEN` генерируется отдельно и хранится только в Vercel env
  и защищённом env Telegram-бота.
- Сравнение service token выполняется constant-time после нормализации длины.
- `X-Telegram-User-Id` валидируется как положительная десятичная строка.
- Backend находит активную `TelegramAccountLink`, затем site user, membership и
  роль; присланная клиентом роль игнорируется.
- Link tokens и document download tokens хранятся только в SHA-256 hash-виде.

### Секреты

Секреты из ZIP считаются раскрытыми и не переносятся. Backend AI key из ZIP
отличается от рабочего Groq key бота; отзывается только backend key. Новый JWT и
service token генерируются без вывода значений и сохраняются вне Git. Новый
backend Groq key вводится только через безопасный интерактивный шаг. Отсутствие
backend Groq key не блокирует deterministic Plan B и Telegram AI context.

## PostgreSQL и модель данных

Prisma использует PostgreSQL datasource с pooled `DATABASE_URL` для runtime и
`DIRECT_URL` для migrations, если Neon выдаёт отдельный direct URL. Схема
создаётся только миграциями.

Основные модели:

- `User`, `Trip`, `Participant`, `Invitation`;
- `TripEvent`, `MonitoringSignal`, `TripPlan`;
- `Document`, `DocumentBlob`, `DocumentDownloadToken`;
- `Message`, `OfflineCopy`, `AssistantMessage`;
- `TelegramAccountLink`, `TelegramLinkToken`, `BotUserState`;
- `SosTicket`, `NotificationPreference`, `NotificationEvent`.

Telegram ID хранится строкой, чтобы не потерять точность JavaScript number.
SOS имеет unique constraint по `(authorUserId, idempotencyKey)`. Notification
event имеет глобально уникальный `eventId`; delivered/failed transitions
идемпотентны. Все child mutations дополнительно связывают object ID с trip ID,
что закрывает cross-trip IDOR.

Детерминированный seed создаёт `u-artem`, `u-anna`, no-access пользователя,
`trip-turkey-2026`, маршрутные события, безопасные документы, incident, ровно три
кандидата Plan B, одно опубликованное решение/сообщение и notification settings.
Пароли генерируются локально и передаются через файл вне репозитория.

Две Telegram-привязки, active trip и допустимые notification preferences
переносятся отдельным защищённым migration script из backup SQLite бота после
staging smoke. Telegram IDs не попадают в seed, Git или отчёт.

## RBAC и object authorization

Каждый trip request загружает access context: owner, membership, membership
status и normalized role.

- Organizer: trip mutations, participants/invitations, monitoring confirmation,
  создание/выбор/публикация Plan B, message publication, document visibility,
  просмотр SOS, complete/delete trip.
- Participant: разрешённое чтение, published messages/Plan B, доступные
  документы, собственный SOS и собственный assistant context.
- Viewer: только разрешённое чтение.
- No Access: одинаковый `404`/safe envelope без раскрытия существования или
  метаданных поездки.

Participant/viewer не могут выполнять organizer actions. Draft/internal data,
organizer-only documents и чужие SOS фильтруются в query/service слое, а не во
frontend.

## API

### Site API

Сохраняются необходимые маршруты ZIP для auth, trips, participants, invitations,
documents, messages, offline data, geo/weather и monitoring. Добавляются site
routes для incident confirmation, SOS organizer view и Plan B publication.
Monitoring никогда не создаёт поездку по произвольному `tripId`.

### Bot API

`telegram-bot/docs/bot-api.openapi.yaml` является неизменяемым consumer
contract. Backend реализует все перечисленные operations, cursor pagination,
header requirements, schemas и `ErrorEnvelope` без переименования полей.

Temporary document URL содержит только opaque token, имеет короткий TTL,
проверяет revoke/expiry и повторно проверяет права связанного пользователя при
скачивании. SOS требует `Idempotency-Key`. Pending notification polling и
acknowledgement не создают дубликатов.

## SOS, Plan B и notification flow

1. Участник отправляет SOS через bot.
2. Backend атомарно создаёт или возвращает существующий SOS по idempotency key.
3. Организатор видит SOS на сайте и подтверждает incident.
4. Backend возвращает ровно три distinct Plan B. Без backend Groq используются
   безопасные deterministic templates; Groq может улучшить текст, но не меняет
   число вариантов и не применяет решение.
5. Только организатор выбирает и публикует один Plan B.
6. В одной транзакции сохраняются selected plan, published message и outbox
   events для связанных Telegram-пользователей.
7. Bot poller получает pending events и идемпотентно отмечает delivered/failed.

## AI context

Telegram продолжает цепочку Groq
`llama-3.3-70b-versatile -> openai/gpt-oss-20b -> MockAIProvider` с прежним
ключом. Backend endpoint `assistant-context` возвращает только разрешённые trip
данные, события, документы, published messages/Plan B, собственные SOS и
подтверждённые изменения. Секреты, drafts, internal plans, чужие SOS и закрытые
документы исключаются на backend.

AI не выполняет mutations, не применяет Plan B и не создаёт SOS.

## Документы и OCR

Основной E2E использует безопасные небольшие demo documents. Upload ограничен по
размеру и allowlist типов; файл не исполняется и не сохраняется на локальной
filesystem Vercel. Для demo допустим небольшой `Bytes` blob в PostgreSQL.

Уязвимая тяжёлая OCR-цепочка ZIP (`pdfjs-dist`, canvas, tesseract/tar) не
переносится. Ограниченный режим извлекает только безопасный plain text и
seeded metadata; PDF/image получает состояние `manual_review`, не ломая UI.
Полноценный asynchronous object-storage OCR документируется как последующее
улучшение и не блокирует защитный сценарий.

## Ошибки и наблюдаемость

- Все bot errors соответствуют OpenAPI `{"error":{"code","message_ru"}}`.
- Site errors используют тот же безопасный envelope.
- Необработанные ошибки возвращают generic 500 и correlation ID.
- Production logs не содержат Authorization, cookie, prompt, provider body,
  password, document contents или env values.
- `/api/health` проверяет процесс без раскрытия env; `/api/ready` делает bounded
  database query.
- AI requests имеют timeout, ограниченный retry только для безопасных transient
  случаев и ограничение output.

## Тестирование

Используется test-first цикл. Backend suite включает:

- startup/config, health/readiness, CORS/Origin;
- register/login/me/logout и cookie properties;
- organizer/participant/viewer/no-access matrix;
- trip CRUD и cross-trip child IDOR;
- documents visibility и temporary links;
- monitoring, incident, exactly-three Plan B и publication;
- messages draft/published;
- service auth, link token consume/unlink;
- все bot trips/history/today/next/active routes;
- SOS idempotency и own-only access;
- notification preferences, pending, delivered/failed;
- assistant context filtering;
- OpenAPI schema/response compatibility;
- migrations и deterministic seed.

Интеграционные DB tests работают только с отдельной test schema/database из env,
не содержат credentials в коде и очищают свои данные.

После backend tests запускается настоящий Python `HttpTravelApiClient` против
локального/preview backend. Затем выполняются browser tests для organizer,
participant и no-access и визуальные сравнения существующих frontend routes на
desktop/mobile.

## Deployment sequence

1. Реализовать и проверить backend локально.
2. Создать бесплатный Neon resource через Vercel Marketplace; платный план не
   выбирать.
3. Создать отдельный Vercel backend project с root `backend`.
4. Добавить env без вывода значений, применить migrations и safe seed.
5. Проверить preview HTTPS health/readiness, site smoke и bot consumer test.
6. Выполнить повторный secret/dependency scan.
7. Commit/push одинаковый SHA в GitHub и GitVerse.
8. Развернуть frontend rewrite и проверить все routes/roles/refresh.
9. Создать свежий VPS bot backup и безопасно мигрировать две links.
10. После отдельного production-switch approval изменить только три bot env
    значения и перезапустить только `travel-assistant-bot.service`.
11. Выполнить live Plan B, notification, SOS, AI context, persistence и VPN
    проверки.

## Rollback

- Frontend: promote исходный deployment либо убрать `/api/*` rewrite.
- Backend: promote предыдущий deployment; при критической ошибке frontend rewrite
  отключается, а bot не переключается или возвращается в mock.
- Telegram: восстановить `BOT_DATA_MODE=mock` из backup env и перезапустить только
  bot service. SQLite и две старые links не удаляются.
- Database: сохранить migrations, deterministic seed и pre-switch logical backup.
- VPN rollback не требуется, поскольку VPN не меняется.

## Критерии готовности

Готовность подтверждается только доказательствами: zero secret findings в Git,
zero unresolved production npm vulnerabilities, все backend/OpenAPI/consumer
tests green, Vercel backend/frontend READY, обе links доступны в PostgreSQL,
один bot polling process, API mode, успешный live Plan B/notification/SOS/AI
context, сохранение после refresh/redeployment и неизменный VPN baseline.

## Явные ограничения первой production-версии

- Полноценный OCR сканов не выполняется синхронно в Vercel Function.
- Backend Groq требует новый отдельный ключ; без него Plan B остаётся
  deterministic, а Telegram AI продолжает работать через существующий bot Groq.
- Бесплатный Neon может иметь cold start; readiness и retry учитывают это, но
  платный тариф без отдельного подтверждения не подключается.
