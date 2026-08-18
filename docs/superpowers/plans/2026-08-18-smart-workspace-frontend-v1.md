# Smart Workspace Frontend V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the current Manus task plan with focused review passes (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved Smart Workspace presentation layer to the canonical trip route without changing backend behavior, Phase A/Search, routing, legacy DOM ownership, or real Plan B mutations.

**Architecture:** The feature is an isolated Vanilla JS view-model, renderer, and integration triad mounted after the legacy overview grid. The integration layer mounts only supplied factual view-model data in production; a controlled mock response is available only behind explicit `env=development|test&preview=smart-workspace`. Presentation selection and Apply/Revert states are ephemeral renderer state and never call APIs, localStorage, existing core-flow mutation methods, or legacy DOM controllers.

**Tech Stack:** Static HTML, scoped CSS, browser-native JavaScript, Node.js built-in test runner, Git.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `frontend/assets/js/smart-workspace-view-model.js` | Create | Normalize nullable factual data and map server-supplied ranking references into label lists without any ranking calculation. |
| `frontend/assets/js/smart-workspace-renderer.js` | Create | Render scoped states and local, presentation-only interactions from the normalized view model. |
| `frontend/assets/js/smart-workspace-integration.js` | Create | Gate preview mocks, mount an explicit root, and prevent production fallback. |
| `frontend/assets/css/smart-workspace.css` | Create | Own visual fidelity, accessibility, desktop layout, and 390px responsive behavior under `.smart-workspace`. |
| `frontend/trip-overview.html` | Modify | Link scoped CSS, append only `#smart-workspace-root` after the existing overview grid, and load the three Smart Workspace scripts after legacy feature scripts. |
| `frontend/tests/smart-workspace.test.cjs` | Create | Test contract normalization, ranking ownership, safety guards, and source-level integration boundaries. |
| `docs/superpowers/specs/2026-08-18-smart-workspace-frontend-v1-design.md` | Created and committed | Approved design contract. |

### Task 1: Establish the Smart Workspace view-model contract

**Files:**
- Create: `frontend/assets/js/smart-workspace-view-model.js`
- Create: `frontend/tests/smart-workspace.test.cjs`

- [ ] **Step 1: Write failing contract tests.**

```js
const vm = require('../assets/js/smart-workspace-view-model.js');

test('ranking labels are mapped only from supplied candidate references', () => {
  const result = vm.buildSmartWorkspaceViewModel({
    trip: { id: 'trip-1', route: 'Москва → Санкт-Петербург' },
    candidates: [{ id: 'a', durationMinutes: 100, price: 7150 }, { id: 'c', durationMinutes: 325, price: 5240 }],
    ranking: {
      fastest: { status: 'available', candidateId: 'a' },
      cheapest: { status: 'available', candidateId: 'c' },
      personalized: { status: 'available', candidateId: 'c', reasons: ['минимальная цена'] }
    }
  });
  assert.deepEqual(result.candidates[0].rankingLabels, ['fastest']);
  assert.deepEqual(result.candidates[1].rankingLabels, ['cheapest', 'personalized']);
});

test('normalization preserves nullable factual fields and no initial selection', () => {
  const result = vm.buildSmartWorkspaceViewModel({
    trip: { id: 'trip-1' },
    candidates: [{ id: 'a', carrierName: null, serviceNumber: null, price: null, availability: null }]
  });
  assert.equal(result.selectedCandidateId, null);
  assert.equal(result.candidates[0].carrierName, null);
  assert.equal(result.candidates[0].serviceNumber, null);
  assert.equal(result.candidates[0].price, null);
});
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs`

Expected: `FAIL` because the view-model module does not yet exist.

- [ ] **Step 3: Implement the minimal pure UMD module.**

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceViewModel = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  const LABELS = ['fastest', 'cheapest', 'personalized'];

  function normalizeCandidate(candidate) {
    return Object.assign({
      id: '', carrierName: null, serviceNumber: null, price: null,
      availability: null, rankingLabels: []
    }, candidate || {});
  }

  function labelsByCandidate(candidates, ranking) {
    const result = Object.fromEntries(candidates.map((candidate) => [candidate.id, []]));
    LABELS.forEach((label) => {
      const reference = ranking && ranking[label];
      if (reference && reference.status === 'available' && result[reference.candidateId]) {
        result[reference.candidateId].push(label);
      }
    });
    return result;
  }

  function buildSmartWorkspaceViewModel(input) {
    const source = input || {};
    const candidates = (Array.isArray(source.candidates) ? source.candidates : []).map(normalizeCandidate);
    const labels = labelsByCandidate(candidates, source.ranking || {});
    return Object.assign({
      trip: {}, disruption: null, preferences: [], impact: null, apply: { status: 'idle' },
      revert: { status: 'disabled' }, documents: [], contextRows: [], selectedCandidateId: null
    }, source, {
      candidates: candidates.map((candidate) => Object.assign({}, candidate, { rankingLabels: labels[candidate.id] || [] })),
      selectedCandidateId: null
    });
  }

  return { buildSmartWorkspaceViewModel, labelsByCandidate, normalizeCandidate };
}));
```

- [ ] **Step 4: Run the focused tests and all current frontend tests.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs && node --test tests/*.test.cjs`

Expected: the new tests pass and the current suite remains green.

- [ ] **Step 5: Commit the view-model contract.**

```bash
git add frontend/assets/js/smart-workspace-view-model.js frontend/tests/smart-workspace.test.cjs
git commit -m "feat: add smart workspace view model"
```

### Task 2: Add safety and preview-gate tests before integration code

**Files:**
- Modify: `frontend/tests/smart-workspace.test.cjs`
- Create: `frontend/assets/js/smart-workspace-integration.js`

- [ ] **Step 1: Write failing preview safety tests.**

```js
test('preview is enabled only by an explicit non-production gate', () => {
  assert.equal(integration.isSmartWorkspacePreview({ env: 'development', preview: 'smart-workspace' }), true);
  assert.equal(integration.isSmartWorkspacePreview({ env: 'test', preview: 'smart-workspace' }), true);
  assert.equal(integration.isSmartWorkspacePreview({ env: 'production', preview: 'smart-workspace' }), false);
  assert.equal(integration.isSmartWorkspacePreview({ env: 'development', preview: '' }), false);
});

test('production does not construct fixture data when a view model is absent', () => {
  assert.equal(integration.resolveSmartWorkspaceInput({ env: 'production', preview: '', supplied: null }), null);
});
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs`

Expected: `FAIL` because the integration module does not yet exist.

- [ ] **Step 3: Implement the explicit gate and controlled preview resolver.**

```js
(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SmartWorkspaceIntegration = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  function isSmartWorkspacePreview(params) {
    return !!params && (params.env === 'development' || params.env === 'test') && params.preview === 'smart-workspace';
  }

  function previewMock() {
    return { trip: { id: 'preview-flight', route: 'Москва → Санкт-Петербург' }, disruption: { type: 'CARRIER_CANCELLED', source: 'DEMO_SIMULATION' }, candidates: [], ranking: {} };
  }

  function resolveSmartWorkspaceInput(options) {
    const input = options || {};
    if (input.supplied) return input.supplied;
    return isSmartWorkspacePreview(input) ? previewMock() : null;
  }

  function boot() {
    const rootElement = document.getElementById('smart-workspace-root');
    if (!rootElement || !root.SmartWorkspaceRenderer || !root.SmartWorkspaceViewModel) return;
    const params = new URLSearchParams(root.location.search);
    const supplied = root.__SMART_WORKSPACE_VIEW_MODEL__ || null;
    const input = resolveSmartWorkspaceInput({ env: document.body.getAttribute('data-app-environment'), preview: params.get('preview'), supplied: supplied });
    if (!input) return;
    root.SmartWorkspaceRenderer.mount(rootElement, root.SmartWorkspaceViewModel.buildSmartWorkspaceViewModel(input));
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
  return { isSmartWorkspacePreview, resolveSmartWorkspaceInput, previewMock, boot };
}));
```

- [ ] **Step 4: Run focused and full tests.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs && node --test tests/*.test.cjs`

Expected: `PASS`; production has no fixture fallback.

- [ ] **Step 5: Commit the preview boundary.**

```bash
git add frontend/assets/js/smart-workspace-integration.js frontend/tests/smart-workspace.test.cjs
git commit -m "feat: gate smart workspace preview data"
```

### Task 3: Build the renderer with semantic local presentation state

**Files:**
- Create: `frontend/assets/js/smart-workspace-renderer.js`
- Modify: `frontend/tests/smart-workspace.test.cjs`

- [ ] **Step 1: Write failing renderer-source and state tests.**

```js
test('renderer starts unselected and changes selection only after explicit selection', () => {
  const state = renderer.createPresentationState({ selectedCandidateId: null });
  assert.equal(state.selectedCandidateId, null);
  assert.equal(renderer.selectCandidate(state, 'candidate-a').selectedCandidateId, 'candidate-a');
});

test('renderer carries no backend mutation or browser storage integration', () => {
  const source = fs.readFileSync('assets/js/smart-workspace-renderer.js', 'utf8');
  assert.doesNotMatch(source, /TravelApi|applyPlan\(|revertPlan\(|localStorage|fetch\(/);
});
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs`

Expected: `FAIL` because the renderer module does not yet exist.

- [ ] **Step 3: Implement a UMD renderer with local state only.**

The renderer must expose `createPresentationState`, `selectCandidate`, `render`, and `mount`. `createPresentationState` must always overwrite input `selectedCandidateId` with `null`. `selectCandidate` must return a fresh state containing only the clicked candidate ID. `render` must escape every supplied string, use `<button type="button">` for select/apply/revert actions, disable Apply without selection, and render the exact truthful disruption wording: `ДЕМО-СОБЫТИЕ`, `Симулированное событие демо-режима`, and `Рейс отменён`. It must not contain `Tutu обнаружил`, `перевозчик сообщил`, or `live cancellation` claims.

```js
function createPresentationState() {
  return { selectedCandidateId: null, applied: false, revertStatus: 'disabled', preferences: [] };
}

function selectCandidate(state, candidateId) {
  return Object.assign({}, state, { selectedCandidateId: candidateId || null });
}

function render(rootElement, model, state) {
  rootElement.innerHTML = '<section class="smart-workspace" aria-label="Сопровождение поездки">' + renderState(model, state) + '</section>';
}
```

- [ ] **Step 4: Bind delegated interactions without API calls.**

Use one root click listener. `data-smart-action="select"` sets only `selectedCandidateId`. Preference chip clicks toggle no more than three IDs. `data-smart-action="apply"` sets `applied: true` only when a candidate is selected. `data-smart-action="revert"` advances only the local `revertStatus` presentation state. Re-render after each local state update.

- [ ] **Step 5: Run focused and full tests.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs && node --test tests/*.test.cjs`

Expected: `PASS`.

- [ ] **Step 6: Commit renderer behavior.**

```bash
git add frontend/assets/js/smart-workspace-renderer.js frontend/tests/smart-workspace.test.cjs
git commit -m "feat: render smart workspace states"
```

### Task 4: Add scoped visual system and responsive behavior

**Files:**
- Create: `frontend/assets/css/smart-workspace.css`
- Modify: `frontend/tests/smart-workspace.test.cjs`

- [ ] **Step 1: Write failing CSS boundary tests.**

```js
test('smart workspace CSS is scoped and includes 390px responsive safeguards', () => {
  const css = fs.readFileSync('assets/css/smart-workspace.css', 'utf8');
  assert.match(css, /\.smart-workspace\s*\{/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /:focus-visible/);
});
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs`

Expected: `FAIL` because the scoped stylesheet does not yet exist.

- [ ] **Step 3: Implement only `.smart-workspace`-scoped styles.**

Create purple status cards, orange disruption cards, near-black fastest cards, lavender cheapest cards, soft-violet personalized cards, lime success state, accessible selected ring, white native presentation cards, and sticky Apply bar. Use CSS custom properties local to `.smart-workspace`; do not target `body`, `.card`, `.tab-panel`, or legacy selectors unscoped. At desktop, create two-column module and candidate grids. At `max-width: 960px`, collapse those grids to one column. At `max-width: 390px`, set `padding-inline: 16px`, make actions wrap, set candidate/card `min-width: 0`, and keep the apply row wrapping.

```css
.smart-workspace { --smart-purple:#a181ff; --smart-orange:#ff6e1a; --smart-lime:#d0ff1a; color:#262122; }
.smart-workspace__candidate.is-selected { outline:3px solid #262122; }
.smart-workspace button:focus-visible { outline:3px solid rgba(161,129,255,.75); outline-offset:3px; }
@media (max-width:390px) { .smart-workspace { padding-inline:16px; } .smart-workspace__actions { flex-wrap:wrap; } }
```

- [ ] **Step 4: Run focused and full tests.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs && node --test tests/*.test.cjs`

Expected: `PASS`.

- [ ] **Step 5: Commit visual system.**

```bash
git add frontend/assets/css/smart-workspace.css frontend/tests/smart-workspace.test.cjs
git commit -m "feat: style smart workspace responsively"
```

### Task 5: Mount the feature without changing legacy DOM ownership

**Files:**
- Modify: `frontend/trip-overview.html:8-14, 2220-2222, 4478-4490`
- Modify: `frontend/tests/smart-workspace.test.cjs`

- [ ] **Step 1: Write failing integration-boundary tests.**

```js
test('canonical Trip route mounts Smart Workspace after the legacy overview grid', () => {
  const html = fs.readFileSync('trip-overview.html', 'utf8');
  assert.match(html, /<link rel="stylesheet" href="assets\/css\/smart-workspace\.css"\s*\/>/);
  assert.match(html, /<section id="smart-workspace-root"[^>]*><\/section>/);
  assert.match(html, /assets\/js\/smart-workspace-view-model\.js/);
  assert.match(html, /assets\/js\/smart-workspace-renderer\.js/);
  assert.match(html, /assets\/js\/smart-workspace-integration\.js/);
});

test('Smart Workspace does not modify legacy renderer source files', () => {
  assert.equal(fs.existsSync('features/integration-controller.js'), true);
  assert.equal(fs.existsSync('assets/js/backend-sync.js'), true);
});
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs`

Expected: `FAIL` because the root, CSS link, and scripts are absent.

- [ ] **Step 3: Add only the allowed HTML integration points.**

Insert this stylesheet after `assets/css/trip-monitoring.css`:

```html
<link rel="stylesheet" href="assets/css/smart-workspace.css" />
```

Insert this root immediately after the existing overview grid closes and before `#panel-route`:

```html
<section id="smart-workspace-root" aria-live="polite"></section>
```

Load the three scripts after existing legacy feature scripts and before the inline safety hooks:

```html
<script src="assets/js/smart-workspace-view-model.js"></script>
<script src="assets/js/smart-workspace-renderer.js"></script>
<script src="assets/js/smart-workspace-integration.js"></script>
```

Do not edit `frontend/features/integration-controller.js`, `frontend/assets/js/backend-sync.js`, `frontend/assets/js/workspace-integration.js`, any Phase A/Search file, or backend file.

- [ ] **Step 4: Run focused and full tests.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs && node --test tests/*.test.cjs`

Expected: `PASS`.

- [ ] **Step 5: Commit the canonical-surface integration.**

```bash
git add frontend/trip-overview.html frontend/tests/smart-workspace.test.cjs
git commit -m "feat: mount smart workspace on trip overview"
```

### Task 6: Expand focused coverage for every frozen state

**Files:**
- Modify: `frontend/tests/smart-workspace.test.cjs`

- [ ] **Step 1: Add state and factual-data tests.**

Add tests that inspect pure view-model/render helpers for zero candidates, `not_available` ranking references, null price, carrier, service number, and availability, `priceDelta: null`, no original price text, empty documents, absent hotel/event context, Normal, Disruption, Plan B, preference selection, Impact, Apply, After Apply, and every revert status. Require `selectedCandidateId === null` before any call to `selectCandidate` and assert the duplicate label case places two labels on a single candidate record.

- [ ] **Step 2: Add source safety assertions.**

```js
assert.doesNotMatch(rendererSource, /Tutu обнаружил|перевозчик сообщил|live cancellation/i);
assert.doesNotMatch(rendererSource, /localStorage|TravelApi|fetch\(|applyPlan\(|revertPlan\(/);
assert.doesNotMatch(viewModelSource, /sort\(|Math\.min|Math\.max|match percent|confidence score/i);
```

- [ ] **Step 3: Run the focused test file.**

Run: `cd frontend && node --test tests/smart-workspace.test.cjs`

Expected: all Smart Workspace coverage passes.

- [ ] **Step 4: Run full tests and static checks.**

Run: `cd frontend && node --test tests/*.test.cjs && cd .. && git diff --check && ! git grep -nE '<<<<<<<|=======|>>>>>>>' -- . ':!docs/superpowers/plans/*' ':!docs/superpowers/specs/*'`

Expected: frontend suite passes, `git diff --check` is silent, and the conflict-marker scan prints nothing.

- [ ] **Step 5: Commit final focused tests.**

```bash
git add frontend/tests/smart-workspace.test.cjs
git commit -m "test: cover smart workspace frozen states"
```

### Task 7: Run visual verification and prepare central-review handoff

**Files:**
- Create: `artifacts/screenshots/smart-workspace-desktop-*.png`
- Create: `artifacts/screenshots/smart-workspace-mobile-390-*.png`
- Create: `smart-workspace-frontend-v1.bundle`
- Create: `smart-workspace-frontend-v1.bundle.sha256`
- Create: `SMART_WORKSPACE_FRONTEND_READY.md`

- [ ] **Step 1: Start the existing static frontend server and open the canonical route with explicit preview gate.**

Run: `cd frontend && python3 -m http.server 8000`

Open: `http://127.0.0.1:8000/trip-overview.html?tripId=preview-flight&env=development&preview=smart-workspace`.

Expected: the Smart Workspace is visible only because both the development environment and preview parameter are explicit.

- [ ] **Step 2: Capture actual desktop states.**

Capture Normal, Disruption, Plan B, Impact/Apply, and After Apply from the production frontend implementation. Verify Tutu shell continuity, Smart Layer colors only inside cards, no legacy-card DOM overwrite, and truthful copy.

- [ ] **Step 3: Capture actual mobile 390px states.**

Set viewport width to 390px. Capture Normal, Disruption, Plan B, Impact/Apply, and After Apply. Verify no horizontal overflow, clipped CTA, fixed-width candidate card, or offscreen Apply bar.

- [ ] **Step 4: Run final technical verification.**

Run:

```bash
cd frontend && node --test tests/*.test.cjs
cd .. && git diff --check
git status --short
git log --oneline --decorate -5
```

Expected: all frontend tests pass; whitespace check is silent; changed paths are confined to approved Smart Workspace files and documentation.

- [ ] **Step 5: Create and verify the required Git bundle.**

Run:

```bash
git bundle create smart-workspace-frontend-v1.bundle feat/smart-workspace-frontend-v1
git bundle verify smart-workspace-frontend-v1.bundle
git bundle list-heads smart-workspace-frontend-v1.bundle
sha256sum smart-workspace-frontend-v1.bundle > smart-workspace-frontend-v1.bundle.sha256
```

Expected: the bundle verification succeeds, the listed head is `refs/heads/feat/smart-workspace-frontend-v1` at final HEAD, and the sidecar contains exactly one SHA-256 line.

- [ ] **Step 6: Write the final central-review report and do not start Phase B.**

The report begins with `# SMART_WORKSPACE_FRONTEND_READY` and lists the exact base SHA, final HEAD SHA, changed files, implementation states, view-model boundary, no-ranking confirmation, initial null selection, factual/conditional behavior, desktop and mobile evidence, test result, static checks, untouched backend and Phase A/Search confirmation, screenshot list, intentional differences, bundle verification, SHA-256, and confirmations of no push, merge, or deployment.

- [ ] **Step 7: Commit source and report only; do not push, merge, or deploy.**

```bash
git add frontend docs SMART_WORKSPACE_FRONTEND_READY.md
git commit -m "feat: complete smart workspace frontend v1"
```

Recreate the bundle after the final commit so its head matches the delivered report.
