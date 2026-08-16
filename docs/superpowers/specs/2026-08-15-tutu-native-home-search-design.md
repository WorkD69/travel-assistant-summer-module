# Tutu-native Home/Search design


## Status


Approved for implementation on 2026-08-15. Search Results and downstream transport flows remain out of scope.


## Goal


Make the authenticated Home page's first viewport closely match the captured live Tutu desktop and mobile references while preserving the existing Travel Assistant Vanilla JS/CSS architecture, authentication, router, and canonical state.


## Architecture


- `home.html` opts into a `.tutu-native-surface` and loads a focused stylesheet and controller.
- `tutu-search-shell.js` mounts a semantic header-adjacent hero/search surface before the existing Home content. It owns only transient form state and emits one `tutu-native:search` event on submit.
- `app-shell.js` renders a Tutu-native visual variant when requested, but retains the existing `data-shell-action` contract, auth guard, menu, logout, profile, History, and notification behavior.
- Stable local SVGs replace captured icon fonts. No Tutu EOT fonts, React, Vite, second router, second store, external booking API, or fake cookie overlay are introduced.
- All new CSS is scoped beneath `.tutu-native-surface`; Trip Workspace styles are not modified.


## Visual contract


- Desktop 1280×720: white logo, compact navigation header, blue shell, nonblank promo strip, heading/stat chips, eight-mode selector, and one 56 px search row with a fully visible CTA.
- Mobile 390×844: compact logo/actions, two-row mode grid, stacked origin/destination, equal date columns, full-width passengers and CTA, and no horizontal scrolling.
- Iconography is supplied by local SVG assets and remains visible without font dependencies.


## Functional contract


- Search controls have labels, keyboard focus, and one form submit boundary.
- Submit validates origin/destination without inventing a transport data contract. A valid submission dispatches one adapter-ready custom event and provides an accessible status message.
- Existing Home content continues below the new first-screen surface and remains driven by `TripPagesAdapter`/`TravelAppState`.
- Existing account menu actions remain unchanged.


## Ownership boundaries


Do not modify `frontend/assets/js/trip-pages.js`, state files, sync modules, backend/config/security files, CI workflows, Search Results, TransportOption, Trip Workspace, or My Trips rendering.


## Testing


- Static contract tests verify required controls, local icons, CSS/script inclusion, absence of React/Vite, and unchanged shell action hooks.
- VM DOM tests verify exactly one submit dispatch and validation behavior.
- Full frontend Node test suite and `git diff --check` must pass.
- Browser screenshots at 1280×720 and 390×844 are compared against the Phase 0 live references, with at least one correction pass and explicit overflow checks.
