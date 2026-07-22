# Canonical Teammate Reintegration Design

**Date:** 2026-07-22

**Branch:** `feature/teammate-final-parity`

**Restore tag:** `preview-a-before-canonical-reintegration-f3d1603`

## Objective

Make Preview A run the backend and integrated frontend supplied by the teammate,
without recreating their product behavior. The teammate source is authoritative
for site routes, request and response shapes, route segments, geo and weather,
site AI, monitoring, Plan B, OCR, and frontend integration modules.

The canonical Telegram archive is authoritative for the bot client and its
OpenAPI contract. Telegram remains an additive consumer of the site data and
must not replace the teammate site API.

## Canonical sources

- Site backend and integrated frontend:
  `C:\Projects\_teammate-final-feature-audit`
- Telegram bot:
  `C:\Users\Artem\Downloads\travel-telegram-bot-canonical-sanitized.zip`
- Historical baseline only:
  `C:\Users\Artem\Downloads\Telegram Desktop\travel-assistant-summer-module-main.zip`

No `.env` file or value from an archive or local copy is a source of truth.

## Direct source restoration

Copy the teammate implementations directly wherever infrastructure does not
force an adaptation:

- `backend/src/routes/auth.js`
- `backend/src/routes/trips.js`
- `backend/src/routes/geo.js`
- `backend/src/routes/monitoring.js`
- `backend/src/services/ai.js`
- `backend/src/services/assistant.js`
- `backend/src/services/ocr.js`
- the teammate authentication middleware and app route mounting
- `frontend/assets/js/api-client.js`
- `frontend/assets/js/trip-sync.js`
- `frontend/assets/js/route-timeline.js`
- `frontend/assets/js/weather-map.js`
- `frontend/assets/js/ai-assistant.js`
- `frontend/assets/js/backend-sync.js`

The restored site contracts are the only site contracts:

- `/api/trips`
- `/api/geo/search`
- `/api/weather`
- `/api/trips/:tripId/monitoring`
- `/api/trips/:tripId/monitoring/assistant`
- `/api/trips/:tripId/monitoring/plan`

The route source of truth is `Trip.route` plus the serialized
`Trip.segments`. Geo search remains Open-Meteo Geocoding. Weather remains
Open-Meteo Forecast. The site AI prompt and Plan B strategies remain exactly
the teammate values `fast`, `reliable`, and `delegate`.

## PostgreSQL compatibility boundary

The Preview PostgreSQL schema is not migrated or changed. A narrow repository
adapter may translate the teammate Prisma operations to the existing physical
tables. It must preserve the teammate model meaning and round-trip the original
API fields without changing their names or shapes.

The adapter may only:

- map original users, trips, participants, invitations, documents, messages,
  monitoring signals, assistant messages, offline copies, and applied plans to
  existing columns;
- serialize and deserialize the teammate segment fields through existing
  `TripEvent` storage without exposing `routePoints` or `events` in the site API;
- translate the original active applied plan to the existing physical plan
  status needed by Telegram context and notification delivery;
- execute required writes transactionally.

The adapter must not add business validation, provider calls, response fields,
new Plan B strategies, route calculations, or alternate endpoints.

## Removed Preview A behavior

Remove or stop mounting the A replacements for site behavior:

- `/api/site/trips/*` as a site trip API;
- `/api/site/geo/*`;
- `/api/site/trips/:id/assistant`;
- signal-specific Plan B generation, selection, and publication endpoints;
- Nominatim geo search;
- `routePoints` as the frontend route source of truth;
- `route-experience.js` and `site-assistant.js` as active integrations;
- `serverBacked` gating and deterministic `speed/comfort/budget` plans;
- static core-flow Plan B whenever the backend is connected.

Account-level Telegram linking UI may keep an additive endpoint only where it
does not replace a teammate site endpoint.

## Telegram boundary

Keep the additive Telegram API and persistence required by the canonical bot:

- `/api/bot/*`;
- `/api/integrations/telegram/*`;
- account links and link tokens;
- documents and temporary download links;
- SOS;
- notification preferences and outbox;
- assistant context.

Synchronize the bot source with the canonical sanitized archive. In particular,
preserve its `HttpTravelApiClient.get_document_download()` implementation,
which downloads the temporary backend URL into a local temporary file and uses
the URL only as a fallback. Do not alter the Telegram AI provider chain,
assistant handler, SOS behavior, notifications, dependencies, or OpenAPI.

Applying a Plan B through the original teammate endpoint remains the only site
apply action. The integration bridge makes that applied plan visible to the
Telegram assistant context and emits the existing outbox notification without
changing how the plan was generated or selected.

## Verification

Use test-first changes. Contract tests must lock the teammate paths, request and
response shapes, Open-Meteo URLs, original prompt text, exactly three strategies,
plan persistence and application, and the absence of replacement site routes.

Run an isolated end-to-end flow for route segments, geo, weather, monitoring,
assistant history, Plan B generation/application, Telegram assistant context,
and real document download. Provider traffic is mocked in deterministic tests.
Preview smoke checks must not migrate or mutate production storage.

## Deployment boundary

Only feature-branch commits and Preview A deployments are allowed. Do not merge,
promote, or change `main`, production aliases, production deployments, Neon,
the VPS bot service, VPN, x-ui, secrets, or runtime Telegram bindings.

## Self-review

- Canonical code is copied directly; the design does not prescribe rewritten
  site business functions.
- The PostgreSQL adapter is explicitly infrastructure-only and hidden from the
  public site contract.
- Telegram endpoints remain additive and cannot become an alternate site API.
- No step requires a schema migration, production write, secret read, or `.env`.
