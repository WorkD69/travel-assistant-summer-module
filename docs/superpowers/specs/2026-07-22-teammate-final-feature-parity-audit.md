# Teammate Final Feature Parity Audit

**Audit date:** 2026-07-22

**Archive:** `C:\Projects\сайт тревел помощник(1).zip`

**Sanitized audit copy:** `C:\Projects\_teammate-final-feature-audit`

**Safe production baseline:** `8a6508a0250fa94b9dfaedeb19c388d784d25de6`

**Staging branch:** `feature/teammate-final-parity`

## Audit safety

- The ZIP contains 4,020 entries. 3,834 dependency, environment, database, or runtime-cache entries were excluded.
- Only 88 text source and documentation files were extracted.
- `.env*`, `cookies.txt`, `node_modules`, `prisma/dev.db`, `.vercel`, runtime caches, binary assets, and `.traineddata` were not extracted.
- The extracted text was scanned before writing for common bot, AI, GitHub, and database credential formats. No archived secret value was written.
- The ZIP is the feature and UX reference only. Its bearer token, demo auto-login, permissive error handling, SQLite-era assumptions, and weak object authorization are explicitly not sources of truth.
- The current backend remains the source of truth for PostgreSQL, HttpOnly sessions, Origin checks, RBAC, cross-trip scoping, Telegram, SOS, outbox, and production operations.

## Feature parity matrix

| Function | ZIP source | ZIP behavior | Current repository | Production evidence | Status | Required adaptation | Automated test | Preview/production result |
|---|---|---|---|---|---|---|---|---|
| PostgreSQL persistence | `backend/prisma/schema.prisma` | Older Prisma data model; previously also shipped `dev.db` | PostgreSQL/Neon schema is substantially stronger and normalized | `/api/ready` returns 200 | Replaced safely | Keep current schema and add only parity fields/models through migrations | Prisma schema and migration tests | Baseline ready; parity pending |
| HttpOnly authentication | ZIP `api-client.js`, auth routes | Cookie plus optional JS bearer token and demo `ensureAuth` | HttpOnly cookie, exact Origin policy, generic login errors | Production auth works | Replaced safely | Never port JS auth token or demo credentials | Auth and frontend contract tests | Baseline passed |
| RBAC and object scoping | ZIP `trips.js`, `monitoring.js` | Mostly trip membership checks; several plan mutations scope by ID only | Central `trip-access`, role actions, cross-trip child scoping | Organizer/participant scenarios previously passed | Replaced safely | Reuse current `ACTIONS`, `assertCan`, and `scopeChildToTrip` for every parity endpoint | Role and IDOR tests | Baseline passed |
| Telegram deep-link linking | Not complete in ZIP | Not the final source for production linking | Account-level, hashed, single-use, ten-minute flow | Live create/consume/poll/unlink/relink passed | Preserved | Do not change contract or bot username | Existing 75 backend and 149 bot tests | Passed |
| SOS and notification outbox | ZIP coreflow modules | UI synchronization and basic monitoring records | Idempotent SOS, visibility isolation, durable Telegram outbox | Production bot remains in API mode | Preserved / UI partial | Connect parity UI through current endpoints only | Existing SOS/outbox plus UI persistence tests | Baseline passed |
| Geo city search | `assets/js/city-autocomplete.js`, `backend/src/routes/geo.js` | Nominatim search, datalist, city validation | Safe bounded `/api/site/geo/search` exists | Endpoint requires current session; no wizard consumer | Partial | Normalize city response, debounce and abort frontend requests, keyboard listbox, canonical selection | Geo search, invalid city, abort/debounce tests | Pending |
| Canonical route coordinates | `city-autocomplete.js`, `weather-map.js` | Selected Nominatim coordinates retained in frontend memory | Only city strings are persisted in `Trip.route`/`TripEvent` | Refresh loses coordinates | Missing | Add normalized `RoutePoint` persistence and expose it in trip detail | Route-point create/update/refresh tests | Pending |
| Real interactive route map | `assets/js/weather-map.js` | Leaflet, CARTO tiles with OSM fallback, ordered markers, arcs, arrows, fitBounds, drag/zoom | Static SVG/PNG-style route layer only | Leaflet script absent; module URLs return 404 | Missing | Adapt Leaflet module to current hydrated trip and `/api/*`; add loading, partial, provider, and offline states | Map init, ordered points, partial geocoding, offline fallback | Pending |
| Compact overview map | `weather-map.js` | Second Leaflet map for overview | Existing decorative compact route representation | No live tile map | Missing | Reuse geocoded route state in a smaller non-duplicating map controller | Compact map and hidden-tab resize test | Pending |
| Current online weather | `weather-map.js`, ZIP `geo.js` | Open-Meteo temperature, WMO text, wind | Safe backend fetch exists but returns a minimal raw current block | UI says “демонстрационные данные” | Partial | Return normalized description, temperature, wind, humidity, observed/update time, and provider | Current weather contract test | Pending |
| Three-day weather forecast | ZIP `geo.js` | Daily forecast data available | Not requested from provider | Not shown | Missing | Add bounded three-day daily fields and render only when available | Forecast normalization test | Pending |
| Weather cache and refresh | ZIP loads on boot | Browser memory behavior only | No explicit service cache or manual UI refresh | Values are demo/static | Missing | Add 15-minute bounded in-memory cache, cache metadata, reload and manual refresh | Cache hit/expiry/provider error tests | Pending |
| Weather error states | `weather-map.js` | Best-effort fallback and console warnings | API errors are safely normalized | No user-facing weather provider/offline state | Partial | Render loading, unavailable, partial, offline fallback without presenting demo values as live | Provider error and offline UI tests | Pending |
| Wizard city autocomplete | `city-autocomplete.js` | Watches `from`, `to`, `seg-from`, `seg-to`; datalist suggestions | Plain text inputs | No production suggestions | Missing | Accessible listbox, canonical fields, debounce, abort, mobile positioning, validation before save | Autocomplete and invalid-city frontend tests | Pending |
| Data-driven route timeline | `route-timeline.js` | Renders full and compact timelines from segments | `integration-controller.js` maps hydrated events, but static HTML remains initial source and event contract is incomplete | Production shell contains static example events | Partial | Make backend events/route points authoritative; render start/end, source/reference/order/status consistently | Timeline rendering and refresh persistence tests | Pending |
| Route event persistence | ZIP `trip-sync.js`, `trips.js` | Serializes segment JSON and trip fields | Current API persists future `TripEvent` rows, but update deletes only future rows and omits source/reference/order | Basic create/update survives refresh | Partial | Extend event contract; replace route atomically without silently retaining stale past items during explicit edit | Timeline persistence and edit replacement tests | Pending |
| Telegram `/today` and `/next` after edits | ZIP is not source of bot contract | N/A | Bot reads `TripEvent` from PostgreSQL | Works for current stored events | Preserved / needs parity test | Keep bot API contract and verify new event fields do not change it | Consumer tests after route update | Pending |
| Site AI ordinary dialog | `assets/js/ai-assistant.js`, `services/ai.js`, `assistant.js`, `routes/monitoring.js` | OpenAI-compatible chat, trip context, history | No site AI endpoint or UI; bot AI is separate | Production monitoring has no AI panel | Missing | Add Groq-only bounded provider service, safe context builder, organizer endpoint, persisted history, fallback status | Ordinary answer, provider unavailable, history, context filtering | Pending |
| AI connection/provider state | `ai-assistant.js` | Connected/loading/error indicators | No site AI state | Missing | Missing | Show Groq/fallback/unavailable without exposing provider detail or keys | UI state test | Pending |
| AI exactly-three Plan B | ZIP assistant prompt | Requests exactly three distinct strategies and JSON | Current `plan-b.js` always creates deterministic templates | Production returns three static templates | Replaced / partial | Ask Groq for strict structured output; validate and normalize exactly three; fall back to deterministic candidates | Exactly-three, malformed JSON, timeout, fallback tests | Pending |
| Plan strategy differentiation | ZIP assistant instructions | Fast, reliable/comfortable, delegate/minimum effort | Current strategies are `fast`, `reliable`, `delegate` templates | Present but static | Partial | Preserve stable strategy keys and validate semantic uniqueness/title differences | Strategy validation test | Pending |
| Plan pros, cons, conditions, steps | ZIP `assistant.js`, `ai-assistant.js` | Detailed plan cards | Current schema has steps/pros/cons/whenToUse | API/UI expose a subset; pros/cons mapping is inconsistent | Partial | Normalize arrays/text and render all fields safely | Plan contract and XSS tests | Pending |
| Price/time impact and affected elements | Required parity behavior; partially implicit in ZIP | Not consistently persisted by ZIP schema | Not present in current schema | Missing | Missing | Add bounded JSON impact fields or normalized columns and map them to UI | Schema/contract tests | Pending |
| Optional email draft | ZIP assistant and `TripPlan` fields | AI returns `emailDraft`; applied plan stores it | Current schema has no email draft fields | Missing | Missing | Add optional JSON email draft; never send automatically | Validation and rendering tests | Pending |
| Apply/select/publish Plan B | ZIP AI UI and monitoring routes | AI result can be applied as active plan | Current select/publish transaction is safer and emits outbox notification | Existing production flow works for deterministic plans | Preserved / AI input missing | Feed validated AI candidates into current select/publish pipeline; organizer only | Apply/publish/RBAC/outbox tests | Pending |
| Telegram Plan B notification | Current `operations.js` and outbox | ZIP not authoritative | Durable `plan_b_published` event | Previously validated | Preserved | No bot contract change; regression test AI-created plan publication | Telegram consumer/outbox test | Pending |
| Safe AI context | ZIP `assistant.js` | Includes route, documents, participants, signals; can expose too much metadata | Bot context already filters documents/messages/SOS | Site context missing | Partial | Build role-scoped context; exclude credentials, raw blobs, extracted passport text, foreign SOS, and organizer-only docs | Context filtering and role tests | Pending |
| AI conversation history | ZIP `AssistantMessage`, `ai-assistant.js` | Stores per-user history and reloads it | Model exists but no site route | Missing | Missing | Add bounded history list/store, per trip and user, with retention limits | History isolation/order tests | Pending |
| OCR text files | ZIP `ocr.js` plus docs sync | Extracts and parses content | Current TXT upload stores bounded text | Works only for TXT | Partial | Keep current safe path and unify extraction/review result contract | Text upload test | Pending |
| OCR text PDF | ZIP `ocr.js` | `pdf-parse` text layer extraction | PDF is stored and marked manual review | No extraction | Missing | Add bounded `pdf-parse` path with page/text limits and asynchronous status transition | Text-PDF extraction and limit tests | Pending |
| OCR JPG/JPEG/PNG | ZIP `ocr.js` | `tesseract.js` rus+eng | Images are stored and marked manual review | No extraction | Missing | Evaluate worker/runtime size; use bounded image OCR in separate processing path and explicit timeout/review fallback | Image OCR fixture and timeout tests | Pending |
| OCR scanned PDF | ZIP `ocr.js` | pdfjs + native canvas + Tesseract, limited pages | Heavy dependencies intentionally absent | No extraction | Missing / constrained | Measure preview bundle and Vercel timeout; support limited pages only if safe, otherwise explicit `needs_review` limitation | Scan fixture/bundle/timeout test | Pending |
| OCR document classification and fields | ZIP `extractFields`, `buildSegment` | Extracts dates, route, flight and booking-like fields | Only `extractedText` exists | Missing | Missing | Add non-sensitive structured `extractedData` JSON and conservative parser | Field extraction false-positive tests | Pending |
| OCR manual confirmation | ZIP `docs-sync.js` | Review UI and PATCH confirmation | No review endpoint/UI | Missing | Missing | Organizer-scoped review endpoint; accepted fields can create/update route events only after confirmation | Review/RBAC/cross-trip tests | Pending |
| Document file open/download | ZIP `docs-sync.js`, `trips.js` | Authenticated blob fetch and download | Bot temporary-link download exists; site upload/delete only | Site UI cannot open stored blob | Partial | Add current-session site download with visibility checks and safe headers | Visibility/download tests | Pending |
| Document frontend synchronization | `docs-sync.js` | API list/upload/open/delete/review overrides | `site-sync.js` hydrates list; workspace uploads/deletes are connected | Basic persistence works | Partial | Add status polling/review/open without overriding security-sensitive primitives | Refresh/rollback/error UI tests | Pending |
| Member synchronization | `members-sync.js` | Participants/invitations mapped and reconciled | Current detail hydration and mutation endpoints exist | Basic participants work | Replaced / partial | Keep current data adapters; fill missing refresh/error states only | Member refresh/RBAC tests | Pending |
| Messages and monitoring sync | `coreflow-sync.js`, `backend-sync.js` | Push/pull signals/messages and applied plan | Current `site-sync.js` and operations API persist core flow | Production scenarios work | Replaced / partial | Extend current adapter for AI and route/weather context; do not restore optimistic writes without rollback | Core flow persistence/error tests | Pending |
| Home/trip sync | `home-sync.js`, `trip-sync.js` | Backend replaces local demo state | Current `site-sync.js` safely wraps create/update and hydrates PostgreSQL | Production trips persist | Replaced safely | Extend current payload for route points/event fields; keep backend source of truth | Create/edit/refresh tests | Pending |
| Offline map fallback | `weather-map.js` and static route layer | Static map remains when provider fails | Static SVG exists but is always primary | Production always static | Partial | Retain static SVG strictly as loading/offline fallback and label it honestly | Offline fallback test | Pending |
| Mobile parity | ZIP CSS/modules | Mobile map/autocomplete/AI layout | Current shell is responsive; missing features cannot be tested | Telegram mobile layout passed only | Partial | Add responsive map height, listbox, plan cards, and OCR review | 375px viewport checks | Pending |

## Why the previous integration missed these features

The previous integration optimized for the safe production boundary: PostgreSQL migration, session authentication, role enforcement, Telegram contracts, SOS, notification delivery, and deployment. It treated the teammate backend as a data-shape donor instead of treating the complete frontend bundle as the feature reference. The ten sync/UI modules were therefore not mounted, and tests asserted only the already-integrated shell and API contracts. This left visually plausible static route/weather/monitoring sections that were not functionally equivalent to the final teammate bundle.

## Reuse and rewrite decisions

### Reuse from the ZIP after adaptation

- Leaflet lifecycle, ordered marker/arc rendering, CARTO-to-OSM tile fallback, and hidden-tab resize behavior.
- City-search debounce/abort intent and the canonical-selection UX.
- Data-driven full/compact timeline presentation.
- AI panel UX, history presentation, three-strategy prompt intent, plan details, and optional draft presentation.
- OCR field heuristics and explicit review workflow.

### Keep from current production

- Same-origin `window.TravelAPI`, HttpOnly cookie, Origin checks, and safe error envelope.
- Neon/PostgreSQL schema conventions and Prisma migrations.
- `trip-access` RBAC and child-object scoping.
- Trip/event/document/message/monitoring/SOS persistence.
- Plan selection/publication and Telegram notification outbox.
- Telegram deep-link, bot API, polling service, and existing account links.

### Explicitly reject from the ZIP

- `Password2026!`, demo auto-login, client bearer-token state, arbitrary backend base URL, old `.env`, cookies, SQLite database, permissive error disclosure, unscoped plan mutations, bundled traineddata, and silent OCR degradation.

## Priority conclusion

- **P0:** normalized route points, autocomplete, Leaflet maps, Open-Meteo weather/cache, authoritative timeline, site Groq assistant, validated exactly-three AI plans with deterministic fallback, current select/publish/outbox pipeline, persistence and RBAC regression coverage.
- **P1:** bounded OCR processing, extraction/review contract, site document download, three-day forecast polish, and optional email draft/impact presentation.
- Production remains pinned to `8a6508a` until preview automation and the 26-step manual parity scenario pass.

## Local implementation result

The matrix above records the baseline gap at the start of the audit. The current feature-branch outcome is:

| Area | Current result | Verification |
|---|---|---|
| PostgreSQL contracts | Additive `RoutePoint`, ordered event provenance, rich Plan B fields, and OCR review fields implemented | Schema, migration, trip persistence, and cross-trip scoping tests pass |
| Canonical route | Create/update returns the same ordered canonical names and coordinates after a fresh GET | Organizer/participant and refresh tests pass |
| City autocomplete | Debounced, abortable Nominatim search with listbox keyboard behavior and confirmed-selection invalidation | Frontend contract and JavaScript syntax checks pass |
| Route maps | Full and compact Leaflet 1.9.4 maps use persisted route points, ordered lines, `fitBounds`, drag/zoom, and static fallback states | Frontend map contracts pass |
| Weather | Open-Meteo current conditions plus exactly three daily rows, WMO descriptions, observed/fetched time, 15-minute bounded cache, refresh bypass | Provider, cache, timeout, and invalid-coordinate tests pass |
| Timeline | Full and compact timeline is rendered from ordered backend events and survives refresh | Trip and frontend contract tests pass |
| Site AI | Role-scoped persisted conversation history and bounded Groq-compatible requests; deterministic safe fallback when no key/provider response is available | Ordinary answer, malformed response, timeout, context filtering, and history tests pass |
| Plan B | Exactly three `speed`, `comfort`, and `budget` strategies with steps, pros, cons, conditions, time/price impact, affected elements, and email draft | Generation, RBAC, selection, publication, and outbox tests pass |
| Telegram parity | Bot `/today` and `/next` continue to consume persisted events; assistant context includes the selected published Plan B | Telegram regression suite passes; immutable bot OpenAPI remains unchanged |
| OCR text PDF | Text layer from at most five pages is extracted with a 100 KiB text ceiling | PDF extraction and limit tests pass |
| OCR PNG/JPEG | `tesseract.js` `rus+eng` processing is isolated behind byte, signature, dimension, pixel, and 45-second limits | Adapter, timeout, invalid file, and metadata tests pass |
| OCR scanned PDF | Explicit `scanned_pdf_unsupported` manual-review state; no unsupported success claim | Failure-state persistence test passes |
| OCR review | Organizer-only bounded structured review; participants cannot inspect OCR details or mutate review output | RBAC and cross-trip tests pass |
| Document download | Cookie-authenticated trip-scoped blob response with visibility checks, safe filename/MIME, and `no-store` | Organizer/participant visibility tests pass |
| Frontend document safety | Real `File` upload and blob download; document names and metadata are escaped before rendering | Frontend contract and stored-XSS regression tests pass |
| Existing security | HttpOnly session, exact Origin checks, role actions, IDOR protection, SOS, outbox, Telegram linking and API mode preserved | Full backend and bot regression suites pass |

## Local quality gates

- Backend: **116/116** tests passed.
- Telegram bot: **149/149** tests passed in the project virtual environment.
- `npm audit --omit=dev` reported **0** known production vulnerabilities before the PDF runtime correction. The post-correction audit is queued in the remote Preview build because the local npm advisory endpoint currently resets TLS connections.
- Prisma generation and validation passed; validation used process-only non-secret dummy URLs.
- Every `frontend/assets/js/*.js` file and the relevant inline overview scripts passed syntax checks.
- Redacted secret scan found no GitHub token, AI key, database credential, private key, or frontend secret identifier. Token-shaped strings were limited to Telegram test fixtures.
- Vercel build passed after replacing `pdf-parse` 2.x and its optional native canvas dependency with the pinned pure-JavaScript `pdf-parse@1.1.1` path. The main API function bundle is **33,658,219 bytes (32.1 MiB)**; the secondary function is **12,119,011 bytes (11.56 MiB)**. Both are below the applicable uncompressed function limit.
- Security review fixed bounded-image validation and stored-XSS risks before this checkpoint.
- The first backend Preview runtime exposed a Vercel-only startup failure: PDF.js 5 attempted to load missing optional `@napi-rs/canvas` and threw `DOMMatrix is not defined`. A regression test now rejects native canvas entries in the lockfile, a real bundled PDF fixture verifies the five-page text path, and the complete backend suite passes with the pure-JavaScript parser.

## Preview isolation checkpoint

- A separate Vercel Marketplace Neon resource named `travel-assistant-parity-preview` was provisioned on billing plan `free_v3` and connected only to the backend `Preview` environment with the `PARITY_` prefix.
- Preview `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, demo credentials, allowed Origin, and backend public URL are separate preview-scoped sensitive variables. A post-change pull confirmed the production values were unchanged.
- The isolated database host differs from production and resolves successfully.
- The current Windows/VPN route times out on outbound PostgreSQL TCP 5432 for both pooled and direct Neon endpoints (`P1001`). DNS is healthy and both URLs validate structurally. VPN, MantaRay, DNS, adapters, firewall, and routes were not changed.
- Both additive migrations and the safe seed completed in the isolated remote Vercel Preview build. A follow-up build must finish the post-correction audit and verify exactly three preview users, one preview trip, and zero Telegram links before smoke testing.
- One unused empty duplicate preview resource may remain because the CLI could list but not safely address its exact resource ID for deletion. It is not connected to any project and is not used by the deployment.
- Production stays on `8a6508a0250fa94b9dfaedeb19c388d784d25de6`; no production deployment, database migration, domain, VPS, Telegram link, VPN, or x-ui change has been made in this feature-parity phase.
