# Final Frontend Integration Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the approved Smart Workspace to canonical Backend V5 Plan B APIs without regressing Phase A.

**Architecture:** Keep API/network and state transitions in the integration controller, factual mapping in the pure view-model, and DOM output/event delegation in the renderer. Derive lifecycle state only from canonical Trip server fields after each reread.

**Tech Stack:** Vanilla JavaScript, static HTML/CSS, Node.js built-in test runner.

---

### Task 1: Lock the Phase B behavioral contract

**Files:**
- Create: `frontend/tests/final-frontend-integration-phase-b.test.cjs`

- [ ] Write tests that load the view-model, renderer, integration controller, API client, and canonical HTML.
- [ ] Cover canonical lifecycle precedence, exact demo/preview/apply/revert calls, server-owned ranking, null initial selection, preference codes, factual Impact, apply idempotency and double-click safety, canonical rereads, refresh reconstruction, revert normalization, auth/errors, legacy endpoint absence, preview fixture isolation, API base, and canonical route.
- [ ] Run `node --test tests/final-frontend-integration-phase-b.test.cjs` from `frontend/` and confirm failures are caused by missing Phase B behavior.

### Task 2: Add exact Backend V5 client methods and retire legacy Plan B

**Files:**
- Modify: `frontend/assets/js/api-client.js`
- Modify: `frontend/assets/js/backend-sync.js`
- Modify: `frontend/assets/js/ai-assistant.js`
- Modify: `frontend/tests/plan-b-apply.test.cjs`

- [ ] Add `triggerPlanBDemo`, `previewPlanB`, `applyPlanB`, and `revertPlanB` methods using encoded canonical Trip paths and exact request bodies/headers.
- [ ] Remove `/monitoring/plan` methods and calls from production frontend sources.
- [ ] Replace the historical assistant Plan B mutation test with a retirement assertion.
- [ ] Run the focused test and confirm API contract assertions pass.

### Task 3: Build factual canonical and preview adapters

**Files:**
- Modify: `frontend/assets/js/smart-workspace-view-model.js`

- [ ] Map canonical segments, dates, route, documents, and active demo signal without inventing facts.
- [ ] Apply lifecycle precedence from `activePlanBApply` and matching signal only.
- [ ] Map preview candidates from `candidateId`, `option`, and `impact` and attach labels only from `fastest`, `cheapest`, and `personalized` response references.
- [ ] Preserve multiple labels on one candidate and unavailable price comparison.
- [ ] Run focused adapter tests and confirm they pass.

### Task 4: Implement the production integration controller

**Files:**
- Modify: `frontend/assets/js/smart-workspace-integration.js`

- [ ] Parse and validate the canonical query-string `tripId`.
- [ ] Load canonical Trip on boot and render Normal, Disruption, or Applied from server truth.
- [ ] Trigger explicit demo cancellation and reread canonical Trip.
- [ ] Request preview with exact preference codes and a timeout; clear stale selection.
- [ ] Require explicit candidate selection before Impact/Apply.
- [ ] Guard Apply while pending, keep one transient idempotency key per intent, and reread canonical Trip after success.
- [ ] Revert with an empty body, reread canonical Trip, and normalize already-reverted state through canonical truth.
- [ ] Convert 401/403/404/conflicts/network errors to explicit presentation errors without fixtures.
- [ ] Run focused controller tests and confirm they pass.

### Task 5: Connect renderer events and error/pending presentation

**Files:**
- Modify: `frontend/assets/js/smart-workspace-renderer.js`
- Modify: `frontend/assets/css/smart-workspace.css`
- Modify: `frontend/trip-overview.html`

- [ ] Delegate renderer actions to the controller and remove simulated Apply/Revert transitions.
- [ ] Render explicit demo trigger, loading, error, empty, pending, and retry controls.
- [ ] Use machine preference codes with Russian labels.
- [ ] Apply the approved factual Tutu/Travel Assistant copy correction.
- [ ] Suppress legacy overview UI only when the production Smart Workspace mounts.
- [ ] Preserve runtime/API bootstrap and deterministic script ordering.
- [ ] Run Smart Workspace, focused Phase B, and production build tests.

### Task 6: Verify and package

**Files:**
- Create: `artifacts/screenshots/phase-b-*.png`
- Create: `final-frontend-integration-phase-b.bundle`
- Create: `final-frontend-integration-phase-b.bundle.sha256`

- [ ] Run focused Phase B tests, Phase A regressions, and `node --test tests/*.test.cjs` from `frontend/`.
- [ ] Record the known Node 26/Prisma backend persistence environment limitation; do not change backend or Prisma.
- [ ] Run `git diff --check`, scan conflict markers, and verify backend and Prisma diffs are empty from the canonical baseline.
- [ ] Perform desktop and 390px browser smoke where the local authenticated Backend V5 environment permits and save factual evidence.
- [ ] Commit complete Phase B frontend changes using conventional commits.
- [ ] Create and verify the bundle, SHA-256 file, and exact included Phase B HEAD without push, merge, or deploy.
