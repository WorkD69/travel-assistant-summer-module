# Egor Core Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the current Manus task plan with focused review passes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove implicit demo Trip authority from normal frontend runtime, fail closed on a missing production JWT secret, and make frontend CI execute the existing suite from its required working directory.

**Architecture:** The existing backend Trip API remains canonical. Frontend integration modules will resolve a Trip ID from URL or already-hydrated shared state only; an absent ID cancels Trip-scoped backend calls instead of selecting a fixture. Legacy fixtures remain in source only for isolated preview/test paths and are not selected by normal boot. This plan explicitly excludes Trip route access policy, document visibility, Plan B, MCP, schema, Telegram, and deployment.

**Tech Stack:** Vanilla JavaScript, Node.js built-in test runner, Express runtime configuration, GitHub Actions.

---

### Task 1: Lock the no-implicit-demo-trip frontend contract

**Files:**
- Create: `frontend/tests/no-demo-trip-fallback.test.cjs`
- Modify: `frontend/features/app-state.js`
- Modify: `frontend/assets/js/app-state-bridge.js`
- Modify: `frontend/assets/js/ai-assistant.js`
- Modify: `frontend/assets/js/backend-sync.js`
- Modify: `frontend/assets/js/coreflow-sync.js`
- Modify: `frontend/assets/js/docs-sync.js`
- Modify: `frontend/assets/js/members-sync.js`
- Modify: `frontend/assets/js/trip-pages.js`

- [ ] **Step 1: Write failing source-level invariant tests.**

The test must read the named runtime modules and assert that they do not contain a `return "trip-turkey-2026"` fallback, that normal boot does not invoke `seedExtension()` unless an explicit preview-only mode is active, and that `coreflow-sync.js` returns before its API calls when no Trip ID resolves.

- [ ] **Step 2: Run the focused test before implementation.**

Run: `cd frontend && node --test tests/no-demo-trip-fallback.test.cjs`

Expected: **FAIL** because the source currently contains silent Turkey fallback returns and normal browser boot seeds the demo catalog.

- [ ] **Step 3: Implement the smallest no-ID contract.**

Replace each runtime resolver’s final Turkey fallback with `null`. Add an early `if (!id) return;` before each Trip-scoped backend call. In `ai-assistant.js`, leave the panel in a no-selected-Trip state and do not call Trip-scoped APIs. In `trip-pages.js`, a missing edit ID produces a blocked state and never fills the model with Turkey data. Make base state and `app-state-bridge` select seeded fixtures only for an explicit, non-normal preview path; normal boot starts with an empty Trip collection and no active Trip ID.

- [ ] **Step 4: Run the focused test after implementation.**

Run: `cd frontend && node --test tests/no-demo-trip-fallback.test.cjs`

Expected: **PASS**.

- [ ] **Step 5: Run the complete frontend suite.**

Run: `cd frontend && node --test "tests/*.test.cjs"`

Expected: all existing tests plus the new invariant suite pass.

### Task 2: Fail closed for a missing production JWT secret

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/test/config.test.js`

- [ ] **Step 1: Write failing config regression tests.**

Test the module in an isolated Node process/environment. It must reject startup configuration when `NODE_ENV=production` and `JWT_SECRET` is absent, empty, or equal to the existing insecure development fallback. It must preserve a non-production development fallback and accept a non-empty non-placeholder production secret.

- [ ] **Step 2: Run the focused test before implementation.**

Run: `cd backend && node --test test/config.test.js`

Expected: **FAIL** because production currently exports the insecure fallback.

- [ ] **Step 3: Implement the narrow guard.**

Validate `JWT_SECRET` during config initialization. When `NODE_ENV === "production"`, throw before the server can start if the value is missing, blank, or the known insecure development placeholder. Do not expose or modify actual secret values, environment files, or deployment settings.

- [ ] **Step 4: Run focused configuration tests after implementation.**

Run: `cd backend && node --test test/config.test.js`

Expected: **PASS**.

### Task 3: Correct frontend CI working directory

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Confirm the existing root-cwd failure.**

Run: `node --test "frontend/tests/*.test.cjs"`

Expected: **FAIL** with cwd-relative fixture reads, while the same suite from `frontend/` passes.

- [ ] **Step 2: Apply the minimal CI-only correction.**

Set `defaults.run.working-directory: frontend` for the frontend job and change the command to `node --test "tests/*.test.cjs"`. Do not alter test behavior or add dependencies.

- [ ] **Step 3: Validate the workflow-equivalent command.**

Run: `cd frontend && node --test "tests/*.test.cjs"`

Expected: **PASS**.

### Task 4: Baseline comparison, self-review, commits, and sandbox push

**Files:**
- Modify: only files changed in Tasks 1–3
- Create: optional `docs/` review note only if required for final delivery; no production code outside Tasks 1–3

- [ ] **Step 1: Record baseline comparison.**

Compare `WorkD69/travel-assistant-summer-module@4e46655…` with the sandbox copy `murmyauuu/travel-assistant-travel-module-copy@3b2333d…`. Expected classification: **INTENTIONAL DIFFERENCE** only for executable mode of `scripts/verify.sh`; tracked file blobs are identical.

- [ ] **Step 2: Complete mandatory self-review.**

Run: `git diff --check`; `git diff --name-only`; and a grep over production runtime modules for `trip-turkey-2026`. Verify that no Plan B/MCP/Telegram/schema/YELLOW ZONE path changed.

- [ ] **Step 3: Make reviewable commits.**

Commit source-of-truth/frontend changes, config guard, and CI correction separately. Include the test file in the appropriate frontend commit. Do not merge `main`.

- [ ] **Step 4: Push only the feature branch to the personal sandbox remote.**

Run: `git push -u sandbox feat/egor-core-hardening`

Expected: the branch appears in `murmyauuu/travel-assistant-travel-module-copy`; no push is made to the team `origin/main`.
