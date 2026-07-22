# Integration test report

Дата: 2026-07-22

## Подтверждено локально

- Prisma schema format/validate: PASS.
- Initial PostgreSQL migration generated from the validated schema: PASS.
- Backend Node suite: 70/70 PASS после интеграции серверного сохранения маршрутов, workspace-операций, атомарной Telegram-привязки, нормализации типов событий и совместимости audience seed-сообщений.
- Production npm audit: 0 vulnerabilities.
- Existing Telegram bot regression suite: 146/146 PASS после integration changes.
- Immutable OpenAPI operation coverage: 21/21 operationId.
- Browser cookie auth, Origin, service auth, RBAC/IDOR, token hashing: PASS.
- SOS idempotency/outbox and exactly-three Plan B: PASS.
- Frontend static contract and JavaScript syntax: PASS.
- Tracked demo passwords removed; working secret pattern scan: no findings.

## Подтверждено во внешней среде

- Neon Marketplace terms accepted; resource `travel-assistant-db` provisioned on `free_v3` without billing: PASS.
- Production/preview Neon variables connected without exposing connection strings: PASS.
- Prisma migration `202607220001_init` and safe seed on Neon: PASS.
- Seed integrity: 3 users, 1 trip, exactly 3 distinct Plan B strategies, 0 Telegram links, 3 safe demo documents: PASS.
- Backend production `https://travel-assistant-api-chi.vercel.app`: `/api/health` and `/api/ready` return HTTP 200.
- Existing frontend project `https://travel-assistant-summer-module.vercel.app`: root and proxied `/api/health` return HTTP 200; no replacement project or domain was created.
- Production site smoke: organizer/participant/no-access auth and RBAC, monitoring, exactly 3 Plan B, participant messages, document visibility and persistence after a fresh session: PASS.
- Real Python `HttpTravelApiClient` production consumer smoke: PASS (link, trips, documents/download, messages, idempotent SOS, preferences, assistant context).
- Isolated consumer smoke cleanup: PASS (temporary SOS, Telegram link and one-time token removed).
- GitHub/GitVerse `main` exact SHA comparison: PASS.
- Production VPS baseline: bot and x-ui active; `BOT_DATA_MODE=mock`; VPN/MantaRay and Telegram/AI secrets were not changed.

## External checks pending

- Explicit production Telegram switch approval, link migration and live E2E.

Ни один pending пункт не считается пройденным без фактического результата.
