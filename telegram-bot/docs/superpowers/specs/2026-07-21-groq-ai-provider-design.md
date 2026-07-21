# Groq AI provider design

Date: 2026-07-21

## Goal and scope

Add Groq as the primary AI provider for the existing `/assistant` flow while the
travel data layer remains `BOT_DATA_MODE=mock`. Frontend, the teammate's backend,
Telegram handlers, assistant context authorization, and the backend API contract
remain unchanged. Gemini stays disabled. Mock AI is the final, visibly labelled
fallback.

The Groq key previously posted in chat is compromised and must never be used or
stored. It must be revoked. A newly created key will be entered locally into
`.env` and will never be printed, logged, committed, or archived.

## Configuration

Runtime values come from `.env`:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
GROQ_FALLBACK_MODEL=openai/gpt-oss-20b
AI_FALLBACK_TO_MOCK=true
AI_TIMEOUT_SECONDS=20
AI_MAX_RETRIES=1
AI_MAX_HISTORY_MESSAGES=8
AI_MAX_CONTEXT_CHARACTERS=16000
AI_MAX_OUTPUT_TOKENS=700
```

`GROQ_API_KEY` is intentionally absent from `.env.example`; the other non-secret
settings may be documented there. `.env` remains ignored by Git and release ZIP
validation. Startup validation accepts `groq` and reserves `backend` as a future
provider name, but no `BackendAIProvider` is implemented in this change.

## Components and boundaries

`GroqAIProvider` implements the existing `AIProvider` interface. It owns one
reusable `httpx.AsyncClient` for its full application lifetime and closes it from
the bot's graceful shutdown path. It sends sequential requests to
`POST {GROQ_BASE_URL}/chat/completions`.

Handlers depend only on `AIProvider`. They do not import Groq code, know its URL,
read its key, or parse its response. `create_ai_provider()` is the only provider
selection point.

`FallbackAIProvider` is a generic decorator that calls a primary `AIProvider` and,
when configured, calls `MockAIProvider` after a typed primary-provider failure.
Its returned text explicitly says that Groq failed and that the answer came from
Mock AI. This generic boundary can later wrap a `BackendAIProvider` without
changing handlers.

`AIProvider` gains an async no-op `close()` lifecycle method. `GroqAIProvider`
overrides it, and `FallbackAIProvider` closes its children. `BotApplication`
retains the selected provider and closes it exactly once during shutdown.

## Request construction and data safety

Each request uses:

- `Authorization: Bearer`, followed by the runtime `GROQ_API_KEY` value;
- `Content-Type: application/json`;
- `model`, `messages`, `temperature: 0.2`,
  `max_completion_tokens: AI_MAX_OUTPUT_TOKENS`, and `stream: false`.

Messages contain the existing system prompt, the role-filtered and sanitized trip
context, at most `AI_MAX_HISTORY_MESSAGES` sanitized history messages, and the
sanitized current question. Context is capped at
`AI_MAX_CONTEXT_CHARACTERS`. Existing backend/mock authorization continues to
exclude other users' SOS, unavailable documents, and unpublished/internal
messages. Existing sanitation continues to mask tokens, passwords, passport,
banking, email, phone, and similar personal data before the provider is called.
No full prompt is logged.

## Sequential retry and fallback policy

Only one request is active at a time.

1. Try `GROQ_MODEL`.
2. For timeout, network errors, HTTP 429, HTTP 5xx, or an invalid/empty response,
   retry the same model up to `AI_MAX_RETRIES` times after the initial attempt.
3. After exhaustion, try `GROQ_FALLBACK_MODEL` with the same bounded retry policy.
4. HTTP 404 skips remaining attempts for that model and advances to the fallback
   model; a 404 from the fallback model advances to Mock.
5. HTTP 401 or 403 performs no retry and does not try the second Groq model,
   because the same credentials/access would fail again. It immediately produces
   a clear key/access notice and uses Mock.
6. Other non-retryable HTTP or response-shape failures become a typed provider
   error and use Mock when `AI_FALLBACK_TO_MOCK=true`.
7. If Mock fallback is disabled, existing safe middleware messages are used.

## Logging

Groq logs may contain only provider name, model name, elapsed request time, HTTP
status, message count, approximate context size, attempt number, and error type.
They must never contain the API key, Authorization header, full prompt, question,
history, context, or raw response body. Existing secret masking remains enabled.

## Tests and verification

Unit tests use `httpx.MockTransport` and no real key. They cover success 200,
401, 403, primary-model 404, 429, timeout, network error, 5xx, empty/invalid
responses, fallback-model selection, retry bounds, Mock fallback labelling,
client reuse/close, configuration selection, and absence of keys/prompts from
logs.

After unit tests:

1. Run `CHECK_BOT.bat`.
2. Run the full pytest suite.
3. Preserve `bot_state.db` and current user data.
4. Stop only the PID recorded for this project and restart via `START_BOT.bat`.
5. Confirm polling, a clean stderr log, and no key in any log.
6. After a new key is inserted locally, make one controlled Groq request through
   `/assistant`, confirm the primary model response, then verify the clearly
   labelled Mock fallback with a test-only mocked failure rather than damaging the
   live key/configuration.
7. Leave the bot process running and continue the two-account Telegram scenarios.

## Non-goals

No frontend changes, backend changes, Gemini repair, backend AI implementation,
parallel model racing, tool calling, streaming, database reset, or release ZIP
creation are included.
