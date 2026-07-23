# Isolated Teammate Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare, provision, deploy, and verify the integrated Travel Assistant on new Railway and Vercel projects without touching production.

**Architecture:** A static Vercel frontend calls an Express API on Railway with Bearer JWT authentication. Railway persists Prisma SQLite and document blobs on `/data`; Telegram compatibility is verified through the Python client and an HTTP harness without polling.

**Tech Stack:** Node.js 24, Express 4, Prisma 5, SQLite, Node test runner, static HTML/JS, Python 3, pytest, aiogram, Railway CLI, Vercel CLI.

---

### Task 1: Create the isolated source tree

**Files:**
- Create: `backend/**` from `travel-backend-integrated.zip`
- Create: `frontend/**` from `travel-frontend-vercel (2).zip`
- Create: `telegram-bot/**` from the Telegram archive subtree
- Create: `.gitignore`
- Create: `frontend/.vercelignore`
- Create: `backend/.railwayignore`

- [ ] **Step 1: Verify archive identity and target isolation**

Run:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath `
  'C:\Users\Artem\Downloads\Telegram Desktop\travel-frontend-vercel (1).zip', `
  'C:\Users\Artem\Downloads\Telegram Desktop\travel-frontend-vercel (2).zip'
git -C C:\Projects\travel-assistant-teammate-stack remote -v
```

Expected: equal hashes and no Git remotes.

- [ ] **Step 2: Extract only approved subtrees**

Use a path-traversal-safe ZIP extraction function that skips `.env`,
`cookies.txt`, `*.db`, `*.log`, `node_modules`, `.venv`, caches, and temporary
files. Strip `backend/`, `travel-assistant-final-polished/`, and
`travel-assistant-summer-module-main/telegram-bot/` from destination paths.

- [ ] **Step 3: Add deployment exclusions**

Use these patterns in the root and platform ignore files:

```gitignore
.env
.env.*
!.env.example
cookies.txt
*.db
*.db-journal
*.log
node_modules/
.venv/
__pycache__/
.pytest_cache/
coverage/
tmp/
temp/
.vercel/
.railway/
```

- [ ] **Step 4: Verify forbidden artifacts are absent**

Run:

```powershell
Get-ChildItem C:\Projects\travel-assistant-teammate-stack -Recurse -Force |
  Where-Object { $_.Name -eq '.env' -or $_.Name -eq 'cookies.txt' -or $_.Extension -in '.db','.log' }
```

Expected: no output.

### Task 2: Install clean dependencies and capture baselines

**Files:**
- Modify: `backend/package.json`
- Create: `backend/test/smoke.test.js`
- Existing: `telegram-bot/requirements.txt`

- [ ] **Step 1: Add a failing backend smoke test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('backend exposes a test command and loads the application', () => {
  const app = require('../src/app');
  assert.equal(typeof app, 'function');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test` in `backend`.

Expected: failure because the archive has no `test` script.

- [ ] **Step 3: Add the test script**

Add to `backend/package.json`:

```json
"test": "node --test test"
```

- [ ] **Step 4: Install and verify backend baseline**

Run:

```powershell
npm ci
npx prisma generate
npm test
```

Expected: install and generation exit 0; smoke test passes.

- [ ] **Step 5: Create an isolated Python virtual environment**

Run in `telegram-bot`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: existing consumer/unit suite passes without a Telegram token or live
polling process.

### Task 3: Harden production configuration and CORS

**Files:**
- Create: `backend/test/config.test.js`
- Modify: `backend/src/config.js`
- Modify: `backend/src/app.js`
- Modify: `backend/.env.example`

- [ ] **Step 1: Write failing configuration tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

function freshConfig(env) {
  const before = { ...process.env };
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../src/config')];
  try { return require('../src/config'); }
  finally { process.env = before; delete require.cache[require.resolve('../src/config')]; }
}

test('production exposes only the configured frontend origin', () => {
  const config = freshConfig({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://travel-assistant-teammate-preview.vercel.app' });
  assert.deepEqual(config.corsOrigins, ['https://travel-assistant-teammate-preview.vercel.app']);
});

test('production rejects a missing frontend origin', () => {
  assert.throws(() => freshConfig({ NODE_ENV: 'production', FRONTEND_ORIGIN: '' }), /FRONTEND_ORIGIN/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/config.test.js`.

Expected: failure because `corsOrigins` and validation do not exist.

- [ ] **Step 3: Implement exact-origin configuration**

Parse a comma-separated `FRONTEND_ORIGIN`, validate every value as an HTTPS
origin in production, export `corsOrigins`, and throw for wildcard, localhost,
or missing values in production.

- [ ] **Step 4: Apply an origin callback in Express**

Replace `cors({ origin: true, credentials: true })` with an origin callback that
allows no-origin service calls and configured browser origins only. Return a
normal CORS rejection for all other origins.

- [ ] **Step 5: Verify GREEN and regression suite**

Run: `npm test`.

Expected: all backend tests pass.

### Task 4: Persist JWT sessions and remove implicit demo login

**Files:**
- Create: `frontend/assets/js/auth-storage.js`
- Create: `frontend/tests/auth-storage.test.cjs`
- Modify: `frontend/assets/js/api-client.js`
- Modify: all HTML files that load `api-client.js`
- Modify: modules containing `ensureAuth` calls

- [ ] **Step 1: Write failing storage tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
}

test('remembered tokens survive in local storage and clear from both stores', () => {
  const context = { window: {}, sessionStorage: storage(), localStorage: storage() };
  vm.runInNewContext(fs.readFileSync('assets/js/auth-storage.js', 'utf8'), context);
  context.window.TravelAuthStorage.save('jwt', true);
  assert.equal(context.localStorage.getItem('travel.auth.token'), 'jwt');
  assert.equal(context.window.TravelAuthStorage.load(), 'jwt');
  context.window.TravelAuthStorage.clear();
  assert.equal(context.window.TravelAuthStorage.load(), null);
});
```

- [ ] **Step 2: Verify RED**

Run from `frontend`: `node --test tests/auth-storage.test.cjs`.

Expected: missing `auth-storage.js`.

- [ ] **Step 3: Implement the browser storage helper**

Create an IIFE exposing `save(token, remember)`, `load()`, and `clear()` under
`window.TravelAuthStorage`, using session storage unless remember is true.

- [ ] **Step 4: Integrate storage into `api-client.js`**

Initialize `authToken` from the helper, save returned login/register JWTs,
clear on logout and rejected `/me`, and attach Bearer authentication to JSON,
multipart, and file calls. Remove `DEMO`, credential fallback, and automatic
login from `ensureAuth`; make it only validate the current session.

- [ ] **Step 5: Remove all implicit login callers**

Replace calls such as `ensureAuth(a.demo)` with session restoration followed by
an explicit redirect to `login.html` on 401. Ensure login forms remain the only
place where credentials are submitted.

- [ ] **Step 6: Verify GREEN and scan**

Run:

```powershell
node --test tests/auth-storage.test.cjs
rg -n "artem@example\.test|Password2026|ensureAuth\([^)]*demo|var DEMO" .
```

Expected: test passes; the scan returns no matches outside documentation/tests
that explicitly assert absence.

### Task 5: Enforce exactly three Plan B results

**Files:**
- Create: `backend/src/services/planValidation.js`
- Create: `backend/test/plan-validation.test.js`
- Modify: `backend/src/services/assistant.js`

- [ ] **Step 1: Write failing cardinality tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePlansPayload } = require('../src/services/planValidation');

test('accepts exactly three complete plans', () => {
  const plan = { title: 'A', steps: ['one'], pros: 'p', cons: 'c', whenToUse: 'w' };
  assert.equal(validatePlansPayload({ plans: [plan, plan, plan] }).plans.length, 3);
});

test('rejects any plan count other than three', () => {
  assert.throws(() => validatePlansPayload({ plans: [] }), /ровно 3/i);
  assert.throws(() => validatePlansPayload({ plans: [{}, {}, {}, {}] }), /ровно 3/i);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/plan-validation.test.js`.

Expected: missing module.

- [ ] **Step 3: Implement validation and integrate it**

Validate object shape, exactly three plans, non-empty titles, steps, pros, cons,
and `whenToUse`; return the validated payload. Invoke it after parsing the Groq
JSON response so malformed output becomes a controlled AI error.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`.

Expected: all tests pass.

### Task 6: Bound OCR and use deployed language data

**Files:**
- Create: `backend/test/ocr-runtime.test.js`
- Modify: `backend/src/services/ocr.js`
- Modify: `backend/src/config.js`

- [ ] **Step 1: Write failing runtime tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { withTimeout, tesseractOptions } = require('../src/services/ocr');

test('OCR timeout rejects with a controlled message', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5), /OCR timeout/);
});

test('Tesseract uses packaged uncompressed language data', () => {
  const options = tesseractOptions();
  assert.equal(options.gzip, false);
  assert.equal(path.isAbsolute(options.langPath), true);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/ocr-runtime.test.js`.

Expected: missing exports.

- [ ] **Step 3: Implement timeout and language resolution**

Resolve the backend root containing `rus.traineddata` and `eng.traineddata`,
pass `{ langPath, gzip: false }` to Tesseract, and wrap image recognition plus
PDF-raster OCR in a configurable bounded timeout. Preserve controlled empty or
failed results so uploads remain stored.

- [ ] **Step 4: Run OCR smoke samples**

Use one generated text PDF, one small PNG, and one one-page scanned PDF. Assert
that the text PDF and PNG return non-empty text and that the scan either returns
text or the documented controlled status.

- [ ] **Step 5: Verify GREEN**

Run: `npm test`.

Expected: all tests pass.

### Task 7: Verify backend and Telegram contracts locally

**Files:**
- Create: `backend/scripts/http-harness.mjs`
- Create: `backend/test/http-harness.test.js`
- Existing: `telegram-bot/tests/**`

- [ ] **Step 1: Write a failing local HTTP harness test**

The test starts the backend against a temporary SQLite database, registers a
synthetic user, creates a trip, creates and consumes a Telegram link token with
a synthetic Telegram ID, and verifies trips, today/next, documents, SOS,
notifications, and assistant context. It must not define or read
`TELEGRAM_BOT_TOKEN`.

- [ ] **Step 2: Verify RED**

Run: `node --test test/http-harness.test.js`.

Expected: missing harness module.

- [ ] **Step 3: Implement the reusable harness**

Export a function accepting `baseUrl`, `botServiceToken`, and generated test
identities. Send service authorization and `X-Telegram-User-Id` headers exactly
as `HttpTravelApiClient` does. Never print tokens or JWTs.

- [ ] **Step 4: Verify backend and Python suites**

Run:

```powershell
npm test
..\telegram-bot\.venv\Scripts\python.exe -m pytest -q ..\telegram-bot\tests
```

Expected: all suites pass; no polling process starts.

### Task 8: Create the isolated Vercel project

**Files:**
- Create locally by Vercel: `frontend/.vercel/project.json`

- [ ] **Step 1: Install/check the CLI and authenticate in the browser**

Run from the isolated `frontend` directory only:

```powershell
npx vercel@latest login
npx vercel@latest whoami
```

Expected: browser authentication succeeds. Stop if payment or an upgrade is
requested.

- [ ] **Step 2: Verify the working directory immediately before linking**

Run:

```powershell
(Get-Location).Path
git rev-parse --show-toplevel
Test-Path .vercel
```

Expected: frontend path under the isolated root, isolated Git root, and no
pre-existing `.vercel` metadata.

- [ ] **Step 3: Create/link only the named project**

Run `npx vercel@latest link --yes --project travel-assistant-teammate-preview`
and select the user's Hobby scope. Decline Git connection and environment pull.

- [ ] **Step 4: Verify metadata and exact domain**

Inspect only project identifiers from `.vercel/project.json`; confirm project
name through `vercel project inspect travel-assistant-teammate-preview`. Record
the stable `travel-assistant-teammate-preview.vercel.app` domain or the exact
platform-assigned replacement without deploying the unfinished frontend.

### Task 9: Create the isolated Railway project, service, and volume

**Files:**
- Create locally by Railway: metadata only under the isolated backend directory

- [ ] **Step 1: Install/check the CLI and authenticate in the browser**

Run from the isolated `backend` directory only:

```powershell
npx @railway/cli@latest login
npx @railway/cli@latest whoami
```

Expected: browser authentication succeeds. Stop if Railway asks for a card,
payment, paid subscription, add-on, or plan upgrade.

- [ ] **Step 2: Verify the working directory immediately before linking**

Run:

```powershell
(Get-Location).Path
git rev-parse --show-toplevel
Get-ChildItem -Force | Where-Object Name -Match '^\.railway$'
```

Expected: backend under the isolated root and no production link metadata.

- [ ] **Step 3: Create the named project and empty service**

Use the current CLI's documented `init`/service commands or its browser-opened
project canvas to create only project and service
`travel-assistant-teammate-backend`. Do not attach a Git repository or existing
resource.

- [ ] **Step 4: Create the `/data` volume**

Create one service volume mounted at `/data`. Verify project, environment,
service, and mount path through Railway's own status/JSON output without listing
secret values.

- [ ] **Step 5: Configure non-AI-key variables safely**

Set:

```text
DATABASE_URL=file:/data/prod.db
NODE_ENV=production
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile
TELEGRAM_BOT_USERNAME=travel_assistent10_bot
FRONTEND_DIR=
FRONTEND_ORIGIN=<exact new Vercel origin>
```

Generate `JWT_SECRET` and `BOT_SERVICE_TOKEN` inside one non-interactive process,
pass them directly to Railway, suppress command output that may contain values,
and erase process variables immediately. Do not set `AI_API_KEY`.

- [ ] **Step 6: Configure build/start settings without deploying**

Build command:

```text
npm install && npx prisma generate && npx prisma db push
```

Start command: `npm start`.

- [ ] **Step 7: Run the pre-key gate verification**

Confirm exact project, service, environment, `/data` volume, expected variable
names without values, no billing prompt, no remotes, and no production project
identifiers in local metadata.

- [ ] **Step 8: Stop before `AI_API_KEY`**

Report the seven requested facts and wait for the exact user message
`AI_API_KEY добавлен` before deployment.

### Task 10: Post-key deployment and E2E

**Files:**
- Modify: `frontend/assets/js/api-client.js` with the actual Railway HTTPS URL
- Update: Railway `PUBLIC_BASE_URL`

- [ ] **Step 1: Confirm `AI_API_KEY` exists without reading its value**
- [ ] **Step 2: Deploy Railway from the isolated backend directory**
- [ ] **Step 3: Create the Railway public domain and set `PUBLIC_BASE_URL`**
- [ ] **Step 4: Redeploy and run health, Prisma, OCR, API, and bot harness checks**
- [ ] **Step 5: Set the actual backend URL in the frontend and run placeholder scans**
- [ ] **Step 6: Deploy the static frontend to the isolated Vercel project**
- [ ] **Step 7: Run the complete browser/API E2E scenario from the design**
- [ ] **Step 8: Restart Railway and verify user, trip, document, Telegram link, and assistant persistence**
- [ ] **Step 9: Produce the final isolation, resource, RAM, volume, feature, and readiness report without secrets**
