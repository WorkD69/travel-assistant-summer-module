# Tutu-native Search Results Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать factual flow Home/Search → Search Results → Select → checkout-link поверх frozen Transport Contract V1 R3.

**Architecture:** Существующее событие `tutu-native:search` преобразуется небольшим frontend adapter в `SearchRequestV1` и передаётся через existing `AppRoutes` как URL context на новую Vanilla JS страницу. Страница вызывает методы existing `TravelApi`, хранит только server-issued `selectionToken` рядом с текущей option в памяти контроллера, а сортировка и фильтрация выполняются детерминированно по factual `TransportOptionV1` fields.

**Tech Stack:** Vanilla HTML, CSS, browser JavaScript, Node.js built-in test runner, existing AppShell/AppRoutes/TravelApi.

---

### Task 1: SearchRequest adapter and Home boundary

**Files:**
- Create: `frontend/assets/js/tutu-search-adapter.js`
- Create: `frontend/assets/js/tutu-search-flow.js`
- Modify: `frontend/assets/js/app-routes.js`
- Modify: `frontend/home.html`
- Test: `frontend/tests/tutu-search-results.test.cjs`

- [ ] **Step 1: Write failing mapping and unsupported-input tests**

Add Node VM tests that call `mapSearchDetail(detail, now)` and assert this exact result:

```js
{
  schemaVersion: '1',
  mode: 'flight',
  origin: 'Москва',
  destination: 'Санкт-Петербург',
  departureDate: '2026-08-20',
  returnDate: null,
  passengers: { adults: 1, children: 0, infants: 0 }
}
```

Also assert stable local errors `TUTU_ROUND_TRIP_UNSUPPORTED`,
`TUTU_MULTI_PASSENGER_UNSUPPORTED`, `TUTU_MODE_UNSUPPORTED`, and
`TUTU_DEPARTURE_DATE_REQUIRED` before any navigation/API call.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/tutu-search-results.test.cjs`

Expected: FAIL because `assets/js/tutu-search-adapter.js` does not exist.

- [ ] **Step 3: Implement the minimal adapter and existing-router route**

Expose only these adapter methods:

```js
window.TutuSearchAdapter = Object.freeze({
  mapSearchDetail,
  requestToQuery,
  requestFromQuery,
  messageForLocalError
});
```

Map `flights→flight`, `rail→train`, `buses→bus`, `electric→etrain`; resolve
`Сегодня`, `Завтра`, `Послезавтра`, ISO dates, and Russian `DD.MM.YYYY` without
silently changing unsupported request semantics. Add `search-results.html` to
`KNOWN_PAGES` and `AppRoutes.goToSearchResults(request)` using existing
`appendQuery`. The flow listener consumes only `tutu-native:search`, renders a
local validation message into `.tutu-search-status`, or calls the existing
route method.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node --test tests/tutu-search-results.test.cjs tests/tutu-native-shell.test.cjs`

Expected: all tests pass and the frozen Home shell tests remain green.

### Task 2: API client and factual presentation helpers

**Files:**
- Modify: `frontend/assets/js/api-client.js`
- Create: `frontend/assets/js/tutu-search-results.js`
- Test: `frontend/tests/tutu-search-results.test.cjs`

- [ ] **Step 1: Write failing tests for API calls and factual helpers**

Assert exact POST bodies for:

```js
TravelApi.tutuSearch(request);
TravelApi.tutuCheckoutLink(selectionToken);
```

Assert duration `85→1 ч 25 мин`, transfer pluralization for `0,1,2,5`,
carrier null fallback, optional service number, neutral null price,
`price.kind === 'from'`, and timestamp presentation taken from the explicit ISO
text rather than browser timezone conversion.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/tutu-search-results.test.cjs`

Expected: FAIL because the API methods and results helpers are missing.

- [ ] **Step 3: Implement minimal API methods and helpers**

Add:

```js
tutuSearch: function(request) {
  return req('/api/tutu/search', { method: 'POST', body: request });
},
tutuCheckoutLink: function(selectionToken) {
  return req('/api/tutu/checkout-link', {
    method: 'POST', body: { selectionToken: selectionToken }
  });
}
```

Expose pure functions through `window.TutuSearchResults` for tests and keep
raw provider payload fields out of every helper.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node --test tests/tutu-search-results.test.cjs tests/api-client-auth.test.cjs`

Expected: all focused tests pass.

### Task 3: Deterministic state, sorting, filtering, and selection

**Files:**
- Modify: `frontend/assets/js/tutu-search-results.js`
- Test: `frontend/tests/tutu-search-results.test.cjs`

- [ ] **Step 1: Write failing behavior tests**

Cover provider-order default, cheap sort with null price last, fast sort,
early sort, direct filter, factual carrier filter, search success, loading,
empty results, stable backend error mapping, duplicate-submit protection,
selectionToken propagation, exact checkout URL navigation, and rejection of a
checkout response without `checkout.checkoutUrl`.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/tutu-search-results.test.cjs`

Expected: FAIL at the first missing state/controller behavior.

- [ ] **Step 3: Implement controller state and rendering contract**

Use this internal state only:

```js
{
  request,
  entries: [{ option, selectionToken, providerIndex }],
  status: 'idle' | 'loading' | 'results' | 'empty' | 'error',
  sort: 'default' | 'cheap' | 'fast' | 'early',
  directOnly: false,
  carrier: '',
  pendingSelectionId: null,
  errorMessage: ''
}
```

Never decode, reconstruct, persist, or log `selectionToken`. Read errors only
from the safe `error.data.error.code` envelope. Navigate with the unmodified
`checkout.checkoutUrl` returned by the backend.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node --test tests/tutu-search-results.test.cjs`

Expected: all focused tests pass.

### Task 4: Results page and Tutu-native responsive UI

**Files:**
- Create: `frontend/search-results.html`
- Create: `frontend/assets/css/tutu-search-results.css`
- Modify: `frontend/assets/js/tutu-search-results.js`
- Modify: `frontend/service-worker.js`
- Test: `frontend/tests/tutu-search-results.test.cjs`

- [ ] **Step 1: Write failing structure and honesty tests**

Assert the page loads existing AppShell/AppRoutes/TravelApi, the new adapter
and controller, renders `Выбрать билет`, the four permitted sorts, direct and
carrier filters, skeleton/empty/error states, and contains none of: baggage,
ratings, reviews, delay, cancellation, fare family, invented airport/logo, or
per-person/total price claims.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/tutu-search-results.test.cjs`

Expected: FAIL because `search-results.html` and results CSS do not exist.

- [ ] **Step 3: Implement page and responsive card layout**

Build a dark-blue compact shell, query summary, factual transport context,
selected-date chip, sticky toolbar, centered max-width list, and rounded white
cards. Desktop uses route/action columns; card breakpoint is independent near
`700px`; shell/navigation compacts near `820px`; mobile stacks price/action
below the horizontal route. Use `overflow-wrap`, `min-width:0`, and horizontal
scroll only for toolbar/context chips to prevent page overflow.

- [ ] **Step 4: Run focused tests and syntax checks**

Run:

```powershell
node --test tests/tutu-search-results.test.cjs tests/tutu-native-shell.test.cjs
node --check assets/js/tutu-search-adapter.js
node --check assets/js/tutu-search-flow.js
node --check assets/js/tutu-search-results.js
```

Expected: all commands exit 0.

### Task 5: Full verification and visual correction

**Files:**
- Modify if required: `frontend/assets/css/tutu-search-results.css`
- Create: `outputs/search-results-desktop-1280x720.png`
- Create: `outputs/search-results-mobile-390x844.png`
- Create: `outputs/search-results-tablet-768x720.png`

- [ ] **Step 1: Run full frontend suite**

Run: `node --test tests/*.test.cjs`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run all frontend JavaScript syntax checks**

Run a PowerShell loop invoking `node --check` for every `assets/js/*.js` file.

Expected: every check exits 0.

- [ ] **Step 3: Run local authenticated visual harness and capture viewports**

Serve `frontend/` on localhost, inject only test-harness API responses in the
browser, and capture exact `1280×720`, `390×844`, and `768×720` screenshots.
The fixture stays in the visual harness and is never added to production code.

- [ ] **Step 4: Inspect screenshots and perform one correction pass**

Compare card geometry, hierarchy, density, route line, price/CTA, toolbar,
query context, and mobile stacking to frozen `SEARCH_RESULTS_UI_SPEC.md`. Apply
only CSS corrections justified by the screenshots, then recapture all three.

- [ ] **Step 5: Run final verification**

Run:

```powershell
node --test tests/tutu-search-results.test.cjs
node --test tests/*.test.cjs
git diff --check
git status --short
```

Expected: both test commands and `git diff --check` exit 0; status lists only
the intended frontend, test, plan, and screenshot changes.

### Task 6: Reviewable commits and branch publication

**Files:** All intended files from Tasks 1–5.

- [ ] **Step 1: Review exact diff and backend ownership boundary**

Run `git diff --stat`, `git diff --name-only`, and verify no file under
`backend/`, `telegram-bot/`, deployment/CI, Plan B, monitoring, or TripFactory
is modified.

- [ ] **Step 2: Commit implementation**

Create a conventional commit with header:

```text
feat(search): Add Tutu-native search results flow
```

- [ ] **Step 3: Commit tests and visual evidence**

Create a conventional commit with header:

```text
test(search): Cover factual transport result states
```

- [ ] **Step 4: Push only the feature branch**

Run: `git push -u origin codex/feat/tutu-native-search-results-production`

Expected: remote tracking branch is created; no merge is performed.
