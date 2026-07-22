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
- Real Python `HttpTravelApiClient` production consumer smoke: PASS (link, trips, documents/download, messages, idempotent SOS, preferences, assistant context).
- Isolated consumer smoke cleanup: PASS (temporary SOS, Telegram link and one-time token removed).

## External checks pending

- GitHub/GitVerse push and exact `main` SHA comparison.
- Existing frontend production deploy and organizer/participant/no-access browser flow.
- Explicit production Telegram switch approval, link migration and live E2E.
- Final VPN baseline comparison.

Ни один pending пункт не считается пройденным без фактического результата.
