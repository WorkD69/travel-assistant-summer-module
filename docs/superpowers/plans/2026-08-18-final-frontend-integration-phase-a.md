# Final Frontend Integration Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the current Manus task plan with focused review passes or the inline execution workflow task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать factual Search Results → isolated checkout → explicit demo purchase → canonical Trip flow, используя один runtime-configured API origin и не изменяя backend или Smart Workspace UI.

**Architecture:** `runtime-config.js` является единственной общей bootstrap point и выполняется до `api-client.js` на каждой production page. Search Results контроллер хранит opaque selection token и idempotency key исключительно в замыкании текущей страницы; он синхронно открывает управляемый placeholder, изолирует `opener`, валидирует HTTPS checkout URL, а после demo success перечитывает canonical Trip до существующего route handoff.

**Tech Stack:** Vanilla JavaScript IIFE, HTML/CSS, Node.js built-in `node:test`, `node:vm`, existing `TravelApi` and `AppRoutes`.

---

## File map

| Файл | Изменение | Ответственность |
|---|---|---|
| `frontend/assets/js/runtime-config.js` | Создать | Общая runtime bootstrap point: устанавливает `window.TRAVEL_API_BASE` из единственной configurable injection point до API-клиента. |
| `frontend/assets/js/api-client.js` | Изменить | Убирает B2 backend/build path; добавляет `tutuDemoPurchaseSuccess(selectionToken, idempotencyKey)`. |
| `frontend/assets/js/tutu-search-results.js` | Изменить | Управляет popup-safe placeholder, transient selection intent, demo purchase, canonical reread и safe error states. |
| `frontend/assets/css/tutu-search-results.css` | Изменить | Стили изолированного demo-confirmation блока без изменений Smart Workspace. |
| `frontend/*.html` с API-клиентом | Изменить | Загружают общий runtime bootstrap строго до `api-client.js`. |
| `frontend/service-worker.js` | Изменить | Precache runtime bootstrap и удалить B2 cache identifier. |
| `frontend/tests/final-frontend-integration-phase-a.test.cjs` | Создать | Focused unit/DOM-style tests для runtime, checkout, token lifecycle, demo purchase и canonical handoff. |
| `frontend/tests/production-build.test.cjs` | Изменить | Заменяет B2-specific build assertions на отсутствие historical backend и наличие общего runtime bootstrap. |

### Task 1: Runtime bootstrap и API-client contract

**Files:**
- Create: `frontend/assets/js/runtime-config.js`
- Modify: `frontend/assets/js/api-client.js:1-120`
- Modify: `frontend/home.html`, `frontend/search-results.html`, `frontend/index.html`, `frontend/login.html`, `frontend/register.html`, `frontend/password-recovery.html`, `frontend/invitation.html`, `frontend/profile.html`, `frontend/history.html`, `frontend/trip-wizard.html`, `frontend/trip-overview.html`
- Modify: `frontend/service-worker.js`
- Modify: `frontend/tests/production-build.test.cjs`
- Test: `frontend/tests/final-frontend-integration-phase-a.test.cjs`

- [ ] **Step 1: Write failing runtime/API tests.**

```js
test('common runtime bootstrap precedes api-client on every production page', () => {
  for (const page of productionPages) {
    const html = read(page);
    assert.ok(html.indexOf('assets/js/runtime-config.js') < html.indexOf('assets/js/api-client.js'));
  }
});

test('runtime bootstrap sets one release origin before TravelApi loads', () => {
  const context = { window: { TRAVEL_RELEASE_API_BASE: 'https://release.example.test/' } };
  run('assets/js/runtime-config.js', context);
  run('assets/js/api-client.js', context);
  assert.equal(context.window.TravelApi.base, 'https://release.example.test');
});

test('demo purchase sends exact body and stable idempotency header', async () => {
  const calls = [];
  const api = loadApi(calls);
  await api.tutuDemoPurchaseSuccess('opaque-token', 'a'.repeat(32));
  assert.deepEqual(JSON.parse(calls[0].init.body), { selectionToken: 'opaque-token' });
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'a'.repeat(32));
});
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `cd frontend && node --test tests/final-frontend-integration-phase-a.test.cjs`

Expected: `FAIL` because `runtime-config.js` and `TravelApi.tutuDemoPurchaseSuccess` do not exist and production pages do not load the bootstrap.

- [ ] **Step 3: Implement the minimum runtime/API surface.**

```js
// assets/js/runtime-config.js
(function () {
  'use strict';
  var configured = typeof window.TRAVEL_RELEASE_API_BASE === 'string'
    ? window.TRAVEL_RELEASE_API_BASE
    : '';
  if (typeof window.TRAVEL_API_BASE !== 'string') {
    window.TRAVEL_API_BASE = configured;
  }
}());

// assets/js/api-client.js additions
var BASE = typeof window.TRAVEL_API_BASE === 'string' ? window.TRAVEL_API_BASE : '';
BASE = stripTrail(BASE);

tutuDemoPurchaseSuccess: function (selectionToken, idempotencyKey) {
  return req('/api/tutu/demo-purchase-success', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { selectionToken: selectionToken }
  });
}
```

Load `assets/js/runtime-config.js` immediately before `assets/js/api-client.js` in every listed production HTML page. Replace only B2-specific cache/build identifiers with a neutral release identifier and precache the runtime bootstrap. Do not place a release URL in individual pages or API client source.

- [ ] **Step 4: Run focused test and all existing API tests to verify GREEN.**

Run: `cd frontend && node --test tests/final-frontend-integration-phase-a.test.cjs tests/api-client-auth.test.cjs tests/auth-remember-session.test.cjs tests/production-build.test.cjs`

Expected: all tests pass; B2 Railway origin is absent from final execution files.

- [ ] **Step 5: Commit the isolated runtime/API change.**

```bash
git add frontend/assets/js/runtime-config.js frontend/assets/js/api-client.js frontend/*.html frontend/service-worker.js frontend/tests/final-frontend-integration-phase-a.test.cjs frontend/tests/production-build.test.cjs
git commit -m "feat: configure final frontend API runtime"
```

### Task 2: Popup-safe factual checkout

**Files:**
- Modify: `frontend/assets/js/tutu-search-results.js:90-475`
- Modify: `frontend/tests/final-frontend-integration-phase-a.test.cjs`
- Test: `frontend/tests/tutu-search-results.test.cjs`

- [ ] **Step 1: Write failing checkout handoff tests.**

```js
test('checkout opens a synchronous managed placeholder and isolates its opener', async () => {
  const placeholder = { opener: 'parent', location: { replace(url) { this.url = url; } }, close() {} };
  const opened = [];
  const controller = controllerWith({
    openPlaceholder() { opened.push(true); return placeholder; },
    api: checkoutApi('https://avia.tutu.ru/checkout')
  });
  await searchOne(controller);
  await controller.select('option-1');
  assert.deepEqual(opened, [true]);
  assert.equal(placeholder.opener, null);
  assert.equal(placeholder.location.url, 'https://avia.tutu.ru/checkout');
});

test('checkout stops before API call when the synchronous placeholder is blocked', async () => {
  const api = checkoutApi('https://avia.tutu.ru/checkout');
  const controller = controllerWith({ openPlaceholder() { return null; }, api });
  await searchOne(controller);
  await controller.select('option-1');
  assert.equal(api.checkoutCalls, 0);
  assert.match(controller.getState().errorMessage, /всплывающ|окно/i);
});

test('checkout closes placeholder without navigation for API error or invalid URL', async () => {
  const placeholder = closablePlaceholder();
  const controller = controllerWith({ openPlaceholder() { return placeholder; }, api: checkoutApi('javascript:alert(1)') });
  await searchOne(controller);
  await controller.select('option-1');
  assert.equal(placeholder.closed, true);
  assert.equal(placeholder.location.url, undefined);
});
```

- [ ] **Step 2: Run focused test and verify RED.**

Run: `cd frontend && node --test tests/final-frontend-integration-phase-a.test.cjs`

Expected: `FAIL` because `createController` currently navigates the source tab after awaiting checkout and has no placeholder dependency.

- [ ] **Step 3: Implement the minimum checkout controller changes.**

```js
function openCheckoutPlaceholder() {
  return window.open('', '_blank');
}

async function select(optionId) {
  if (state.pendingSelectionId) return false;
  const entry = state.entries.find(function (item) { return item.option.id === optionId; });
  if (!entry) return false;
  const placeholder = openPlaceholder();
  if (!placeholder) {
    state = Object.assign({}, state, { errorMessage: 'Браузер заблокировал новое окно оформления. Разрешите всплывающие окна и повторите попытку.' });
    publish();
    return false;
  }
  placeholder.opener = null;
  state = Object.assign({}, state, { pendingSelectionId: optionId, errorMessage: '' });
  publish();
  try {
    const response = await api.tutuCheckoutLink(entry.selectionToken);
    const checkoutUrl = response && response.checkout && response.checkout.checkoutUrl;
    if (typeof checkoutUrl !== 'string' || !isSafeCheckoutUrl(checkoutUrl)) throw new Error('Checkout response URL is unavailable');
    placeholder.location.replace(checkoutUrl);
    state = Object.assign({}, state, { selectionIntent: createIntent(entry) });
  } catch (error) {
    try { placeholder.close(); } catch (_) {}
    state = Object.assign({}, state, { errorMessage: messageForCheckoutError(error) });
  } finally {
    state = Object.assign({}, state, { pendingSelectionId: null });
    publish();
  }
  return true;
}
```

Inject `openPlaceholder` into `createController` for tests and use `window.open('', '_blank')` as its production default. Do not pass `noopener` in `window.open` features; set `placeholder.opener = null` as the mandatory isolation mechanism. Remove any source-tab checkout `navigate` path.

- [ ] **Step 4: Run checkout and existing Search Results tests to verify GREEN.**

Run: `cd frontend && node --test tests/final-frontend-integration-phase-a.test.cjs tests/tutu-search-results.test.cjs`

Expected: all checkout paths preserve the Results tab, only validated HTTPS reaches `placeholder.location.replace`, blocked/error paths close or avoid opening a provider page.

- [ ] **Step 5: Commit the isolated checkout change.**

```bash
git add frontend/assets/js/tutu-search-results.js frontend/tests/final-frontend-integration-phase-a.test.cjs frontend/tests/tutu-search-results.test.cjs
git commit -m "feat: isolate factual checkout handoff"
```

### Task 3: Explicit demo purchase and canonical Trip handoff

**Files:**
- Modify: `frontend/assets/js/tutu-search-results.js:90-475`
- Modify: `frontend/assets/css/tutu-search-results.css`
- Modify: `frontend/tests/final-frontend-integration-phase-a.test.cjs`
- Test: `frontend/tests/tutu-search-results.test.cjs`

- [ ] **Step 1: Write failing demo purchase and canonical reread tests.**

```js
test('selection token is never emitted to URL, storage, or rendered card HTML', async () => {
  const controller = controllerWith({ api: checkoutApi('https://avia.tutu.ru/checkout') });
  await searchOne(controller, 'opaque-token');
  await controller.select('option-1');
  assert.doesNotMatch(renderedHtml, /opaque-token/);
  assert.equal(storageWrites.length, 0);
  assert.doesNotMatch(lastNavigation, /opaque-token/);
});

test('demo retry and double click reuse one stable idempotency key', async () => {
  const keys = [];
  const controller = controllerWith({ api: demoApi({ keys, responses: [new Error('network'), { created: false, tripId: 'trip-7' }] }) });
  await searchAndCheckout(controller);
  await controller.confirmDemoPurchase();
  await controller.confirmDemoPurchase();
  assert.deepEqual(keys, [keys[0], keys[0]]);
  assert.match(keys[0], /^.{16,128}$/);
});

test('201 and 200 converge through canonical GET before existing route navigation', async () => {
  for (const created of [true, false]) {
    const events = [];
    const controller = controllerWith({ api: demoApi({ response: { created, tripId: 'trip-9' }, events }), goToTrip(id) { events.push(['route', id]); } });
    await searchAndCheckout(controller);
    await controller.confirmDemoPurchase();
    assert.deepEqual(events, [['post', 'trip-9'], ['get', 'trip-9'], ['route', 'trip-9']]);
  }
});

test('canonical load failure does not navigate or construct a fixture Trip', async () => {
  const routes = [];
  const controller = controllerWith({ api: demoApi({ getTripError: new Error('offline') }), goToTrip(id) { routes.push(id); } });
  await searchAndCheckout(controller);
  await controller.confirmDemoPurchase();
  assert.deepEqual(routes, []);
  assert.match(controller.getState().errorMessage, /поездк/i);
});
```

- [ ] **Step 2: Run focused test and verify RED.**

Run: `cd frontend && node --test tests/final-frontend-integration-phase-a.test.cjs`

Expected: `FAIL` because no demo confirmation UI/action, idempotency lifecycle or canonical reread exists.

- [ ] **Step 3: Implement the minimum transient intent and UI.**

```js
function createIdempotencyKey() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.prototype.map.call(bytes, function (value) { return value.toString(16).padStart(2, '0'); }).join('');
}

async function confirmDemoPurchase() {
  const intent = state.selectionIntent;
  if (!intent || state.demoPurchasePending) return false;
  state = Object.assign({}, state, { demoPurchasePending: true, errorMessage: '' });
  publish();
  try {
    const result = await api.tutuDemoPurchaseSuccess(intent.selectionToken, intent.idempotencyKey);
    if (!result || typeof result.tripId !== 'string' || (result.created !== true && result.created !== false)) throw new Error('Demo purchase response is invalid');
    await api.getTrip(result.tripId);
    goToTrip(result.tripId);
  } catch (error) {
    state = Object.assign({}, state, { errorMessage: messageForDemoPurchaseError(error) });
  } finally {
    state = Object.assign({}, state, { demoPurchasePending: false });
    publish();
  }
  return true;
}
```

Render the confirmation only when `state.selectionIntent` is present. Its visible copy must say: `Демонстрационное подтверждение для Travel Assistant. Это не покупка у Туту или перевозчика.` Include a distinct button whose disabled state follows `demoPurchasePending`. Keep `selectionToken` and `idempotencyKey` out of HTML attributes, URL and browser storage. Expose `confirmDemoPurchase` only on the controller public API and call it from a delegated `data-results-demo-purchase` click handler.

- [ ] **Step 4: Run focused and Search Results regression tests to verify GREEN.**

Run: `cd frontend && node --test tests/final-frontend-integration-phase-a.test.cjs tests/tutu-search-results.test.cjs`

Expected: every required demo/error path is green; `201` and `200` navigate only after `TravelApi.getTrip`, and `AppRoutes.goToTrip(tripId)` is the sole Trip handoff.

- [ ] **Step 5: Commit the isolated demo purchase change.**

```bash
git add frontend/assets/js/tutu-search-results.js frontend/assets/css/tutu-search-results.css frontend/tests/final-frontend-integration-phase-a.test.cjs frontend/tests/tutu-search-results.test.cjs
git commit -m "feat: add demo purchase canonical trip handoff"
```

### Task 4: Full frontend verification and delivery bundle

**Files:**
- Modify: `docs/superpowers/plans/2026-08-18-final-frontend-integration-phase-a.md` only to mark executed steps after each observed result.
- Create: `outputs/frontend-integration-phase-a-<HEAD>.zip`
- Create: `outputs/frontend-integration-phase-a-<HEAD>.zip.sha256`

- [ ] **Step 1: Run the complete frontend suite.**

Run: `cd frontend && node --test tests/*.test.cjs`

Expected: complete suite exits 0 with no test failures.

- [ ] **Step 2: Run source and diff safety checks.**

Run:

```bash
git diff --check 3b9fbd90703027cdbd6e7815167d73064d0bf702..HEAD
git grep -nE '<<<<<<<|=======|>>>>>>>' -- . ':!docs/superpowers/plans/*'
git diff --name-only 3b9fbd90703027cdbd6e7815167d73064d0bf702..HEAD -- backend/src backend/prisma
```

Expected: no whitespace errors, no conflict markers and no changed backend paths.

- [ ] **Step 3: Build a reproducible standalone bundle.**

Run:

```bash
HEAD=$(git rev-parse --short HEAD)
mkdir -p outputs
zip -qr "outputs/frontend-integration-phase-a-${HEAD}.zip" frontend docs/superpowers/specs/2026-08-18-final-frontend-integration-phase-a-design.md
sha256sum "outputs/frontend-integration-phase-a-${HEAD}.zip" | tee "outputs/frontend-integration-phase-a-${HEAD}.zip.sha256"
```

Expected: one ZIP containing runtime assets, tests and approved design spec plus a SHA-256 sidecar.

- [ ] **Step 4: Commit source, test and documentation changes without merging or pushing.**

```bash
git add frontend docs/superpowers/specs docs/superpowers/plans
git commit -m "test: verify frontend integration phase A"
```

Expected: the branch remains `feat/final-frontend-integration-phase-a`; no merge to `integration/hackathon-2026` or `main` and no push occur.

## Plan self-review

The plan implements every approved design requirement: one runtime bootstrap before API client, no B2 final execution, managed popup placeholder with `opener` isolation, validated HTTPS navigation, explicit demo purchase, transient-only token/key lifecycle, 201/200 convergence, canonical reread before existing route, error states and full frontend regression coverage. It changes no backend or Smart Workspace files and does not introduce a new route, fixture Trip or page-specific API base.
