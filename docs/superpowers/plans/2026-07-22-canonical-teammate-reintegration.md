# Canonical Teammate Reintegration Implementation Plan

**Goal:** Replace Preview A site behavior with the teammate implementation,
retain Telegram as an additive consumer, and make only infrastructure-level
translations for the existing Preview PostgreSQL schema.

**Design:**
`docs/superpowers/specs/2026-07-22-canonical-teammate-reintegration-design.md`

**Branch:** `feature/teammate-final-parity`

**Restore tag:** `preview-a-before-canonical-reintegration-f3d1603`

## Task 1: Lock the canonical source boundary

**Files:**

- Create: `backend/tests/canonical-source.test.js`
- Create: `backend/tests/fixtures/canonical-source-manifest.json`
- Modify: `backend/tests/frontend-contract.test.js`

1. Write failing tests that assert the recorded SHA-256 hashes for the directly
   copied teammate routes, services, and frontend modules. Assert that active
   frontend HTML does not load `route-experience.js`, `site-assistant.js`, or
   `site-sync.js`. Assert the app does not mount replacement trip, geo, weather,
   assistant, monitoring, or Plan B routes under `/api/site`.
2. Run `node --test tests/canonical-source.test.js tests/frontend-contract.test.js`.
   Expect RED against the current A implementation.
3. Record only source hashes and relative paths; do not copy archive paths,
   credentials, `.env`, cookies, databases, or generated output.

## Task 2: Restore the teammate backend code directly

**Files copied from the sanitized teammate source:**

- `backend/src/middleware/auth.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/trips.js`
- `backend/src/routes/geo.js`
- `backend/src/routes/monitoring.js`
- `backend/src/services/ai.js`
- `backend/src/services/assistant.js`
- `backend/src/services/ocr.js`

**Infrastructure files modified separately:**

- `backend/src/app.js`
- `backend/src/config.js`
- `backend/src/db.js`
- `backend/src/server.js`

1. Copy the canonical business files without rewriting their functions.
2. Mount the original auth, trip, geo/weather, and monitoring routers at their
   original prefixes. Keep only additive Telegram routers outside that site
   contract.
3. Preserve Vercel startup and existing safe configuration names only in the
   infrastructure files. Do not alter provider URLs, prompts, plan strategies,
   request bodies, or response shapes in copied business files.
4. Run the Task 1 tests. The source hashes and route-mount assertions must pass.

## Task 3: Build the infrastructure-only PostgreSQL adapter

**Files:**

- Create: `backend/src/storage/teammate-prisma-adapter.js`
- Create: `backend/tests/teammate-prisma-adapter.test.js`
- Modify: `backend/src/db.js`

1. Write failing unit tests for every Prisma operation used by the copied
   backend. Cover users, trips, participants, invitations, documents, messages,
   monitoring signals, assistant history, offline copies, and applied plans.
2. Assert exact round trips for `Trip.route` and all canonical segment fields:
   `id`, `type`, `from`, `to`, `start`, `end`, `ref`, `provider`, `status`,
   `note`, and `order`. The public value remains the original serialized
   `segments` string.
3. Assert the adapter never returns `routePoints`, `events`, physical enum names,
   bot-only fields, or replacement Plan B properties in the site responses.
4. Implement only translations to the existing Prisma client. Do not edit the
   Prisma schema or migrations. Keep the copied routes and services unchanged.
5. Run `node --test tests/teammate-prisma-adapter.test.js` until GREEN.

## Task 4: Verify original site contracts and providers

**Files:**

- Create: `backend/tests/teammate-site-contract.test.js`
- Modify: `backend/tests/auth.test.js`
- Modify: `backend/tests/geo.test.js`

1. Write failing HTTP tests for `/api/trips`, `/api/geo/search`, `/api/weather`,
   `/api/trips/:tripId/monitoring/assistant`, and
   `/api/trips/:tripId/monitoring/plan` using the exact teammate request and
   response shapes.
2. Mock `fetch` and assert geo calls Open-Meteo Geocoding, weather calls
   Open-Meteo Forecast, and no active code calls Nominatim.
3. Assert the copied site AI prompt text, OpenAI-compatible request shape,
   `mode: dialog|plans`, and exactly three `fast`, `reliable`, `delegate` plans.
4. Assert apply archives the previous active plan and saves the chosen plan with
   the teammate fields unchanged.
5. Run the focused tests until GREEN, then run all backend tests and classify
   obsolete A-contract failures before changing tests or deleting dead code.

## Task 5: Restore the teammate frontend integration directly

**Files copied from the sanitized teammate source:**

- `frontend/assets/js/api-client.js`
- `frontend/assets/js/trip-sync.js`
- `frontend/assets/js/route-timeline.js`
- `frontend/assets/js/weather-map.js`
- `frontend/assets/js/ai-assistant.js`
- `frontend/assets/js/backend-sync.js`

**Files adjusted only for mounting/additive Telegram UI:**

- `frontend/trip-overview.html`
- `frontend/trip-wizard.html`
- other HTML entry points that load `api-client.js`
- `frontend/assets/js/core-flow-state-adapter.js`
- `frontend/assets/js/trip-monitoring.js`

1. Extend the RED frontend tests to require `window.TravelApi`, original endpoint
   paths, serialized trip segments, Open-Meteo-backed weather rendering, original
   assistant modes, and original plan application.
2. Copy the six canonical modules directly and load them in the same order as in
   the integrated teammate frontend.
3. Disable static core-flow plans whenever backend state is available. Remove
   `serverBacked` gating and stop loading A's route, site assistant, and site sync
   controllers. Do not replace the canonical module APIs with wrappers.
4. Keep account-level Telegram linking UI additive and independent.
5. Run frontend contract tests and `node --check` for every active JavaScript
   asset until GREEN.

## Task 6: Bridge applied Plan B to Telegram without changing its algorithm

**Files:**

- Modify: `backend/src/storage/teammate-prisma-adapter.js`
- Modify: `backend/src/routes/bot/index.js`
- Modify: `backend/tests/teammate-prisma-adapter.test.js`
- Modify: `backend/tests/bot-api.test.js`
- Modify: `backend/tests/outbox.test.js`

1. Write failing tests showing that a plan applied through the original
   `/monitoring/plan` endpoint becomes the active plan in the Telegram assistant
   context and produces the existing Plan B notification event.
2. Implement that translation inside the storage/integration boundary. Do not
   add site select/publish endpoints or alter the copied monitoring route,
   prompt, plan generation, or plan payload.
3. Verify role/document/SOS isolation and the existing bot OpenAPI remain
   unchanged.

## Task 7: Synchronize the canonical Telegram client

**Files:**

- Modify from canonical archive:
  `telegram-bot/app/services/travel_api/http_client.py`
- Reconcile any other files that differ from the canonical sanitized archive
- Create or modify focused document-download tests under `telegram-bot/tests/`

1. Write a failing consumer test that returns a backend temporary URL, serves
   bytes, and expects `DocumentDownload(kind="file")` with the real temporary
   file. Add timeout, transport, empty-body, and HTTP-error fallback assertions
   expecting `kind="url"`.
2. Copy the canonical `http_client.py` directly. Reconcile other bot differences
   to the sanitized archive without reading or creating `.env`.
3. Assert the AI provider chain, assistant, SOS, notification code, OpenAPI,
   dependencies, and existing tests match the canonical archive.
4. Run the focused test and then the full Telegram test suite.

## Task 8: Remove the dead parallel A implementation

**Files removed or made unreachable:**

- `backend/src/routes/site/geo.js`
- `backend/src/routes/site/assistant.js`
- site trip and operation routes that replace teammate endpoints
- `backend/src/services/geo.js`
- `backend/src/services/plan-b.js`
- A-only site assistant implementation
- `frontend/assets/js/route-experience.js`
- `frontend/assets/js/site-assistant.js`
- `frontend/assets/js/site-sync.js`

1. Write or retain negative tests proving replacement routes return 404 and the
   active frontend does not reference the dead modules.
2. Remove dead code only after all canonical consumers are GREEN. Preserve
   additive Telegram linking, bot routes, SOS, documents, notifications, and
   outbox modules.
3. Run `git diff --check`, dead-reference searches, and all backend/frontend/bot
   tests.

## Task 9: Isolated end-to-end and security verification

1. Run an isolated local flow covering trip creation with multiple segments,
   refresh round trip, geo search, weather, monitoring signal/history, ordinary
   AI, exactly three plans, apply, Telegram context/outbox, document temporary
   link, real bot download, and URL fallback.
2. Mock external geo, weather, and AI providers for deterministic contract
   assertions. Never read an archive `.env` or print environment values.
3. Run dependency audits, Prisma validation/generation without migration,
   JavaScript syntax checks, Python tests, secret-name/value scans with redacted
   output, and a complete changed-file review.
4. Confirm both remote `main` SHAs and the production deployment/bot status are
   unchanged before any Preview deployment.

## Task 10: Update Preview A only

1. Commit and push only `feature/teammate-final-parity` to GitHub and GitVerse.
   Verify identical feature-branch SHAs and unchanged `main` SHAs.
2. Deploy backend and frontend with Preview targets only. Do not use `--prod`,
   promotion, or production aliases. Do not run Prisma migrations or seed Neon.
3. Run non-mutating Preview health and contract smoke checks. Run mutating E2E
   only in the isolated local harness, never against shared production storage.
4. Report direct-source files, removed A code, adapter-only files, test results,
   updated Preview URLs, remaining limitations, and one final status. Do not
   merge or promote.
