# Groq AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lifecycle-safe Groq AI provider with sequential model/retry policy and visibly labelled Mock fallback while preserving the existing handler boundary and mock travel data mode.

**Architecture:** `GroqAIProvider` implements `AIProvider` and owns one reusable `httpx.AsyncClient`. A provider-agnostic `FallbackAIProvider` wraps Groq and Mock, while the factory remains the only selection point. `BotApplication` owns and closes the selected AI provider during graceful shutdown.

**Tech Stack:** Python 3.12, aiogram 3, pydantic-settings, httpx.AsyncClient/MockTransport, pytest, pytest-asyncio.

**Execution constraint:** Work inline in the exact project folder. Do not use Git, frontend, backend, the OpenAPI contract, the exposed Groq key, or database reset operations.

---

## File map

- Create `app/services/ai/groq.py`: Groq request building, sequential retries/models, response parsing, safe telemetry, reusable client lifecycle.
- Create `app/services/ai/fallback.py`: generic primary-to-Mock fallback with visible labelling.
- Modify `app/services/ai/base.py`: add provider lifecycle and typed authentication error.
- Modify `app/services/ai/factory.py`: select and compose providers only here.
- Modify `app/config.py`: parse and validate non-secret Groq/AI controls.
- Modify `app/bot.py`: retain the provider and close it exactly once.
- Modify `.env.example`: add only non-secret Groq/AI controls; never add `GROQ_API_KEY`.
- Modify `.env`: prepare Groq mode and an empty `GROQ_API_KEY` only after offline tests.
- Modify `tests/test_assistant.py`: provider, fallback, factory, payload, error, retry, logging, reuse, and close tests.
- Modify `tests/test_startup.py`: application ownership and shutdown test.
- Modify `tests/test_config.py`: defaults, environment parsing, accepted provider values.
- Modify `docs/GEMINI.md` or add `docs/GROQ.md`: local configuration and security without secrets.

### Task 1: Configuration contract

**Files:**
- Modify: `tests/test_config.py`
- Modify: `app/config.py`

- [ ] **Step 1: Write failing configuration tests**

Add tests that instantiate `Settings(_env_file=None, ...)` and assert:

```python
settings = Settings(
    _env_file=None,
    ai_provider="groq",
    groq_api_key="",
    groq_base_url="https://api.groq.com/openai/v1",
    groq_model="openai/gpt-oss-120b",
    groq_fallback_model="openai/gpt-oss-20b",
    ai_fallback_to_mock=True,
    ai_timeout_seconds=20,
    ai_max_retries=1,
    ai_max_history_messages=8,
    ai_max_context_characters=16000,
    ai_max_output_tokens=700,
)
assert settings.ai_provider == "groq"
assert settings.ai_fallback_to_mock is True
assert not any("AI_PROVIDER" in problem for problem in settings.validate_for_start())
```

Also assert `backend` is a reserved accepted provider value and invalid numeric bounds produce clear validation problems.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests\test_config.py
```

Expected: failures because the Groq fields/provider validation do not exist.

- [ ] **Step 3: Add minimal Settings fields and validation**

Add typed fields with the approved defaults. Extend the provider allow-list to `mock`, `gemini`, `groq`, and reserved `backend`. Validate positive timeout/history/context/output limits, non-negative retry count, and an HTTP(S) Groq base URL. Missing Groq key must not block startup when Mock fallback is enabled.

- [ ] **Step 4: Run configuration tests and verify GREEN**

Run the command from Step 2. Expected: all `tests/test_config.py` tests pass.

### Task 2: Provider lifecycle and generic fallback

**Files:**
- Modify: `tests/test_assistant.py`
- Modify: `app/services/ai/base.py`
- Create: `app/services/ai/fallback.py`

- [ ] **Step 1: Write failing lifecycle/fallback tests**

Create recording primary and Mock providers. Assert that:

```python
provider = FallbackAIProvider(primary, fallback, enabled=True)
answer = await provider.generate("q", "ctx", [])
assert "MockAIProvider" in answer
assert fallback.calls == 1
await provider.close()
assert primary.closed and fallback.closed
```

Cover successful primary responses (Mock not called), disabled fallback (typed error propagates), and an authentication error producing a clear key/access prefix before the labelled Mock answer.

- [ ] **Step 2: Run targeted tests and verify RED**

Run the new fallback test nodes. Expected: import failure for `FallbackAIProvider` or missing `close()`.

- [ ] **Step 3: Implement lifecycle and fallback**

Add a default async no-op `AIProvider.close()`. Add `AIProviderAuthenticationError` with a safe user message. Implement `FallbackAIProvider.generate()` to catch `AIProviderError`, call Mock sequentially only when enabled, and prepend a clear Groq/auth/unavailable notice without exception details or secrets. `close()` closes unique children exactly once.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Expected: new fallback/lifecycle tests pass.

### Task 3: Groq success path, payload, reuse, and close

**Files:**
- Modify: `tests/test_assistant.py`
- Create: `app/services/ai/groq.py`

- [ ] **Step 1: Write failing MockTransport success tests**

Use `httpx.MockTransport` to record one POST. Assert endpoint, redacted-safe headers, body fields, capped context/history, primary model, `temperature == 0.2`, `max_completion_tokens == 700`, and `stream is False`. Call `generate()` twice and assert the same injected `AsyncClient` serves both calls. Close and assert the provider-owned client closes.

- [ ] **Step 2: Run success tests and verify RED**

Expected: `app.services.ai.groq` does not exist.

- [ ] **Step 3: Implement minimal GroqAIProvider success path**

Implement constructor validation, owned/injected client support, `messages` construction, `POST /chat/completions`, `raise`/parse logic, `choices[0].message.content` validation, bounded context/history, and idempotent `close()`. Do not log headers, body, response body, question, history, or context.

- [ ] **Step 4: Run success tests and verify GREEN**

Expected: all success/payload/reuse/close tests pass.

### Task 4: Sequential retry and model fallback policy

**Files:**
- Modify: `tests/test_assistant.py`
- Modify: `app/services/ai/groq.py`

- [ ] **Step 1: Write parameterized failing status/transport tests**

Using ordered MockTransport responses, cover:

- 401 and 403: one request only, `AIProviderAuthenticationError`;
- primary 404: immediate request to fallback model;
- primary 429/5xx/timeout/network: initial request plus one retry, then fallback model;
- fallback model exhaustion: typed quota/timeout/unavailable error;
- empty/malformed 200: bounded retry, fallback model, then typed invalid-response error;
- no parallel calls and exact request order.

- [ ] **Step 2: Run error tests and verify RED**

Expected: current success-only provider fails status/retry assertions.

- [ ] **Step 3: Implement one-at-a-time attempts**

Implement `_request_model()` and a two-model loop. Map 401/403 to authentication and skip the fallback Groq model; map 404 to the next model; map 429 to quota; map timeout/network to timeout/unavailable; map 5xx to unavailable; map empty/malformed responses to invalid response. Retry only retryable failures up to `AI_MAX_RETRIES` after the initial attempt.

- [ ] **Step 4: Run all Groq provider tests and verify GREEN**

Expected: status, retry, ordering, and fallback-model tests pass.

### Task 5: Safe telemetry

**Files:**
- Modify: `tests/test_assistant.py`
- Modify: `app/services/ai/groq.py`

- [ ] **Step 1: Write a failing caplog secrecy test**

Use sentinel key, question, and context strings. Trigger both success and failure. Assert captured logs contain provider/model/status/duration/message count/context size/error type, but not the key, Authorization header, prompt, raw response, question, or context.

- [ ] **Step 2: Run the secrecy test and verify RED**

Expected: required safe telemetry fields are absent.

- [ ] **Step 3: Add structured safe log messages**

Log only the approved metadata at INFO/WARNING with positional fields; never interpolate request headers/body or exception text.

- [ ] **Step 4: Run the secrecy test and verify GREEN**

Expected: metadata assertions pass and all sentinel secret/prompt assertions remain absent.

### Task 6: Factory composition and application shutdown

**Files:**
- Modify: `tests/test_assistant.py`
- Modify: `tests/test_startup.py`
- Modify: `app/services/ai/factory.py`
- Modify: `app/bot.py`

- [ ] **Step 1: Write failing factory and shutdown tests**

Assert `AI_PROVIDER=groq` creates `FallbackAIProvider(GroqAIProvider, MockAIProvider)` when enabled, missing key creates a labelled Mock-safe configuration without a network call, mock mode remains unchanged, and `BotApplication.close()` invokes provider close exactly once.

- [ ] **Step 2: Run targeted tests and verify RED**

Expected: factory returns plain Mock and application does not retain/close AI.

- [ ] **Step 3: Implement factory-only selection and application ownership**

Keep all Groq imports/configuration in `create_ai_provider()`. Add the selected `ai: AIProvider` to `BotApplication`, pass it from `build_application()`, and close it during graceful shutdown. Do not alter handler imports or signatures.
Keep provider construction behind the factory/interface boundary so a future
`BackendAIProvider` can be added without changing `/assistant` or other handlers;
do not implement that provider now.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Expected: factory and shutdown tests pass; existing Mock/Gemini tests remain green.

### Task 7: Non-secret templates and documentation

**Files:**
- Modify: `.env.example`
- Create: `docs/GROQ.md`
- Modify: `tests/test_windows_support.py`

- [ ] **Step 1: Write failing template-security tests**

Assert `.env.example` includes approved non-secret Groq model/base/tuning settings and does not contain `GROQ_API_KEY` or any `gsk_` value. Assert `.gitignore` still excludes `.env` and archive verification still forbids it.

- [ ] **Step 2: Run the template tests and verify RED**

Expected: non-secret Groq settings/documentation are absent.

- [ ] **Step 3: Add safe template/docs**

Document revocation/rotation, local-only key insertion, provider/fallback chain, allowed logs, and `/assistant` verification. Never include a real or example-shaped key.

- [ ] **Step 4: Run template tests and verify GREEN**

Expected: security and documentation tests pass.

### Task 8: Offline verification while the current bot stays running

**Files:** No production changes.

- [ ] **Step 1: Run Groq unit tests first**

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests\test_assistant.py tests\test_startup.py tests\test_config.py tests\test_windows_support.py
```

Expected: all selected tests pass using only MockTransport/no live Groq key.

- [ ] **Step 2: Run CHECK_BOT**

```powershell
cmd /d /c "CHECK_BOT.bat --no-pause"
```

Expected: configuration, routers, middleware, Mock travel API, selected AI provider, notifications, SQLite, timezone, and graceful shutdown pass.

- [ ] **Step 3: Run the full suite**

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: all tests pass. The already-running Telegram bot is not stopped during these offline steps.

- [ ] **Step 4: Verify runtime state preservation**

Record current bot PID and database size/hash metadata without exposing user rows. Confirm `bot_state.db` still exists and the separate consistent backup remains readable.

### Task 9: Prepare local secret entry and pause

**Files:**
- Modify: `.env`

- [ ] **Step 1: Add/update non-secret Groq settings and an empty key line**

Set exactly the approved Groq/AI values, keep `BOT_DATA_MODE=mock`, keep Telegram settings unchanged, and ensure `GROQ_API_KEY=` is empty. Use a targeted edit that never prints existing secret values.

- [ ] **Step 2: Verify secret safety without displaying values**

Report only booleans: `.env` ignored, Groq key empty, Telegram token still set, no `.env` in backup/ZIP, and no exposed key pattern in source/logs.

- [ ] **Step 3: Ask the user to insert a newly rotated key locally**

Pause before any live Groq request or bot restart.

### Task 10: Post-key live verification and controlled restart

**Files:** No code changes expected.

- [ ] **Step 1: After user confirmation, load settings without printing the key**
- [ ] **Step 2: Make one minimal sanitized Groq request and report provider/model/status only**
- [ ] **Step 3: Re-run targeted provider/config checks**
- [ ] **Step 4: Stop only the PID from this project's `bot.pid`; preserve SQLite**
- [ ] **Step 5: Start via `START_BOT.bat`, verify new PID, polling, empty stderr, and secret-free logs**
- [ ] **Step 6: Ask both Telegram users to test `/assistant`, then continue the two-account command/SOS/demo checklist**
