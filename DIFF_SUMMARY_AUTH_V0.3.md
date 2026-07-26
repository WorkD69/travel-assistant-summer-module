# DIFF SUMMARY AUTH v0.3

## Base and scope

Comparison base: `708af3a2792102bbefb62c32505c0a84394a1d9e`
(`v0.2.0-b2`).

Only authentication, registration, password policy, session behavior, honest
account UI, AUTH tests, and supporting documentation are changed. There are no
deleted or renamed product files.

Final staged diff: **18 files, +2132 / −57 lines**.

## New files

- `backend/src/services/passwordPolicy.js`
- `backend/test/auth-e2e.test.js`
- `backend/test/password-policy.test.js`
- `frontend/assets/js/password-policy.js`
- `frontend/tests/auth-registration-ui.test.cjs`
- `frontend/tests/auth-remember-session.test.cjs`
- `HANDOFF_AUTH_V0.3.md`
- `DIFF_SUMMARY_AUTH_V0.3.md`
- `docs/superpowers/plans/2026-07-26-auth-v0.3-integration.md`

## Modified files

- `backend/src/routes/auth.js`
- `frontend/assets/css/account-pages.css`
- `frontend/assets/js/account-pages.js`
- `frontend/assets/js/auth-storage.js`
- `frontend/dev-preview/account-pages-preview.html`
- `frontend/login.html`
- `frontend/password-recovery.html`
- `frontend/profile.html`
- `frontend/register.html`

## Deleted files

None.

## Review corrections beyond supplied R2

- Restored correct UTF-8 account-page phrases.
- Corrected the dev-preview policy path without adding a duplicate policy.
- Replaced the permissive missing-policy fallback with fail-closed registration.
- Expanded the frontend/backend parity contract.
- Mapped structured registration errors to their fields with legacy compatibility
  and punctuation preservation.
- Corrected the parity-test reference in the browser policy.
- Added an isolated live AUTH API E2E test using temporary SQLite.

## Unchanged subsystems

Trips, maps, weather, documents, OCR, Plan B, Telegram, notifications,
invitations, SOS, Prisma schema, deployment configuration, Vercel, Railway, and
production data are unchanged.

## Verification

- Backend: 30/30 PASS
- Frontend: 43/43 PASS
- Telegram: 151/151 PASS
- Prisma generate/validate: PASS
- Local desktop/mobile and dev-preview checks: PASS
- Gitleaks repository source/history: PASS
- Forbidden files: none
- CI-equivalent verification: PASS

The final commit is recorded in the release report after publication.
