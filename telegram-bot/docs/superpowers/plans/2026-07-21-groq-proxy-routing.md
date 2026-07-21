# Groq Proxy Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, secret-safe proxy route for Groq requests while preserving the existing provider lifecycle, model fallback chain, Telegram transport, and SQLite state.

**Architecture:** `Settings` owns an optional `groq_proxy_url`; the AI factory passes it only to `GroqAIProvider`. The provider creates its single reusable `httpx.AsyncClient` with the explicit proxy when configured and with `trust_env=True` so standard proxy environment variables remain available otherwise.

**Tech Stack:** Python 3.12, aiogram 3, httpx 0.28, httpx SOCKS support, pytest, httpx.MockTransport.

---

### Task 1: Configuration contract

**Files:**
- Modify: `app/config.py`
- Modify: `.env.example`
- Test: `tests/test_config.py`
- Test: `tests/test_windows_support.py`

- [ ] Add failing tests for the empty default, explicit parsing, accepted proxy schemes, rejected invalid schemes, and a non-secret empty example value.
- [ ] Run the focused tests and verify they fail because `groq_proxy_url` is missing.
- [ ] Add `groq_proxy_url: str = ""` and validate non-empty HTTP(S)/SOCKS URLs.
- [ ] Add only `GROQ_PROXY_URL=` to `.env.example`.
- [ ] Re-run the focused tests and verify they pass.

### Task 2: Groq client construction

**Files:**
- Modify: `app/services/ai/groq.py`
- Modify: `app/services/ai/factory.py`
- Test: `tests/test_assistant.py`

- [ ] Add failing constructor-spy tests proving no explicit proxy by default, explicit proxy priority, `trust_env=True`, and absence of the Groq key from proxy configuration and logs.
- [ ] Run the focused tests and verify the missing constructor argument/configuration is the failure reason.
- [ ] Pass `proxy_url` through the factory and construct the shared `AsyncClient` with `proxy=proxy_url or None` and `trust_env=True`.
- [ ] Re-run all Groq provider tests, including model and Mock fallbacks.

### Task 3: SOCKS dependency and documentation

**Files:**
- Modify: `requirements.txt`
- Modify: `docs/GROQ.md`
- Test: `tests/test_windows_support.py`

- [ ] Add a failing dependency assertion for official httpx SOCKS support.
- [ ] Change the dependency to `httpx[socks]>=0.27` and document safe proxy precedence without including a real endpoint or credentials.
- [ ] Install only the declared dependency into the existing project virtual environment and re-run focused tests.

### Task 4: Offline and live verification

**Files:**
- Runtime only: `.env`, `bot.pid`, `bot.log`, `bot_state.db`

- [ ] Run all Groq unit tests using MockTransport.
- [ ] Run `CHECK_BOT.bat`, then `RUN_TESTS.bat`, while the existing bot PID remains alive.
- [ ] Verify SQLite integrity and existing link counts without modifying the database.
- [ ] Test `GET /models` without a key through the configured local route; proceed only if Groq returns 401/invalid_api_key rather than edge 403.
- [ ] On a valid route, perform exactly one minimal request per configured Groq model using the key only from `.env`.
- [ ] Only after all checks pass, stop the exact PID from `bot.pid`, start via `START_BOT.bat`, and verify polling has no conflict.
- [ ] If the route still returns edge 403, keep the existing bot running with Mock fallback and report that the Happ exit route must be changed outside the bot.
