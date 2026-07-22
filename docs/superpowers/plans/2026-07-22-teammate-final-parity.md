# Teammate Final Feature Parity Implementation Plan

**Progress (2026-07-22):** Tasks 1–9 are implemented and locally verified. Task 10 is in progress with a separate free-plan Neon Preview resource; production remains unchanged. Task 11 is blocked only on the deployed preview and the required manual browser/Telegram gate.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the teammate archive's complete user-visible behavior on the current secure PostgreSQL, cookie-authenticated, RBAC-scoped site and Telegram architecture without changing production before preview parity approval.

**Architecture:** The current backend remains authoritative for authentication, PostgreSQL, access control, Telegram, SOS, notification outbox, and deployment. Feature behavior is adapted behind the existing same-origin `/api/*` boundary: normalized route points and events feed geo/weather, Leaflet, timeline, site AI, Plan B, and OCR/document review. Every mutation is trip-scoped and transactional; external providers are bounded, time-limited, safely normalized, and have explicit non-secret fallbacks.

**Tech Stack:** Node.js 20, Express 5, Prisma 6/PostgreSQL Neon, Zod 4, Node test runner/Supertest, browser JavaScript, Leaflet 1.9.4, OpenStreetMap/CARTO, Nominatim, Open-Meteo, Groq OpenAI-compatible API, `pdf-parse`, bounded image OCR, Python Telegram bot tests, Vercel previews.

---

## File structure and responsibility boundaries

- `backend/prisma/schema.prisma` and one additive migration: persisted route points, ordered event provenance, richer Plan B fields, and OCR review output.
- `backend/src/services/geo.js`: provider-independent geo/weather normalization, timeout, cache, and WMO descriptions.
- `backend/src/routes/site/geo.js`: authenticated validation-only HTTP adapter.
- `backend/src/routes/site/trips.js`: transactional route-point and event persistence.
- `backend/src/services/assistant.js`: safe trip context builder, Groq call, strict answer/three-plan parsing, deterministic fallback.
- `backend/src/routes/site/assistant.js`: role-scoped site assistant/history/Plan B generation endpoints.
- `backend/src/services/ocr.js` and `backend/src/routes/site/documents.js`: bounded extraction, review, and authorized download.
- `frontend/assets/js/city-autocomplete.js`: accessible canonical city selector.
- `frontend/assets/js/route-experience.js`: Leaflet maps, live weather, and data-driven timeline from hydrated backend data.
- `frontend/assets/js/site-assistant.js`: site chat and exactly-three Plan B UX over cookie-authenticated APIs.
- `frontend/assets/js/document-review.js`: OCR processing/review status without exposing document contents to unauthorized roles.
- Existing `frontend/assets/js/api-client.js`, `site-sync.js`, `trip-pages-state.js`, and `trip-pages.js`: transport and shared-state integration only.

### Task 1: Lock route and plan persistence contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260722_teammate_feature_parity/migration.sql`
- Modify: `backend/tests/schema.test.js`

- [ ] **Step 1: Write failing schema assertions**

Add assertions that the Prisma schema contains `RoutePoint` with `(tripId, sortOrder)` uniqueness, latitude/longitude/canonicalName/source, that `TripEvent` contains source/reference/sortOrder, that `TripPlan` contains timeImpact/priceImpact/affectedElements/emailDraft/generationSource, and that `Document` contains extractedData/ocrErrorCode/processedAt/reviewedAt.

- [ ] **Step 2: Verify RED**

Run: `cd backend; node --test tests/schema.test.js`

Expected: FAIL because `RoutePoint` and parity fields do not exist.

- [ ] **Step 3: Add the minimal additive Prisma model and migration**

Use this contract:

```prisma
model RoutePoint {
  id            String   @id @default(cuid())
  tripId        String
  name          String
  canonicalName String
  latitude      Float
  longitude     Float
  sortOrder     Int
  source        String   @default("nominatim")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  trip          Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  @@unique([tripId, sortOrder])
  @@index([tripId])
}
```

Add nullable parity columns to existing tables so the migration preserves every production row. Add `routePoints RoutePoint[]` to `Trip`.

- [ ] **Step 4: Verify GREEN and migration validity**

Run: `cd backend; npx prisma validate; node --test tests/schema.test.js`

Expected: both commands PASS.

- [ ] **Step 5: Commit the contract checkpoint**

Run: `git add backend/prisma backend/tests/schema.test.js && git commit -m "feat: add feature parity persistence contracts"`

### Task 2: Persist canonical route points and ordered events

**Files:**
- Modify: `backend/src/routes/site/trips.js`
- Modify: `backend/src/routes/site/mappers.js` if introduced by extraction
- Modify: `backend/tests/site-trips.test.js`
- Modify: `backend/tests/trip-access.test.js`

- [ ] **Step 1: Write failing create/update/refresh tests**

Tests must POST and PATCH a trip with:

```js
routePoints: [
  { name: 'Сыктывкар', canonicalName: 'Сыктывкар, Россия', latitude: 61.6688, longitude: 50.835, sortOrder: 0 },
  { name: 'Москва', canonicalName: 'Москва, Россия', latitude: 55.7558, longitude: 37.6173, sortOrder: 1 },
  { name: 'Анталья', canonicalName: 'Antalya, Türkiye', latitude: 36.8969, longitude: 30.7133, sortOrder: 2 },
],
events: [{ type: 'flight', title: 'Перелёт', startsAt: '2026-08-01T09:00:00.000Z', source: 'manual', reference: 'SU-100', sortOrder: 0 }]
```

Assert canonical names, coordinates, provenance and order return unchanged after a fresh GET. Assert participant PATCH is 403 and a cross-trip child ID cannot be mutated.

- [ ] **Step 2: Verify RED**

Run: `cd backend; node --test tests/site-trips.test.js tests/trip-access.test.js`

Expected: FAIL because route points and new event fields are not accepted or returned.

- [ ] **Step 3: Implement transactional replacement semantics**

Validate arrays with Zod; require 2–12 route points, unique contiguous sort order, latitude `[-90,90]`, longitude `[-180,180]`, and bounded strings. On organizer create/update, replace the trip's route points and submitted events inside one Prisma transaction. Never infer a confirmed city from arbitrary text.

- [ ] **Step 4: Verify GREEN**

Run: `cd backend; node --test tests/site-trips.test.js tests/trip-access.test.js`

Expected: PASS with role and refresh persistence covered.

- [ ] **Step 5: Commit**

Run: `git add backend/src/routes/site/trips.js backend/tests && git commit -m "feat: persist canonical trip routes and timeline events"`

### Task 3: Normalize geo search and live weather

**Files:**
- Modify: `backend/src/services/geo.js`
- Modify: `backend/src/routes/site/geo.js`
- Modify: `backend/tests/geo.test.js`

- [ ] **Step 1: Write failing provider/cache tests**

Cover encoded bounded Nominatim search; invalid coordinates before fetch; normalized WMO description; temperature, wind, humidity, provider observation time; exactly three daily forecast rows; 15-minute cache hit; cache bypass for `refresh=true`; timeout and provider errors without raw bodies.

- [ ] **Step 2: Verify RED**

Run: `cd backend; node --test tests/geo.test.js`

Expected: FAIL on humidity, forecast, metadata, and cache assertions.

- [ ] **Step 3: Implement normalized weather and bounded cache**

Request Open-Meteo fields `temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` plus daily `weather_code,temperature_2m_max,temperature_2m_min`, use `forecast_days=3`, normalize to:

```js
{
  provider: 'Open-Meteo', observedAt, fetchedAt, cache: { hit, expiresAt },
  current: { temperatureC, description, weatherCode, windKph, humidityPercent },
  forecast: [{ date, description, weatherCode, minC, maxC }]
}
```

Use a maximum 128-entry Map cache and delete the oldest key before insertion when full. Preserve the existing abort timeout and response-size bound.

- [ ] **Step 4: Verify GREEN**

Run: `cd backend; node --test tests/geo.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/services/geo.js backend/src/routes/site/geo.js backend/tests/geo.test.js && git commit -m "feat: add normalized cached route weather"`

### Task 4: Connect frontend API and accessible city autocomplete

**Files:**
- Modify: `frontend/assets/js/api-client.js`
- Create: `frontend/assets/js/city-autocomplete.js`
- Modify: `frontend/assets/js/trip-pages.js`
- Modify: `frontend/assets/js/trip-pages-state.js`
- Modify: `frontend/trip-wizard.html`
- Modify: `backend/tests/frontend-contract.test.js`

- [ ] **Step 1: Write failing static and executable DOM-contract tests**

Assert the API client exposes `geo.search(query, signal)` and `geo.weather(latitude, longitude, refresh)`. Assert the autocomplete module uses a debounce timer, `AbortController`, `role="listbox"`, `role="option"`, ArrowUp/ArrowDown/Enter/Escape handlers, confirmed selection coordinates, and invalidates a selection when text changes.

- [ ] **Step 2: Verify RED**

Run: `cd backend; node --test tests/frontend-contract.test.js`

Expected: FAIL because the client and module are absent.

- [ ] **Step 3: Implement canonical selection only**

Expose this selected value to the wizard adapter:

```js
{ name, canonicalName: name, latitude: Number(latitude), longitude: Number(longitude), source: 'nominatim' }
```

Block final trip save when a route input has non-empty text but no matching confirmed selection. Surface provider unavailable separately from city not found. Keep credentials in the same-origin client only.

- [ ] **Step 4: Verify GREEN and syntax**

Run: `cd backend; node --test tests/frontend-contract.test.js; node --check ../frontend/assets/js/city-autocomplete.js; node --check ../frontend/assets/js/trip-pages.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add frontend backend/tests/frontend-contract.test.js && git commit -m "feat: add canonical city autocomplete"`

### Task 5: Render real maps, weather, and backend timeline

**Files:**
- Create: `frontend/assets/js/route-experience.js`
- Create: `frontend/assets/css/route-experience.css`
- Modify: `frontend/trip-overview.html`
- Modify: `frontend/assets/js/site-sync.js`
- Modify: `backend/tests/frontend-contract.test.js`

- [ ] **Step 1: Write failing UI contract tests**

Assert Leaflet 1.9.4 CSS/JS with integrity attributes, CARTO or OSM tile URL, ordered marker/polyline rendering, `fitBounds`, map invalidation after tab activation, loading/provider unavailable/city not found/partial/offline states, manual weather refresh, Open-Meteo source and observed time, and timeline sorting by `sortOrder` then time.

- [ ] **Step 2: Verify RED**

Run: `cd backend; node --test tests/frontend-contract.test.js`

Expected: FAIL because `route-experience.js` and live-map dependencies are absent.

- [ ] **Step 3: Implement one route experience controller**

Wait for hydrated trip data before geocoding or weather calls. Prefer persisted `routePoints`; geocode only legacy string-only trips. Use persisted point order for markers and lines. Create full and compact Leaflet instances, display static route art only during loading/offline/provider failure, and render backend events from actual event fields rather than static cards.

- [ ] **Step 4: Verify GREEN and syntax**

Run: `cd backend; node --test tests/frontend-contract.test.js; node --check ../frontend/assets/js/route-experience.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add frontend backend/tests/frontend-contract.test.js && git commit -m "feat: add live route map weather and timeline"`

### Task 6: Add safe site AI and exactly three Plan B options

**Files:**
- Modify: `backend/src/config.js`
- Create: `backend/src/services/assistant.js`
- Create: `backend/src/routes/site/assistant.js`
- Modify: `backend/src/app.js`
- Modify: `backend/src/routes/site/operations.js`
- Modify: `backend/tests/config.test.js`
- Create: `backend/tests/assistant.test.js`
- Modify: `backend/tests/plan-b.test.js`

- [ ] **Step 1: Write failing AI contract and authorization tests**

Cover organizer and participant ordinary answers; persisted role-owned chat history; exclusion of document blobs/passport-like extracted fields/foreign SOS/internal plans; organizer-only Plan B generation and apply; provider output accepted only when exactly three distinct strategies validate; malformed/unavailable provider uses deterministic three-plan fallback; raw provider body/key never reaches response or logs.

- [ ] **Step 2: Verify RED**

Run: `cd backend; node --test tests/config.test.js tests/assistant.test.js tests/plan-b.test.js`

Expected: FAIL because site assistant route and strict AI parser do not exist.

- [ ] **Step 3: Implement optional Groq provider and safe context**

Read `GROQ_API_KEY`, `GROQ_MODEL`, and `GROQ_FALLBACK_MODEL` only server-side. Use a 15-second abort timeout and JSON-only prompt. Validate the response with Zod:

```js
z.object({ plans: z.array(z.object({
  strategy: z.enum(['speed', 'comfort', 'budget']),
  title: z.string().min(3).max(120), summary: z.string().min(3).max(1000),
  steps: z.array(z.string().min(1).max(500)).min(1).max(8),
  pros: z.array(z.string().max(300)).max(8), cons: z.array(z.string().max(300)).max(8),
  whenToUse: z.string().max(700), timeImpact: z.string().max(200),
  priceImpact: z.string().max(200), affectedElements: z.array(z.string().max(200)).max(12),
  emailDraft: z.object({ subject: z.string().max(180), body: z.string().max(4000) })
})).length(3) })
```

Map the result to existing `TripPlan`, preserve current selection/publish/outbox flow, and mark `generationSource` as `groq` or `deterministic-fallback`.

- [ ] **Step 4: Verify GREEN**

Run: `cd backend; node --test tests/config.test.js tests/assistant.test.js tests/plan-b.test.js tests/outbox.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend && git commit -m "feat: add secure site assistant and ai plan generation"`

### Task 7: Connect site assistant and Plan B UX

**Files:**
- Modify: `frontend/assets/js/api-client.js`
- Create: `frontend/assets/js/site-assistant.js`
- Modify: `frontend/assets/js/workspace-integration.js`
- Modify: `frontend/trip-overview.html`
- Modify: `backend/tests/frontend-contract.test.js`

- [ ] **Step 1: Write failing frontend contracts**

Assert history/ask/generate methods use `/api/site/trips/:tripId/assistant`; generation UI requires organizer capability; exactly three strategies render distinct steps/pros/cons/conditions/time/price/affected/email draft; selection calls existing select endpoint and publication calls existing publish endpoint; participant markup never enables generation/apply controls.

- [ ] **Step 2: Verify RED**

Run: `cd backend; node --test tests/frontend-contract.test.js`

Expected: FAIL because site AI client/controller is absent.

- [ ] **Step 3: Implement the current-shell integration**

Hydrate history after the active trip and role are known. Send only the user's question or incident text; never serialize local storage, tokens, document blobs, or unrestricted trip state. Preserve current `workspace-integration.js` selection/publish behavior so Telegram outbox remains authoritative.

- [ ] **Step 4: Verify GREEN and syntax**

Run: `cd backend; node --test tests/frontend-contract.test.js; node --check ../frontend/assets/js/site-assistant.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add frontend backend/tests/frontend-contract.test.js && git commit -m "feat: connect site assistant and plan b workspace"`

### Task 8: Add bounded OCR and organizer review

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/src/services/ocr.js`
- Create: `backend/src/routes/site/documents.js`
- Modify: `backend/src/app.js`
- Modify: `backend/tests/site-trips.test.js`
- Create: `backend/tests/ocr.test.js`
- Create: `frontend/assets/js/document-review.js`
- Modify: `frontend/assets/js/api-client.js`
- Modify: `frontend/trip-overview.html`
- Modify: `backend/tests/frontend-contract.test.js`

- [ ] **Step 1: Measure the candidate bundle before adding dependencies**

Run: `cd backend; npm view pdf-parse dist.unpackedSize version; npm view tesseract.js dist.unpackedSize version; npm view canvas dist.unpackedSize version`

Record measured values in the parity audit. Reject native `canvas` for Vercel if it requires platform binaries. Use pure JavaScript only when the installed production bundle remains below Vercel limits.

- [ ] **Step 2: Write failing OCR tests**

Cover UTF-8 text PDF extraction, bounded image recognition adapter, invalid MIME/signature mismatch, file-size/page/pixel/time limits, processing/ready/failed status, sanitized error code, organizer review of structured fields, participant visibility but no review mutation, and trip-scoped authorized download.

- [ ] **Step 3: Verify RED**

Run: `cd backend; node --test tests/ocr.test.js tests/site-trips.test.js`

Expected: FAIL because OCR processing and review routes are absent.

- [ ] **Step 4: Implement bounded extraction**

Use `pdf-parse` for text PDFs. Place image OCR behind an injected adapter with hard byte/pixel/page/time limits; if the Vercel-safe OCR engine is unavailable, persist `manual_review_required` rather than claiming success. Parse only bounded whitelisted fields (document type, holder name, document number, dates, route/reference), store structured JSON, and never include extracted content in participant responses unless document visibility permits it.

- [ ] **Step 5: Verify GREEN, audit, and bundle size**

Run: `cd backend; node --test tests/ocr.test.js tests/site-trips.test.js tests/frontend-contract.test.js; npm audit --omit=dev; npm ls --all`

Expected: tests PASS, audit reports zero known production vulnerabilities, dependency tree resolves.

- [ ] **Step 6: Commit**

Run: `git add backend frontend && git commit -m "feat: add bounded document extraction and review"`

### Task 9: Full local regression and security review

**Files:**
- Modify: `backend/tests/openapi.test.js`
- Modify: `backend/openapi.yaml`
- Modify: `docs/superpowers/specs/2026-07-22-teammate-final-feature-parity-audit.md`

- [ ] **Step 1: Add the final OpenAPI and secret-boundary assertions**

Document routePoints/events/weather/assistant/Plan B/OCR contracts. Assert the frontend contains no `GROQ_API_KEY`, service token, bearer token, database URL, demo password, or absolute backend origin.

- [ ] **Step 2: Run all local gates**

Run:

```powershell
cd backend
npm test
npm audit
npx prisma validate
npx prisma generate
Get-ChildItem ..\frontend\assets\js\*.js | ForEach-Object { node --check $_.FullName }
cd ..\telegram-bot
python -m pytest -q
```

Expected: all backend tests, all Telegram tests, all syntax checks, Prisma validation/generation, and audit PASS.

- [ ] **Step 3: Run a redacted secret scan and inspect the diff**

Run repository scanners using match counts and filenames only; do not print suspected values. Run `git diff --check`, `git status --short`, and review `git diff --stat` plus each changed source file.

- [ ] **Step 4: Update matrix results and commit**

Record actual test counts, providers, fallback behavior, OCR capability/bundle size, and remaining limitations. Run: `git add . && git commit -m "test: verify teammate feature parity"`.

### Task 10: Create isolated backend and frontend previews

**Files:**
- No production configuration changes
- Update: `docs/superpowers/specs/2026-07-22-teammate-final-feature-parity-audit.md`

- [ ] **Step 1: Push only the feature branch to both remotes**

Run: `git push -u origin feature/teammate-final-parity; git push -u gitverse feature/teammate-final-parity`

Expected: both branch heads equal the local SHA; neither `main` changes.

- [ ] **Step 2: Provision preview-only data safely**

Use an isolated Neon preview branch/database on the free plan. Add preview-only Vercel environment values without printing secrets. Apply additive migrations and a safe preview seed; do not copy production users, Telegram IDs, documents, SOS, or tokens.

- [ ] **Step 3: Deploy the existing backend project as Preview**

Run from `backend`: `vercel deploy --yes` without `--prod`. Verify `/api/health` and `/api/ready` are 200 and capture the immutable preview URL.

- [ ] **Step 4: Deploy the existing frontend project as Preview**

Create a preview rewrite that targets the backend preview without changing the production domain/config, then run from `frontend`: `vercel deploy --yes` without `--prod`. Verify `/api/health` through the frontend preview.

- [ ] **Step 5: Run preview smoke and consumer tests**

Exercise two preview roles, persistence after refresh, geo/weather, exactly-three Plan B, publish/outbox payload, SOS isolation, document visibility, OCR status, and the complete `HttpTravelApiClient` consumer suite against preview-safe accounts.

### Task 11: Complete the 26-step manual parity gate

**Files:**
- Update: `docs/superpowers/specs/2026-07-22-teammate-final-feature-parity-audit.md`

- [ ] **Step 1: Test the required preview trip**

Create `Сыктывкар → Москва → Анталья` and manually record all 26 requested results: autocomplete and invalid city; save/refresh; Open-Meteo data/time/source; Leaflet point/line/zoom/drag; backend timeline; route-change reactivity; ordinary AI; exactly three distinct plans; organizer apply; Telegram publication and AI context; OCR/review; participant restrictions; SOS; new Telegram linking; persistence.

- [ ] **Step 2: Keep production pinned if any item fails**

Do not merge or deploy production. Write the failing step, safe evidence, and automated reproduction into the matrix; add a failing regression test before fixing it.

- [ ] **Step 3: Request explicit production approval only after all 26 pass**

Present preview URLs, commit SHA, full matrix, test counts, secret/audit results, provider/bundle details, Telegram/VPN preservation, and rollback baseline `8a6508a0250fa94b9dfaedeb19c388d784d25de6`. Production merge/deploy is a separate explicitly approved operation.

## Self-review result

- Spec coverage: all requested P0/P1 functions, existing security/Telegram/SOS invariants, preview isolation, 26 manual checks, and production rollback are mapped to Tasks 1–11.
- Placeholder scan: no deferred implementation placeholder is used; the only conditional behavior is the explicit safe OCR capability decision based on measured Vercel bundle constraints.
- Type consistency: `RoutePoint`, ordered `TripEvent`, normalized weather, strict three-plan schema, OCR fields, API clients, and UI consumers use the same property names throughout.
- Production invariant: no step changes production, `main`, production domains, production database, VPS, VPN, x-ui, Telegram secrets, or the two current Telegram links before explicit post-preview approval.
