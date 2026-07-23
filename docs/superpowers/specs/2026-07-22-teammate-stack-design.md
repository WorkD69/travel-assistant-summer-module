# Isolated Teammate Stack Design

## Goal

Deploy and verify the integrated Travel Assistant archives on a completely
separate Railway and Vercel contour without changing any existing production
repository, deployment, database, Telegram process, token, or environment.

## Isolation boundary

- Local root: `C:\Projects\travel-assistant-teammate-stack`.
- Local Git branch: `codex/teammate-preview`; no remotes are configured.
- Railway project and service: `travel-assistant-teammate-backend`.
- Railway environment: the new project's default production environment.
- Railway volume: `/data`; SQLite URL: `file:/data/prod.db`.
- Vercel project: `travel-assistant-teammate-preview` on the Hobby plan.
- Telegram: automated tests, `HttpTravelApiClient`, and an HTTP harness only.
- GitHub, GitVerse, Neon, production Vercel projects, the live backend, and the
  production Telegram bot are outside the authorized boundary.

No command that links or deploys a platform project may run outside the local
root above. Before each `railway link` or `vercel link`, the absolute working
directory and the absence of production metadata must be verified.

## Source selection and secret handling

The backend, frontend, and Telegram bot are extracted into separate folders.
The frontend `(2)` archive is used; `(1)` is an identical duplicate, verified
by SHA-256. Archive `.env`, `cookies.txt`, local databases, logs, dependency
folders, caches, and temporary files are not extracted or tracked.

`.gitignore`, `.vercelignore`, and `.railwayignore` block secrets, databases,
logs, test output, caches, and unrelated components. Generated `JWT_SECRET`
and `BOT_SERVICE_TOKEN` are sent directly to Railway without being printed,
written to files, or added to shell history. `AI_API_KEY` is never handled by
the implementation process; the user adds it in Railway Variables.

## Runtime architecture

The Vercel project serves static frontend assets. The browser calls the Railway
Express API directly using a configured HTTPS base URL. Railway runs one Node
service and stores Prisma SQLite data, uploaded document blobs, Telegram links,
notifications, assistant history, and applied plans in `/data/prod.db`.

Authentication uses the JWT already returned by registration and login. The
frontend stores it in `sessionStorage` by default or `localStorage` when
"remember me" is selected, attaches it as `Authorization: Bearer`, restores the
session via `/api/auth/me`, and removes it on logout or an invalid session.
Cookies remain optional and cannot be required for cross-domain operation.

Backend CORS accepts only the exact stable Vercel preview origin configured in
`FRONTEND_ORIGIN`. Localhost is permitted only when `NODE_ENV` is not
`production`; wildcard origins and current production domains are not allowed.

## Backend changes

The existing functional routes remain intact. Configuration gains explicit
validation for production secrets, database URL, public base URL, and frontend
origin. Health output remains non-sensitive. Upload limits remain bounded.

OCR retains all three paths: `pdf-parse` for text PDFs, `pdfjs-dist` plus
`@napi-rs/canvas` for scanned PDFs, and `tesseract.js` with `rus+eng` for
images. Language data is resolved from the deployed application directory,
and OCR work is bounded by a timeout. Failure never discards the document;
instead it records a controlled status that permits manual correction.

The assistant continues using the backend variables `AI_BASE_URL`,
`AI_API_KEY`, and `AI_MODEL`. Plan generation validates exactly three plans
before returning success. No OpenAI key or provider is introduced.

## Frontend changes

The API base URL is set to the actual Railway HTTPS URL before Vercel deploy.
The hard-coded demo account and all implicit `ensureAuth` login paths are
removed. Pages either restore a valid session or route the user to the login
form. All JSON, multipart upload, and file download requests attach the stored
Bearer token without displaying or logging it.

Existing Leaflet/OpenStreetMap, Open-Meteo, autocomplete, route timeline,
assistant, OCR, document, and Telegram-linking UI modules remain present and
continue to consume backend data.

## Telegram compatibility

The integrated Telegram AI chain is preserved unchanged:

`llama-3.3-70b-versatile` -> `openai/gpt-oss-20b` -> `MockAIProvider`.

No Telegram polling process starts. The Python suite validates handlers and
the `HttpTravelApiClient`. A live HTTP harness validates the backend bot API
using a generated service token and synthetic Telegram user identity, including
link consume, trips, today/next, documents and temporary downloads, messages,
SOS, notification preferences, pending delivery state, and assistant context.

## Provisioning sequence and cost gate

1. Run local dependency installation, tests, builds, Prisma checks, OCR smoke
   tests, and Telegram consumer tests.
2. Authenticate Vercel in the browser and create only
   `travel-assistant-teammate-preview` on Hobby. Obtain its stable domain.
3. Set the exact domain as Railway `FRONTEND_ORIGIN` in local configuration and
   the future Railway variables.
4. Authenticate Railway in the browser. Stop if a card, payment, subscription,
   paid add-on, or plan upgrade is requested.
5. Create project and service `travel-assistant-teammate-backend`, its default
   environment, and the `/data` volume.
6. Configure all variables except `AI_API_KEY`; prepare deployment metadata but
   do not perform the AI-dependent deployment gate.
7. Report the exact project, service, environment, volume status, required key
   name, cost status, and production-isolation status.
8. Resume only after the user writes `AI_API_KEY добавлен`.
9. Deploy Railway, set its generated URL as `PUBLIC_BASE_URL`, redeploy, set the
   frontend API URL, deploy Vercel, and run the full E2E scenario.

## Verification

Automated checks cover production configuration, CORS, JWT persistence helpers,
absence of implicit demo login, exact Plan B cardinality, Prisma initialization,
OCR success/failure behavior, backend route contracts, and Telegram consumer
contracts. Secret scans run before commits and platform uploads.

Post-key E2E creates a new user and the route Syktyvkar -> Moscow -> Antalya,
then verifies session refresh, autocomplete, timeline, map behavior, real
Open-Meteo data, all three OCR samples, real Groq chat, exactly three Plan B
options, plan application, messages, Telegram linking and bot APIs, document
download, SOS, notifications, assistant context, and persistence after a
Railway restart.

## Stop conditions

Work stops before any payment-related action, before handling `AI_API_KEY`, on
any attempted association with a production resource, or when platform state
cannot be proven to belong to the new contour. Production switching is not part
of this design.
