# Архитектура production

```text
Browser ── /api rewrite ──┐
                          ├─ Vercel Express API ── Neon PostgreSQL
Telegram bot ── HTTPS ────┘
```

Frontend и backend — разные Vercel-проекты. Frontend не знает прямой database,
Telegram или AI secret. Cookie-authenticated site routes находятся в
`/api/site/*`, service-authenticated bot routes реализуют все operations из
`telegram-bot/docs/bot-api.openapi.yaml`.

PostgreSQL хранит пользователей, membership/RBAC, поездки, события, документы,
monitoring, три Plan B-кандидата, сообщения, SOS, Telegram links/state,
предпочтения и notification outbox. Значения Telegram ID хранятся строками.

Organizer управляет поездкой и публикациями. Participant читает разрешённые
данные и создаёт собственный SOS. Viewer имеет только чтение. Проверка роли и
parent trip выполняется на backend; скрытие кнопок во frontend не является
границей безопасности.

Telegram AI остаётся в боте с цепочкой
`llama-3.3-70b-versatile → openai/gpt-oss-20b → MockAIProvider`. Backend отдаёт
только отфильтрованный assistant context и не выполняет mutations от имени AI.
