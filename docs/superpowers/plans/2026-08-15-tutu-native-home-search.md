# Tutu-native Home/Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pixel-faithful Tutu-native Home/Search first viewport inside the existing authenticated Vanilla JS frontend.

**Architecture:** A new scoped CSS layer and one Vanilla JS search-shell controller mount before the existing Home content. The existing AppShell receives an opt-in visual variant while retaining all auth/account actions; local SVG assets provide deterministic icons.

**Tech Stack:** Static HTML, CSS, Vanilla JavaScript, Node `node:test`, local Python static server, Chromium browser automation.

---

### Task 1: Define the production contract with failing tests

**Files:**
- Create: `frontend/tests/tutu-native-shell.test.cjs`

- [ ] Assert `home.html` opts into the surface and loads the new CSS/JS.
- [ ] Assert all required labeled controls and eight local transport icons are declared.
- [ ] Assert the controller has one submit listener/event boundary and no React/Vite imports.
- [ ] Assert AppShell retains every existing account action and exposes the Tutu variant.
- [ ] Run `node --test tests/tutu-native-shell.test.cjs` from `frontend` and confirm the expected missing-feature failures.

### Task 2: Add deterministic local icon assets

**Files:**
- Create: `frontend/assets/icons/tutu-native/logo.svg`
- Create: `frontend/assets/icons/tutu-native/hotels.svg`
- Create: `frontend/assets/icons/tutu-native/flights.svg`
- Create: `frontend/assets/icons/tutu-native/rail.svg`
- Create: `frontend/assets/icons/tutu-native/buses.svg`
- Create: `frontend/assets/icons/tutu-native/electric.svg`
- Create: `frontend/assets/icons/tutu-native/tours.svg`
- Create: `frontend/assets/icons/tutu-native/car.svg`
- Create: `frontend/assets/icons/tutu-native/jarvel.svg`

- [ ] Add simple monochrome SVGs using `currentColor`-compatible artwork or masked local files.
- [ ] Verify each SVG contains a `viewBox` and no external references.

### Task 3: Implement the Home search shell

**Files:**
- Create: `frontend/assets/js/tutu-search-shell.js`
- Modify: `frontend/home.html`

- [ ] Expose `window.tutuSearchShellInit(root, options)` and mount one `<form>` before existing Home content.
- [ ] Render promo, heading/stats, eight transport choices, origin/destination, swap, dates, passengers, and CTA with accessible labels.
- [ ] Implement swap, active transport selection, validation, and one `tutu-native:search` dispatch without navigation or backend calls.
- [ ] Opt Home into `.tutu-native-surface`, include the new CSS/JS, and initialize only after the existing authenticated Home renderer succeeds.
- [ ] Run the focused test and make the JS/HTML contract pass.

### Task 4: Add pixel-faithful scoped styling and AppShell variant

**Files:**
- Create: `frontend/assets/css/tutu-native-shell.css`
- Modify: `frontend/assets/js/app-shell.js`

- [ ] Render the white local logo, desktop navigation, favorites, login/account trigger, and menu control with existing actions.
- [ ] Add scoped desktop geometry for a 1200 px container and 56 px segmented search row with no CTA clipping.
- [ ] Add scoped 390 px layout: stacked route fields, equal date columns, full-width passenger and CTA controls.
- [ ] Add visible focus states, reduced-motion support, and no cookie overlay.
- [ ] Run focused and full frontend tests.

### Task 5: Browser visual correction loop

**Files:**
- Modify only the new shell CSS/JS or safe AppShell/Home entry files when a mismatch is confirmed.

- [ ] Start the local frontend and seed an authenticated browser session without changing production auth code.
- [ ] Capture 1280×720 pass 1; compare with `tutu-live-source-desktop.png`; record and fix mismatches.
- [ ] Capture 1280×720 final and verify `scrollWidth <= innerWidth` and a fully visible CTA.
- [ ] Capture 390×844 pass 1; compare with `tutu-live-source-mobile.png`; record and fix mismatches.
- [ ] Capture 390×844 final and verify stacked/equal/full-width grouping plus no horizontal scroll.

### Task 6: Final verification and commits

**Files:**
- Update: `docs/superpowers/plans/2026-08-15-tutu-native-home-search.md` checkboxes only if useful for review.

- [ ] Run `node --test tests/*.test.cjs` from `frontend`.
- [ ] Run `git diff --check` and inspect `git status --short`.
- [ ] Confirm no ownership-protected file changed and no React/Vite dependency appears.
- [ ] Commit focused stable changes with conventional messages and produce the requested visual review table.

