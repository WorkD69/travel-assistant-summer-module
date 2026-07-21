# Travel Assistant Monorepo Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble, verify, publish, and connect the approved frontend and Telegram-bot sources without exposing secrets or changing backend work.

**Architecture:** Copy the exact approved static frontend and a filtered bot source tree into a new monorepo. Publish one `main` commit to GitHub and GitVerse, deploy only `frontend/` to Vercel, then update only the working bot's `WEB_APP_BASE_URL` and restart that single polling process.

**Tech Stack:** Static HTML/CSS/JavaScript, Python 3.12, Aiogram 3, Git, GitHub CLI, GitVerse, Vercel.

---

### Task 1: Assemble the approved sources

**Files:**
- Copy: `C:\Projects\travel-assistant-frontend-final-RUN-20260720-192327.rar`
- Copy: `C:\Projects\travel-assistant-telegram-bot-final`
- Create: `C:\Projects\travel-assistant-monorepo`

- [x] Test the RAR with `UnRAR.exe t -idq` and require exit code 0.
- [x] List the RAR and require the documented frontend root and mandatory files.
- [x] Extract to `C:\Projects\_travel-assistant-frontend-extract`.
- [x] Copy the contents of `travel-assistant-final-polished` directly to `frontend/`.
- [x] Copy only bot sources and safe support files; exclude `.env`, `.venv`, DB, PID, logs, caches and backups.

### Task 2: Add repository metadata

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `README.md`
- Create: `SECURITY.md`

- [x] Document current mock/browser state, future API mode, local starts and frontend-only Vercel deployment.
- [x] Ignore all specified secret, runtime, cache, archive and database paths.
- [x] Run a whole-tree secret scan and remove or redact any unsafe findings before `git add`.

### Task 3: Verify frontend and bot copy

**Files:**
- Verify: `frontend/**/*`
- Verify: `telegram-bot/**/*`

- [x] Run `node --check` for every production JavaScript file and require zero failures.
- [x] Check local references, duplicate static IDs, encoding, absolute Windows paths and production localhost links.
- [x] Serve `frontend/` over HTTP and verify required routes, assets, console, responsive layout, workspace tabs, trip isolation, read-only and No Access states.
- [x] Create a temporary `.venv` in the repository copy, install declared dependencies, import `app.bot`, run the checker in mock mode and run the complete offline test suite.
- [x] Confirm the Groq primary/fallback model chain and final `MockAIProvider` without making a live Groq call.

### Task 4: Create and publish one Git history

**Files:**
- Create: `.git/`

- [x] Initialize only `C:\Projects\travel-assistant-monorepo` with branch `main`.
- [x] Repeat the secret scan, inspect status and staged diff, and require ignored runtime files to remain untracked.
- [x] Reject abnormal file sizes, then commit exactly `Initial monorepo: final frontend and Telegram bot` as requested.
- [ ] Create a private GitHub repository named `travel-assistant` or fallback `travel-assistant-summer-module`, push `main`, and verify the remote tree and commit hash.
- [ ] Add the user-provided empty GitVerse repository as `gitverse`, push the same `main`, and compare hashes.

### Task 5: Deploy and connect

**Files:**
- Modify only if required: `frontend/vercel.json`
- Modify locally, never commit: `C:\Projects\travel-assistant-telegram-bot-final\.env`

- [ ] Import the GitHub repository into Vercel with root `frontend`, preset `Other`, no build command and no secret environment variables.
- [ ] Verify the production HTTPS routes, assets and browser console.
- [ ] Back up the working `.env` without displaying it and replace only `WEB_APP_BASE_URL`.
- [ ] Run `CHECK_BOT.bat`, stop only the verified existing bot PID, restart with `START_BOT.bat`, and require exactly one polling process while preserving the database and two bindings.
- [ ] Generate a production trip deep link and ask the user to validate it on Telegram Desktop and phone.

### Task 6: Final evidence

**Files:**
- Verify: repository, both remotes, Vercel deployment and working bot process.

- [ ] Repeat critical tests, scans, route checks, remote hash checks and process checks immediately before reporting completion.
- [ ] Report paths, structure, checks, hashes, URLs, deployment settings, PID, binding/deep-link status, backend boundary and limitations without exposing secrets.
