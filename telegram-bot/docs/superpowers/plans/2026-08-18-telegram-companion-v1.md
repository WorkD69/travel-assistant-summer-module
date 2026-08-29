# Telegram Companion V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the current Manus task plan with focused review passes (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a minimal Telegram Companion V1 that reads canonical Trips through the approved bot boundary, shows factual active DEMO_SIMULATION disruption information, and opens the Web workspace without exposing credentials.

**Architecture:** The sole backend exception extends only `GET /api/bot/trips/:tripId`, after its current service-token, Telegram link and Trip-access checks. It resolves the newest matching active `monitoringSignal` to a small nullable `demo_disruption` projection. The Telegram client keeps the existing Aiogram and HTTP-client architecture but replaces the legacy main flow with compact `/start → Мои поездки → summary → Открыть поездку` behavior. No Telegram mutation, direct DB access, Plan B preview, Apply or Revert is introduced.

**Tech Stack:** Node.js built-in test runner and Prisma-backed existing bot route; Python 3.12, aiogram, pydantic v2 and pytest-asyncio.

---

## Locked scope and non-goals

The backend exception is limited to `backend/src/routes/bot.js` plus a focused test file. It does not change the Prisma schema, the Plan B service, the monitoring signal persistence rules, the Tutu adapter, transport contracts, frontend production code, or auth ownership semantics. The notification status remains `TELEGRAM_NOTIFICATION_BACKEND_BLOCKER`; the optional Plan B preview is cut.

| Area | Decision |
|---|---|
| Backend `GET /api/bot/trips/:tripId` | Extend with nullable `demo_disruption` read-model only. |
| Backend list `GET /api/bot/trips` | Do not extend; V1 fetches a detail after a user opens a Trip. |
| Telegram mutations | No Apply, Revert, booking, rebooking or active-Trip selection. |
| Web deep link | One configurable `WEB_APP_BASE_URL`; only factual `tripId` is encoded. |
| Legacy bot surfaces | Not reachable from the new V1 router/menu. |
| Notification | No backend enqueue mutation; report backend blocker. |

### Task 1: Add red backend tests for the narrow `demo_disruption` read-model

**Files:**
- Create: `backend/test/bot-trip-detail-disruption.test.js`
- Test: `backend/test/bot-trip-detail-disruption.test.js`

- [ ] **Step 1: Create an isolated Express/Prisma test harness that loads `createBotRouter` with in-memory stubs for `telegramLink`, `trip`, `participant`, and `monitoringSignal`.**

```js
const response = await requestBotTrip({
  tripId: 'trip-1',
  telegramUserId: '100',
  signal: {
    category: 'plan_b_disruption', source: 'DEMO_SIMULATION', status: 'active',
    detail: JSON.stringify({ type: 'DELAYED', context: { station: 'Казань' } }),
  },
});
assert.deepEqual(response.body.demo_disruption, {
  category: 'plan_b_disruption', source: 'DEMO_SIMULATION', status: 'active',
  type: 'DELAYED', context: { station: 'Казань' },
});
```

- [ ] **Step 2: Add failing tests for no matching active signal, non-demo source, inactive signal, other category, malformed `detail`, foreign user, and revoked participant.**

```js
assert.equal(response.body.demo_disruption, null);
assert.equal(response.statusCode, 403);
```

- [ ] **Step 3: Run the focused backend test and confirm it fails because `demo_disruption` is absent.**

Run: `cd backend && node --test test/bot-trip-detail-disruption.test.js`

Expected: assertion failure showing `undefined` instead of the required projection.

### Task 2: Implement the minimal read-only backend projection

**Files:**
- Modify: `backend/src/routes/bot.js`
- Test: `backend/test/bot-trip-detail-disruption.test.js`

- [ ] **Step 1: Add a local projection helper that accepts only a signal with exact `category`, `source`, and `status` values, safely parses JSON object `detail`, copies only `type` and object `context`, and returns `null` otherwise.**

```js
function demoDisruptionProjection(signal) {
  if (!signal || signal.category !== 'plan_b_disruption' ||
      signal.source !== 'DEMO_SIMULATION' || signal.status !== 'active') return null;
  const detail = jsonParse(signal.detail, {});
  return {
    category: signal.category,
    source: signal.source,
    status: signal.status,
    type: typeof detail.type === 'string' ? detail.type : null,
    context: detail.context && typeof detail.context === 'object' && !Array.isArray(detail.context)
      ? detail.context : null,
  };
}
```

- [ ] **Step 2: In only `GET /api/bot/trips/:tripId`, after existing `loadAccessibleTrip` succeeds, read the latest `monitoringSignal` with exact fixed selector and append `demo_disruption` to the pre-existing `serializeTrip` output. Do not change the list endpoint or error flow.**

```js
const signal = await prisma.monitoringSignal.findFirst({
  where: { tripId: r.trip.id, category: 'plan_b_disruption', source: 'DEMO_SIMULATION', status: 'active' },
  orderBy: { createdAt: 'desc' },
});
res.json({ ...serializeTrip(r.trip, r.roleInfo), demo_disruption: demoDisruptionProjection(signal) });
```

- [ ] **Step 3: Re-run the focused backend test and confirm every projection/access test passes.**

Run: `cd backend && node --test test/bot-trip-detail-disruption.test.js`

Expected: all tests pass.

- [ ] **Step 4: Commit the backend exception separately.**

```bash
git add backend/src/routes/bot.js backend/test/bot-trip-detail-disruption.test.js
git commit -m "feat(bot): expose active demo disruption read-model"
```

### Task 3: Add red Telegram contract and deep-link tests

**Files:**
- Modify: `telegram-bot/tests/test_trips.py`
- Modify: `telegram-bot/tests/test_deep_links.py`
- Modify: `telegram-bot/tests/test_handlers.py`
- Create: `telegram-bot/tests/test_companion_v1.py`

- [ ] **Step 1: Add failing model/client tests showing `Trip` accepts a nullable `demo_disruption` and handler output includes concise demonstration wording only for exact active DEMO_SIMULATION data.**

```python
assert "⚠️ Демо-событие" in rendered
assert "Для демонстрации в поездке создано событие" in rendered
assert "Tutu обнаружил" not in rendered
assert "Перевозчик сообщил" not in rendered
```

- [ ] **Step 2: Add failing deep-link tests requiring exactly one configured base and a safe factual `tripId` route without JWT, token, selectionToken or proposal IDs.**

```python
url = DeepLinkService("https://travel.example").trip("trip-1")
assert url == "https://travel.example/trip-overview.html?tripId=trip-1"
for forbidden in ("jwt", "token", "selectiontoken", "proposal"):
    assert forbidden not in url.lower()
```

- [ ] **Step 3: Add failing router/menu tests for the exact V1 command list and assert no legacy B2 callback/action is reachable through the new flow.**

```python
assert commands == {"start", "trips", "help"}
assert "trips:select:" not in V1_CALLBACK_PREFIXES
assert all("plan" not in callback for callback in reachable_callbacks)
```

- [ ] **Step 4: Run only the new/affected Telegram tests and confirm each failure corresponds to absent V1 behavior.**

Run: `cd telegram-bot && pytest -q tests/test_companion_v1.py tests/test_deep_links.py tests/test_handlers.py tests/test_trips.py`

Expected: failures for missing field, legacy links/menu, and no DEMO rendering.

### Task 4: Implement compact V1 Telegram behavior

**Files:**
- Modify: `telegram-bot/app/bot.py`
- Modify: `telegram-bot/app/handlers/__init__.py`
- Modify: `telegram-bot/app/handlers/start.py`
- Modify: `telegram-bot/app/handlers/trips.py`
- Modify: `telegram-bot/app/keyboards/main_menu.py`
- Modify: `telegram-bot/app/keyboards/inline.py`
- Modify: `telegram-bot/app/services/deep_links/service.py`
- Modify: `telegram-bot/app/schemas/models.py`
- Modify: `telegram-bot/app/services/travel_api/base.py`
- Modify: `telegram-bot/app/services/travel_api/http_client.py`
- Modify: `telegram-bot/app/services/travel_api/mock_client.py`
- Modify: `telegram-bot/app/utils/formatting.py`
- Test: `telegram-bot/tests/test_companion_v1.py`

- [ ] **Step 1: Update the typed API model and both client implementations to carry a nullable `DemoDisruption` without inventing data.**

```python
class DemoDisruption(BaseModel):
    category: Literal["plan_b_disruption"]
    source: Literal["DEMO_SIMULATION"]
    status: Literal["active"]
    type: str | None = None
    context: dict[str, Any] | None = None

class Trip(BaseModel):
    # existing factual fields
    demo_disruption: DemoDisruption | None = None
```

- [ ] **Step 2: Replace the V1 startup/menu surface with one reply action `🧳 Мои поездки`, a concise companion explanation and safe not-linked linking prompt. Keep the pre-existing linking model unchanged.**

```python
await message.answer(
    "Travel Assistant сопровождает конкретную поездку. "
    "Статусы в Telegram основаны на доступных данных поездки.",
    reply_markup=main_menu(),
)
```

- [ ] **Step 3: Make `Мои поездки` request accessible canonical Trips, sort active Trips first locally only by factual `Trip.status`, render a compact list and fetch `GET /api/bot/trips/:tripId` only after the user chooses a Trip.**

```python
trips = sorted(await api.get_trips(user_id), key=lambda trip: trip.status != "active")
trip = await api.get_trip(user_id, selected_trip_id)
```

- [ ] **Step 4: Render only factual route, available dates, factual Trip status, and the guarded DEMO warning. Do not render PNR, ticket, purchase, seat, fake price or provider claims.**

```python
if trip.demo_disruption is not None:
    lines.extend([
        "⚠️ Демо-событие",
        "Для демонстрации в поездке создано событие: " + safe_disruption_type(trip.demo_disruption.type),
    ])
```

- [ ] **Step 5: Centralize V1 web route construction in `DeepLinkService`, use the existing `WEB_APP_BASE_URL`, and build the existing canonical `trip-overview.html?tripId=<urlencoded-trip-id>` route. The URL must contain no credentials or opaque selections.**

```python
return f"{self._base}/trip-overview.html?tripId={quote(trip_id, safe='')}"
```

- [ ] **Step 6: Register only the compact V1 routers and command list. Do not include legacy Today/Next/Documents/SOS/Assistant/Notifications/Settings/Demo routers in the V1 startup. The legacy files may remain present but no V1 menu, command or callback leads to them.**

```python
modules = [common, start, trips, help_handler]
BOT_COMMANDS = [BotCommand(command="start", description="Начать"), BotCommand(command="trips", description="Мои поездки")]
```

- [ ] **Step 7: Run focused Telegram tests and confirm green.**

Run: `cd telegram-bot && pytest -q tests/test_companion_v1.py tests/test_deep_links.py tests/test_handlers.py tests/test_trips.py`

Expected: all selected tests pass.

- [ ] **Step 8: Commit Telegram V1 implementation and tests after the focused suite is green.**

```bash
git add telegram-bot/app telegram-bot/tests telegram-bot/.env.example telegram-bot/README.md
git commit -m "feat(telegram): add minimal trip companion v1"
```

### Task 5: Regression, security review and bundle

**Files:**
- Create: `telegram-companion-v1.bundle`
- Modify: `telegram-bot/README.md`
- Test: all existing backend and Telegram tests

- [ ] **Step 1: Document the single configuration key, V1 action scope, no-notification blocker, and no Plan B mutations in the Telegram README without adding secrets.**

- [ ] **Step 2: Execute complete backend and Telegram suites.**

```bash
cd backend && npm test
cd ../telegram-bot && pytest -q
```

Expected: both suites pass.

- [ ] **Step 3: Run static safety and repository checks.**

```bash
git diff --check
grep -RInE '^(<<<<<<<|=======|>>>>>>>)' backend/src telegram-bot/app telegram-bot/tests || true
git diff --cached --check
```

Expected: no whitespace errors or conflict markers. Inspect the working diff for secret values; run `gitleaks detect --no-git --source .` when available.

- [ ] **Step 4: Create the requested unmerged branch and standalone bundle after all checks pass.**

```bash
git checkout -b feat/telegram-companion-v1
git bundle create telegram-companion-v1.bundle integration/hackathon-2026..feat/telegram-companion-v1
git bundle verify telegram-companion-v1.bundle
git bundle list-heads telegram-companion-v1.bundle
sha256sum telegram-companion-v1.bundle
```

Expected: bundle verifies, points to `feat/telegram-companion-v1`, and has a recorded SHA-256. Do not merge or push it.

## Plan self-review

| Check | Result |
|---|---|
| Every approved backend requirement has a task | Yes: Tasks 1–2. |
| Core Telegram flow is complete and compact | Yes: Task 4. |
| Notification and Plan B restrictions are retained | Yes: locked scope and Tasks 4–5. |
| Tests precede production code | Yes: Tasks 1 and 3 are red-first. |
| Backend access isolation is explicitly tested | Yes: Task 1. |
| No unrelated backend/frontend/Prisma change is planned | Yes. |
| Delivery forbids merges/pushes | Yes: Task 5. |
