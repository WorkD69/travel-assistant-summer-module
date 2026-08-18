# Final Frontend Integration Phase B Design

## Scope

Integrate the frozen Phase A and Smart Workspace histories on canonical Backend/Core V5 and connect the approved Smart Workspace presentation to the real Trip and Plan B APIs. Preserve the static Vanilla JS architecture, Phase A checkout flow, and canonical `trip-overview.html?tripId=...` route. Backend, Prisma, Telegram, deployment, and redesign work are excluded.

## Integration strategy

The derived branch begins at `d327ad0735cce76b395e7aee7a970af8c59c0657`. It contains non-squashed merge commits for Phase A `9a981ca5cb015e9ed7fc343f733186b8e8deccdf` followed by Smart Workspace `5ab331868034248ab578bb370d45f4b29f193c18`. The automatically merged `trip-overview.html` must retain runtime config before the API client, the canonical router, and Smart Workspace scripts in view-model, renderer, integration order.

## Runtime architecture

`api-client.js` exposes only the Backend V5 Plan B methods used by the production workspace: demo disruption, preview, apply, and revert. Historical `/monitoring/plan` methods and consumers are retired from the final runtime.

`smart-workspace-integration.js` is the sole network and mutation boundary. It validates `tripId`, loads the canonical Trip, owns transient interaction state, calls Backend V5, enforces a preview timeout, guards Apply against double clicks, keeps an in-memory stable idempotency key per apply intent, and performs canonical rereads after disruption, Apply, and Revert.

`smart-workspace-view-model.js` remains a pure adapter. It projects factual canonical Trip fields and exact preview response fields into the frozen presentation model. Ranking labels are attached only from server references. It does not rank candidates, infer missing facts, or persist state.

`smart-workspace-renderer.js` remains presentation-only. It renders loading, factual data, explicit errors, zero candidates, pending operations, and the approved Normal/Disruption/Plan B/Impact/After Apply states. User events are delegated to the integration controller. The renderer never calls an API or decides lifecycle state.

## Canonical lifecycle

Every canonical reread applies this precedence:

1. `trip.activePlanBApply != null` produces APPLIED.
2. Otherwise, the newest monitoring signal matching `category=plan_b_disruption`, `source=DEMO_SIMULATION`, and `status=active` produces DISRUPTION.
3. Otherwise the state is TRIP_NORMAL.

The frontend never infers APPLIED from route or segments. Refresh reconstructs APPLIED from `activePlanBApply`. Successful or already-completed Revert rereads canonical Trip and renders TRIP_NORMAL only when the server projection says so.

## Plan B interactions

Demo disruption sends `{ "type": "CARRIER_CANCELLED" }`. Preview sends exact preference codes `faster`, `cheaper`, and `fewer_transfers`. Candidates and Impact come directly from the preview response. Fastest, Cheapest, and Personalized labels may share a candidate. Selection starts null and is cleared when a later preview omits the selected candidate.

Apply sends exact `proposalId` and `candidateId` with a stable transient `Idempotency-Key`. It is disabled until explicit valid selection and while pending. Revert sends an empty JSON body. Neither operation claims provider booking or purchase.

## Error behavior

Missing or malformed `tripId`, 401, 403, 404, canonical load failures, disruption failures, preview timeout/failure, zero candidates, Apply conflict, Revert conflict, and network failures render explicit recoverable states. No production path substitutes preview fixtures. The explicit development/test preview gate remains available.

## Presentation and mobile

The approved scoped CSS and component hierarchy remain intact. Production mounting suppresses the legacy overview content beneath the Smart Workspace while preserving the application shell. Controls remain usable at 390px with no horizontal overflow or clipped action bars. Copy identifies Tutu as the candidate source and Travel Assistant as the recommendation source.

## Verification

Focused Phase B tests cover lifecycle projection, exact requests, server ranking, selection, preferences, Impact, idempotency, rereads, refresh/revert, errors, legacy retirement, and production fixture absence. Phase A regressions and the full frontend suite must pass. Final checks include backend/Prisma empty diffs, `git diff --check`, conflict markers, desktop and 390px browser evidence, bundle verification, and exact bundled HEAD.
