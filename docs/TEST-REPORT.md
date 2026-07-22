# Integration test report

Дата: 2026-07-22

## Подтверждено локально

- Prisma schema format/validate: PASS.
- Initial PostgreSQL migration generated from the validated schema: PASS.
- Backend Node suite: 68/68 PASS после интеграции серверного сохранения маршрутов, workspace-операций и атомарной Telegram-привязки.
- Production npm audit: 0 vulnerabilities.
- Existing Telegram bot regression suite: 146/146 PASS после integration changes.
- Immutable OpenAPI operation coverage: 21/21 operationId.
- Browser cookie auth, Origin, service auth, RBAC/IDOR, token hashing: PASS.
- SOS idempotency/outbox and exactly-three Plan B: PASS.
- Frontend static contract and JavaScript syntax: PASS.
- Tracked demo passwords removed; working secret pattern scan: no findings.

## External checks pending

- Neon Marketplace terms acceptance and free resource provisioning.
- Database migration/seed integrity on isolated Neon.
- Backend preview health/readiness and full DB integration.
- Real Python `HttpTravelApiClient` consumer smoke.
- GitHub/GitVerse push (local DNS was unavailable at checkpoint).
- Frontend production deploy and browser organizer/participant/no-access flow.
- Explicit production Telegram switch approval, link migration and live E2E.
- Final VPN baseline comparison.

Ни один pending пункт не считается пройденным без фактического результата.
