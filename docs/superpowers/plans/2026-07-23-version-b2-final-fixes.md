# Version B2 Final Fixes — Implementation Plan

> Scope: local `codex/teammate-preview` plus isolated Railway/Vercel staging only. Production Version B, its SQLite volume, Telegram service/token, Vercel production deployment, Railway production deployment, and Git remotes remain untouched. No push, merge, PR, promotion, or production migration.

## 1. Backend source of truth and atomic trip changes

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Add: `backend/prisma/migrations/20260723_version_b2/migration.sql`
- Add: `backend/src/services/tripChanges.js`
- Modify: `backend/src/services/botNotify.js`
- Modify: `backend/src/routes/trips.js`
- Add/modify tests under `backend/test/`

1. Add failing HTTP/service tests for owner-only PATCH, full segment persistence, `updatedAt`, typed change rows, organizer exclusion, and notification outbox creation.
2. Run the focused tests and record the expected failures.
3. Add `Trip.updatedAt`, `TripChange`, invitation acceptance fields, and structured Plan B fields using an additive SQLite migration.
4. Make notification recipient selection transaction-aware so mutation, change row, and outbox rows commit or roll back together.
5. Implement typed before/after diffing for route, dates, segments, events, participants, documents, messages, risks, SOS, and Plan B events.
6. Restrict trip PATCH and organizer mutations to the trip owner; return 403 without writing anything.
7. Return the canonical full server trip after mutation.
8. Run Prisma generation/db push against a temporary test database, then rerun focused and full backend tests.

## 2. Server-authoritative frontend synchronization and hydration

**Files:**
- Modify: `frontend/assets/js/trip-sync.js`
- Modify: `frontend/assets/js/workspace-integration.js`
- Modify: `frontend/features/trip-settings.js`
- Modify/add: `frontend/tests/*.test.cjs`

1. Add failing VM/static tests proving settings submit awaits one async PATCH, sends title/route/dates/type/status/full segments, exposes rejection, and does not show success early.
2. Add failing tests proving every `tripId` navigation performs server GET even when localStorage has a stale trip and preserves the complete return URL through login.
3. Implement a single async update path that replaces shared browser state with the returned server object; localStorage remains an offline mirror only.
4. Make `settingsSaveTrip` async, disable submit while pending, keep the modal open on failure, show the actual error, and close/toast only after HTTP 2xx.
5. Hydrate from the backend before workspace boot in normal browser, incognito, and WebView-compatible flows.
6. Run all frontend Node tests.

## 3. Fresh assistant context and server weather

**Files:**
- Add: `backend/src/services/geoWeather.js`
- Modify: `backend/src/routes/geo.js`
- Modify: `backend/src/services/assistant.js`
- Modify: `backend/src/routes/bot.js`
- Add/modify backend context tests

1. Add failing tests for route/segments, next departure/boarding, participants, document names and redacted OCR summary, messages, monitoring/risks, three plans and selected plan, SOS, `updatedAt`, recent changes, and weather metadata.
2. Extract reusable Open-Meteo lookup/weather functions from the HTTP route with bounded timeout and cache.
3. Build the assistant context from a fresh database query on every request and resolve weather from active route points server-side.
4. Ensure safe OCR context excludes raw sensitive fields and raw full OCR text.
5. Verify Telegram assistant endpoints observe a route update immediately.

## 4. Structured three-route Plan B and atomic apply

**Files:**
- Add: `backend/src/services/mockGds.js`
- Modify: `backend/src/services/assistant.js`
- Modify: `backend/src/routes/monitoring.js`
- Modify relevant frontend monitoring/Plan B adapters
- Add backend/frontend tests

1. Add failing validation/API tests requiring exactly three structured strategies: fastest, cheapest, and reliable/minimum-effort.
2. Implement deterministic demonstrational route generation with explicit `source` and `isDemoData`; never claim live availability.
3. Persist every structured field and retain the optional email draft.
4. Add an owner-only apply endpoint that atomically selects the plan, updates `Trip.route` and full segments/timeline inputs, writes `plan_b_applied`, and enqueues notifications.
5. Update UI apply flow to require confirmation, await 2xx, and replace state from the returned canonical trip.
6. Test persistence after refresh/re-login and immediate visibility in assistant context/bot API.

## 5. Invitations

**Files:**
- Modify: `backend/src/routes/trips.js` or add an invitation router
- Modify: `frontend/assets/js/members-sync.js`
- Modify: `frontend/features/trip-members.js`
- Add: `frontend/invitation.html` and supporting script if absent
- Add backend/frontend tests

1. Add failing tests for 1/3/7-day expiry, public frontend origin, resolve, accept/join, matching authenticated email, active/expired/revoked checks, single use, and `trip_invitation` outbox.
2. Add owner-only invitation creation/revocation and public-token resolve plus authenticated acceptance.
3. Use server `createdAt`/`expiresAt` and `FRONTEND_ORIGIN`; remove `travel.local` and fixed dates.
4. Implement invitation landing and return-to-login flow.
5. Run focused and full tests.

## 6. Isolated staging deployment and E2E

**Files:**
- Staging-only Railway/Vercel project metadata inside this isolated tree
- Update deployment documentation and final evidence artifacts only

1. Create a separate Railway staging environment/service and separate `/data` volume/database; never copy production `prod.db` into it.
2. Configure staging secrets without displaying them. Reuse neither production Telegram token nor production polling.
3. Deploy backend staging, run schema setup on the new empty SQLite database, seed only synthetic E2E data, and verify health.
4. Deploy a Vercel Preview (not production) pointing only at staging backend; restrict CORS to that exact preview origin.
5. Execute backend, frontend, OCR, Prisma, bot consumer, `HttpTravelApiClient`, and no-polling harness suites.
6. Execute the 26 requested E2E checks using synthetic accounts/Telegram linkage and a fake delivery consumer. Use real Open-Meteo and configured staging AI without logging its key.
7. Capture structured Plan B responses and browser screenshots where useful.
8. Re-check production deployment IDs, frontend URL, backend health, SQLite hash/reference, Telegram PID/NRestarts/single polling to prove no production mutation.
9. Stop before any production switch and report either `VERSION B2 STAGING READY — PRODUCTION UNCHANGED` or `VERSION B2 NOT READY — PRODUCTION UNCHANGED`.

## Verification commands

- Backend: `npm test` and focused `node --test test/<name>.test.js` from `backend`.
- Backend live harness: `npm run test:http` against an isolated temporary/staging database.
- Frontend: `node --test tests/*.test.cjs` from `frontend`.
- Telegram: `python -m pytest` plus consumer/harness tests from `telegram-bot`; never start polling.
- Database: `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, schema/row assertions on staging only.
- Deployment: staging health/API checks and Vercel Preview browser checks; no production aliases or promotion commands.
