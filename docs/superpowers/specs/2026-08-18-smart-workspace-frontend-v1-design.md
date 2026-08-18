# Smart Workspace Frontend V1 — Design Specification

**Status:** Approved by the product owner on 18 August 2026.

## Purpose

This change adds a frozen Smart Workspace presentation layer inside the canonical production route `trip-overview.html?tripId=<factual tripId>`. It must reproduce the approved Tutu-native shell plus the Smart Layer states without changing routing, backend behavior, Phase A/Search, checkout, API contracts, or the DOM already owned by `integration-controller.js` and `backend-sync.js`.

## Architecture

The feature is a self-contained Vanilla JavaScript module family mounted into an explicit `#smart-workspace-root` placed after the existing overview grid. It consumes a passed view model and produces only presentation and local interaction state. The existing `workspace-integration.js` continues to authenticate and hydrate the factual `tripId`; the new integration module observes no backend calls and performs no mutation, persistence, real Apply/Revert, or routing operation.

| Unit | Responsibility | Boundary |
|---|---|---|
| `smart-workspace-view-model.js` | Normalize nullable input and map supplied ranking references into render-ready labels. | Never ranks candidates, derives impact, or creates data. |
| `smart-workspace-renderer.js` | Render the scoped workspace, bind semantic interactions, and hold ephemeral selection/presentation state. | Never calls API, localStorage, core-flow mutation, or legacy renderers. |
| `smart-workspace-integration.js` | Mount only when a supplied view model exists, and expose the explicit development/test preview gate. | Production has no fixture fallback. |
| `smart-workspace.css` | Define all Smart Workspace geometry, color, focus, disabled, desktop, and 390px styles under `.smart-workspace`. | Does not restyle the general Tutu shell or legacy panel/card selectors. |

## Data contract and truthfulness

The normalized view model receives a trip summary, optional timeline/context/documents/weather/map presentation containers, a `disruption` record, candidate array, server-owned `ranking` references, explicit `impact`, `apply`, and `revert` presentation states. Candidate values may have `carrierName`, `serviceNumber`, `price`, and availability set to `null`. Missing facts yield an absent, neutral, or unavailable element rather than a synthetic value.

`fastest`, `cheapest`, and `personalized` are references from the input view model. The renderer displays a label only when the reference status is `available` and its candidate ID is present. Multiple labels may target the same candidate. The client never sorts candidates, computes a recommendation, calculates a score, or invents a match percentage. `selectedCandidateId` begins as `null`; a ranking label never selects a candidate. Impact is displayable only after an explicit user selection, and it reads only the supplied `impact` fields. If `priceDelta` is null, the UI uses the unavailable comparison wording.

## Presentation states

Normal presents native route facts, a purple status card, presentation containers, conditional documents and companion entry. Disruption presents `CARRIER_CANCELLED` with explicit `DEMO_SIMULATION` wording, a single orange action card, a factual cancellation timeline, and no live detection claims. Plan B presents real candidates once, server labels, and neutral empty/unavailable cases. Preferences allow one to three user choices while retaining their submitted values as UI input only; a preview response is supplied explicitly rather than calculated.

Apply is a presentation-only confirmation state. After Apply displays the supplied canonical-trip presentation state and the boundary that carrier rebooking has not occurred. Revert uses one of `available`, `pending`, `success`, `already_reverted`, `nothing_applied`, `conflict`, or `disabled`, all as local visual states. No API call, persistence action, or provider claim is made.

## Production and preview isolation

Production mounts only when `window.__SMART_WORKSPACE_VIEW_MODEL__` is supplied by a future integration layer. It does not read fixtures from localStorage and does not substitute a demo trip after failed hydration or absent factual data. Development/test preview is opt-in through `env=development` or `env=test` plus `preview=smart-workspace`; only then may a controlled mock server response be supplied for visual verification. The preview object is never selected automatically in production.

## Accessibility and responsive behavior

Candidate cards and action controls are semantic buttons or button-contained controls with visible focus, keyboard activation, disabled status, and appropriate ARIA labels. The scoped layout uses a two-column workspace where appropriate and collapses to one column at narrow widths. At 390px, padding is 16px, candidate cards are fluid, action groups wrap, and the sticky Apply bar remains within the viewport without horizontal overflow.

## Verification

Focused Node tests cover normal/disruption copy, no live-detection claims, view-model-owned labels, absence of a frontend ranking algorithm, initial null selection, selection after click, duplicate label ownership, zero and unavailable candidates, nullable factual fields, unavailable price comparison, conditional documents/context, apply/after-apply/revert presentation states, and no production fixture fallback. The complete frontend suite, `git diff --check`, conflict-marker scan, desktop screenshots, mobile 390px screenshots, `git bundle verify`, ref listing, and SHA-256 sidecar are required before delivery.
