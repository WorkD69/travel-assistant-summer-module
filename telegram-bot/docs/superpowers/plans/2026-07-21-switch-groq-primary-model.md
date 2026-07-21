# Switch Groq Primary Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the Telegram bot's primary Groq model with `llama-3.3-70b-versatile`, retain `openai/gpt-oss-20b` and `MockAIProvider` fallbacks, verify the live models, and restart the one bot process without changing user data or secrets.

**Architecture:** Keep the existing `AIProvider` abstraction, factory composition, shared `httpx.AsyncClient`, and sequential retry/fallback logic unchanged. Treat `Settings` and local `.env` as the model-name sources of truth, update model-specific tests and current documentation, then verify offline and live behavior before a PID-scoped restart.

**Tech Stack:** Python 3.12, aiogram 3, pydantic-settings, httpx/MockTransport, pytest, Windows batch/PowerShell, SQLite.

---

### Task 1: Preserve security and runtime state

**Files:**
- Read: `.gitignore`
- Read: `.env` through `Settings` without printing it
- Read: `.env.example`
- Read: `bot_state.db`
- Read: `bot.pid`

- [ ] **Step 1: Verify the secret boundary**

Run a read-only check that reports only booleans and non-secret model names: `.env` is ignored, the key/token are configured, `.env.example` has no token-shaped values, and no project ZIP contains `.env`.

- [ ] **Step 2: Record the non-secret baseline**

Record `AI_PROVIDER`, primary/fallback model names, `BOT_DATA_MODE`, bot PID, SQLite integrity, link count, and active-trip count. Do not stop the bot.

### Task 2: Drive the model-default change with TDD

**Files:**
- Modify: `tests/test_config.py`
- Modify: `app/config.py`

- [ ] **Step 1: Write the failing expectation**

Change the Groq configuration test to construct and expect:

```python
groq_model="llama-3.3-70b-versatile"
assert settings.groq_model == "llama-3.3-70b-versatile"
```

Add a default-settings assertion using `Settings(_env_file=None)` so the production default must also be the new primary model.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_config.py -q
```

Expected: the new default-model assertion fails because `app/config.py` still defaults to `openai/gpt-oss-120b`.

- [ ] **Step 3: Implement the minimal production change**

In `app/config.py`, change only:

```python
groq_model: str = "llama-3.3-70b-versatile"
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same pytest command and require all `tests/test_config.py` tests to pass.

### Task 3: Align local configuration, test fixtures, and documentation

**Files:**
- Modify: `.env`
- Modify: `.env.example`
- Modify: `tests/test_assistant.py`
- Modify: `tests/test_windows_support.py`
- Modify: `docs/GROQ.md`

- [ ] **Step 1: Change only the primary model in `.env`**

Replace exactly `GROQ_MODEL=openai/gpt-oss-120b` with:

```dotenv
GROQ_MODEL=llama-3.3-70b-versatile
```

Leave the existing `GROQ_API_KEY`, Telegram token, URLs, database, data mode, and fallback model untouched.

- [ ] **Step 2: Align non-secret examples and MockTransport fixtures**

Use `llama-3.3-70b-versatile` as the primary model in `.env.example` and Groq unit-test fixtures/expectations. Extend the 404 fallback test to assert that both sequential requests carry the same test-only Authorization header.

- [ ] **Step 3: Update current documentation**

Add the explicit current chain to `docs/GROQ.md`:

```text
llama-3.3-70b-versatile -> openai/gpt-oss-20b -> MockAIProvider
```

Do not add a real key or create a ZIP.

- [ ] **Step 4: Verify effective configuration safely**

Load `Settings()` and report only provider/model names, key-present boolean, `BOT_DATA_MODE`, and validation-problem count. Confirm production `GroqAIProvider` contains no old hard-coded model and factory passes both model names from settings.

### Task 4: Run offline verification while the current bot remains running

**Files:**
- Test: `tests/test_assistant.py`
- Test: `tests/test_config.py`
- Test: `tests/test_windows_support.py`

- [ ] **Step 1: Run model/fallback unit tests**

Run the relevant pytest files and verify success, 404, 429, timeout, 5xx, authentication behavior, sequential fallback, shared key header, Mock fallback, safe logs, and handler abstraction through MockTransport/fakes only.

- [ ] **Step 2: Run project checks**

Run:

```powershell
.\CHECK_BOT.bat
cmd /c "RUN_TESTS.bat < nul"
```

Require both exit codes to be zero before stopping the live bot.

### Task 5: Verify the live Groq models without exposing secrets

**Files:**
- Read: `.env` through `Settings`

- [ ] **Step 1: Verify the new primary with one short request**

Use a temporary `GroqAIProvider` configured with the primary model as both model slots and `max_retries=0`. Record only model name, HTTP status, success boolean, and error type; do not print prompt, response, key, or headers.

- [ ] **Step 2: Verify controlled provider fallback**

Use a temporary provider with `definitely-nonexistent-model` as primary, `openai/gpt-oss-20b` as fallback, and `max_retries=0`. Require sequential statuses `404` then `200`, a non-empty real response, and no `MockAIProvider` invocation. Do not modify `.env` for this test.

### Task 6: Restart exactly one bot process and preserve SQLite

**Files:**
- Read: `bot.pid`
- Execute: `STOP_BOT.bat`
- Execute: `START_BOT.bat`
- Read: `logs/bot.stdout.log`
- Read: `logs/bot.stderr.log`
- Read: `bot_state.db`

- [ ] **Step 1: Identify and stop only the project bot PID**

Validate that `bot.pid` refers to the project `.venv` process running `-m app.bot`, then use the штатный stop path. Do not terminate any other Python process.

- [ ] **Step 2: Start through the штатный launcher**

Run `START_BOT.bat` non-interactively only after offline and live API checks pass. Verify one matching polling process and no polling conflict.

- [ ] **Step 3: Verify state and safe logs**

Require SQLite integrity `ok`, unchanged link/active-trip counts, final configured model names, one active PID, successful Telegram polling, and no secret-shaped values in source/logs. Report error classes only.

### Task 7: Request the user acceptance check

**Files:**
- Read: `logs/bot.stdout.log`

- [ ] **Step 1: Ask for one Telegram question**

Ask the user to send:

```text
/assistant
Какое ближайшее событие в моей поездке?
```

- [ ] **Step 2: Verify the resulting safe metadata**

After the user confirms sending it, inspect only safe logs and confirm `provider=groq`, primary model HTTP 200, no fallback-model request for that update, no Mock label, and no key/prompt leakage.

### Self-review

- The plan covers all 14 sections of the supplied specification.
- It changes only Telegram-bot AI model configuration, tests, and current Groq documentation.
- It preserves frontend, backend, OpenAPI, keys, SQLite/FSM, links, SOS, settings, and history.
- Live Mock behavior is tested offline; the live key is not damaged or deliberately rate-limited.
- No Git commit/worktree is planned because the repository is associated with the unsafe `C:\` Git root and the user did not request Git operations.
