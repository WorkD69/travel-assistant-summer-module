# Travel Assistant — Version B2

Канонический исходный код учебного travel-assistant: статический web-интерфейс,
REST API на Node.js/Express, SQLite/Prisma и Telegram-бот на Python/aiogram.
Version B2 объединяет регистрацию и сессии, поездки и маршруты, приглашения,
документы и OCR, мониторинг, уведомления, AI-контекст и генерацию трёх
альтернатив Plan B.

> Репозиторий содержит исходный код демонстрационного стенда. Ссылки ниже —
> preview/staging, а не SLA-backed production. Секреты и рабочие базы в Git не
> сохраняются.

## Доступный демонстрационный стенд

- Frontend preview:
  <https://travel-assistant-teammate-preview-quon6nily-workd69s-projects.vercel.app>
- Backend staging:
  <https://travel-assistant-teammate-backend-b2-staging-staging-b2.up.railway.app>
- Telegram: [@travel_assistent10_bot](https://t.me/travel_assistent10_bot)

Состояние развертываний зафиксировано как provenance в
[`docs/B2_PROVENANCE.md`](docs/B2_PROVENANCE.md). Публикация этого репозитория
сама по себе ничего не разворачивает и не меняет.

## Состав

```text
backend/       Express API, Prisma/SQLite, AI, OCR, Plan B, Telegram contract
frontend/      статические HTML/CSS/JS страницы и browser integration
telegram-bot/  aiogram bot, HttpTravelApiClient, Groq/Gemini/mock providers
docs/          архитектура, deployment, rollback, ограничения и roadmap
scripts/       единые локальные проверки и secret scan
```

Архитектура и поток данных подробно описаны в
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), фактическая функциональность —
в [`docs/CURRENT_FUNCTIONALITY.md`](docs/CURRENT_FUNCTIONALITY.md).

## Основные сценарии

1. Пользователь регистрируется, создаёт поездку и сохраняет маршрут.
2. Организатор приглашает участника и связывает аккаунт с Telegram.
3. Изменение маршрута записывается в TripChange и notification outbox, после
   чего Telegram consumer доставляет уведомление.
4. AI отвечает с учётом маршрута и погоды, полученной через Open-Meteo.
5. Mock GDS формирует ровно три демонстрационных Plan B; пользователь
   подтверждает один вариант, backend сохраняет новый маршрут и уведомляет бота.
6. Пользователь загружает документ, запускает OCR или открывает SOS flow.

Plan B не выполняет реальную покупку, перебронирование или оплату.

## Быстрый локальный запуск

Требования: Node.js 22+, npm, Python 3.12+.

### Backend

```bash
cd backend
npm ci
cp .env.example .env
npm run prisma:generate
npm run db:push
npm run dev
```

Перед реальным запуском задайте новые `JWT_SECRET` и `BOT_SERVICE_TOKEN`.
Для AI задаются `AI_API_KEY`, `AI_BASE_URL` и `AI_MODEL`. Не коммитьте `.env`
или SQLite-файлы.

### Frontend

```bash
cd frontend
python -m http.server 8011
```

Откройте `http://localhost:8011`. API URL задаётся существующим browser runtime
механизмом (`window.TRAVEL_API_BASE`) либо конфигурацией `api-client.js` для
целевого стенда.

### Telegram-бот

```bash
cd telegram-bot
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env
python -m app.bot
```

На Linux используйте `source .venv/bin/activate`. Для безопасной локальной
проверки оставляйте `BOT_DATA_MODE=mock`; не запускайте второй polling-процесс
с токеном действующего бота.

## Проверки

PowerShell:

```powershell
.\scripts\verify.ps1
.\scripts\secret-scan.ps1
```

Bash:

```bash
./scripts/verify.sh
```

Проверки не обращаются к production, не запускают Telegram polling и не
применяют миграции к удалённой базе. Последний зафиксированный результат —
[`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

## База данных и миграции

Для новой локальной SQLite-базы применяется `npm run db:push`. SQL в
`backend/prisma/migrations/20260723_version_b2/` предназначен для контролируемого
обновления существующей B-базы до B2. Перед любым таким обновлением обязательны
копия базы, dry-run на копии и проверенный rollback. Подробности:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Безопасность

- реальные ключи, токены, cookies, базы, логи и platform link metadata
  исключены из Git;
- примеры переменных содержат только пустые или локальные значения;
- CORS в production требует явного HTTPS origin и запрещает wildcard;
- service-to-service запросы Telegram используют отдельный
  `BOT_SERVICE_TOKEN`;
- история и рабочее дерево проверяются Gitleaks.

Инструкция по раскрытию уязвимостей и ограничения — в
[`SECURITY.md`](SECURITY.md).

## Безопасное внесение изменений

Работайте в отдельной ветке, сохраняйте API-контракт всех трёх компонентов и
сначала проверяйте preview/staging. Изменение схемы тестируется на копии базы;
Telegram переключается только после остановки прежнего consumer. Перед merge
обязательны test suites и Gitleaks. CI этого репозитория ничего не deploy.

При неудачном изменении не переписывайте историю и не запускайте случайный
`prisma db push` на рабочей базе: верните заранее зафиксированные artifacts и
согласованную копию данных по [`docs/ROLLBACK.md`](docs/ROLLBACK.md).

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [Текущая функциональность](docs/CURRENT_FUNCTIONALITY.md)
- [Известные ограничения](docs/KNOWN_ISSUES.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Rollback](docs/ROLLBACK.md)
- [Roadmap](docs/ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Contribution guide](CONTRIBUTING.md)

## Правовой статус

Открытая лицензия не предоставлена. См. [`LICENSE`](LICENSE).
