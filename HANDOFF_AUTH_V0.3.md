# HANDOFF AUTH v0.3

## Scope and base

- Base commit: `708af3a2792102bbefb62c32505c0a84394a1d9e`
- Base tag: `v0.2.0-b2`
- Integration branch: `feature/auth-v0.3-integration`
- Source archive SHA-256: `35C2426AAAF868E420D6846D4135FD2780D596233E06D811E72990114737EDE0`
- Deployment, Vercel, Railway, production databases, Telegram service, `main`, and tags were not changed.

The archive was compared independently with the base. Its product diff was limited
to backend authentication, password policy, account pages, session storage, tests,
and handoff documentation. No supplied report was accepted as a source of truth.

## Integrated behavior

- Backend registration normalizes email and name, enforces password length
  `8..128`, rejects common and identity-like passwords, and returns both legacy
  `error` and structured `errors[]`.
- Backend login normalizes email, including mixed-case input.
- Browser policy mirrors the backend contract. Its parity test compares constants,
  dictionaries, regex source and flags, normalization, evaluator results, primary
  error codes, and strength levels.
- Registration has password confirmation, strength feedback, accessible
  show/hide controls, and double-submit protection.
- Session persistence uses `sessionStorage` without “Оставаться в системе” and
  `localStorage` with it; logout clears both.
- Fake consent checkboxes were removed. Password recovery is explicitly marked
  unavailable and does not imitate sending mail.

## Independent review fixes

1. **UTF-8:** the account-page phrases are `Не сохранять исходные письма` and
   `В будущем почтовое подключение…`; no U+FFFD occurs in any changed AUTH source.
2. **Dev preview:** it loads the single canonical
   `../assets/js/password-policy.js`. A live static-server test receives HTTP 200,
   executes the script, and observes `TravelPasswordPolicy`; browser verification
   records `data-password-policy-loaded="true"` through the page diagnostic marker.
3. **Fail closed:** if the browser policy is unavailable, registration is not sent,
   the exact message `Не удалось загрузить проверку пароля. Обновите страницу` is
   shown, and no rule is displayed as passed.
4. **Parity:** constants, lists, regex, both normalizers, evaluator behavior,
   primary codes, and strength levels are compared without depending on local
   variable names.
5. **Field errors:** backend `errors[]` map `email`, `name`, and `password` to their
   fields. Unknown errors use the general notification. Legacy `{ error }` remains
   supported, and existing terminal punctuation is preserved.
6. **Documentation:** the browser mirror points to the real parity test
   `frontend/tests/auth-registration-ui.test.cjs`.

## Verification results

- `npm ci`: PASS (133 packages installed).
- Prisma Client generation: PASS, Prisma `5.22.0`.
- Prisma schema validation: PASS.
- Backend: **30/30 PASS**.
- Frontend: **43/43 PASS**.
- Telegram regression: **151/151 PASS**, without polling.
- Repository source/history Gitleaks `8.30.1`: PASS, no leaks.
- Forbidden tracked/untracked files: none.
- CI-equivalent `scripts/verify.ps1`: PASS.

The isolated live AUTH test creates a random temporary SQLite database, applies the
existing schema, starts the real Express application, verifies policy enforcement,
normalization, duplicate-email protection, uppercase-email login, and session
restore, then closes the server and removes the database.

Browser checks passed at `1440×900` and `390×844`: registration and login render
without horizontal overflow, password feedback updates, fake consents are absent,
and the recovery state is honest. Dev preview resolves the canonical policy.

All 20 requested AUTH E2E scenarios are covered by the live API test, frontend
behavior tests, session tests, static-server test, and browser checks.

## Known risks deliberately left for AUTH v0.4

- Access tokens remain in web storage; refresh tokens and cookie-only auth are not
  part of this stage.
- Password recovery, rate limiting, HIBP, and server-side password change remain
  unimplemented.
- Backend and browser policy remain two manually synchronized files, guarded by the
  expanded parity test.
- `npm audit` reports 7 existing dependency findings (6 high, 1 critical). No
  automatic or breaking dependency upgrade was performed in this scoped change.
- A whole-frontend scan finds four pre-existing U+FFFD sequences in the unchanged
  `frontend/trip-overview.html`; the exact same lines exist in the base commit.
  They were not edited because trip functionality is explicitly outside AUTH v0.3.

## Status

AUTH v0.3 is ready for staging after the feature branch is reviewed.
