# EPIC: Gemma Local Runtime Setup / First-Run Configuration

**Status:** COMPLETE AND HARDENED  
**Date:** 2026-05-14

## 1. Overview

This epic completes the first-run configuration and structural hardening of the **local Gemma runtime**. It moves the Keimenon backend from an unverified proxy boundary to a hardened integration that supports status checking, graceful failure recovery, and manual runtime smoke-testing.

By design, this does _not_ introduce BYOK (Bring Your Own Key) or cloud-provider endpoints. It explicitly honors the Keimenon local-first requirement, supporting Open-AI compatible local servers like LM Studio and Ollama.

## 2. Configuration Contract

The runtime uses the following environment variables (defined in `.env`):

| Variable                   | Default             | Purpose                                                                |
| :------------------------- | :------------------ | :--------------------------------------------------------------------- |
| `GEMMA_LOCAL_BASE_URL`     | _(required)_        | Base URI for the local provider (e.g., `http://127.0.0.1:1234/v1`)     |
| `GEMMA_LOCAL_RUNTIME_KIND` | `openai-compatible` | Specifies provider format (`openai-compatible`, `ollama`, `lm-studio`) |
| `GEMMA_LOCAL_MODEL`        | `gemma-4-e4b-it`    | The exact model identifier required by the local server                |
| `GEMMA_LOCAL_TIMEOUT_MS`   | `60000`             | Synthesis request timeout limit in milliseconds                        |
| `GEMMA_LOCAL_THINKING`     | `off`               | Toggles processing of specific `<think>` output tags                   |

If `GEMMA_LOCAL_BASE_URL` is missing, the API correctly surfaces `GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED` without crashing the core app.

## 3. Implemented Components

### 3.1 Hardened `GemmaLocalProvider`

The `GemmaLocalProvider` now adheres tightly to the `SynthesisProvider` interface while accurately throwing mapping errors. It provides the new `checkStatus()` helper to quickly ping the configured local server to determine availability.

### 3.2 `/api/v1/runtime/gemma/status` Endpoint

A new internal health route exposes the state of the local LLM server to the Keimenon front-end without triggering a full synthesis pipeline.

- Returns `{ configured: true, status: 'online' | 'offline', ... }`
- Bound by existing API Entitlements (requires `agent_runtime` feature capability).

### 3.3 UI Integration

`ConversationMessageRuntime.tsx` will now passively poll the status endpoint on mount. If the backend is properly configured and the LLM server is reachable, a green "Gemma Online" badge appears alongside the runtime indicators.

### 3.4 Command-Line Testing (The "Smoke" scripts)

For reliable debugging without running the full client:

- **`npm run gemma:status`**: Pings the endpoint and dumps the configuration contract state to stdout.
- **`npm run gemma:smoke`**: Directly invokes `GemmaLocalProvider.synthesize(...)` with a basic mocked context pack to prove that generation succeeds outside of the HTTP stack.

## 4. Verification

1. ✅ Unit tests / API checks pass for `app.ts` module mounting.
2. ✅ Environment variable contracts strictly parsed and enforced in `gemma-local-provider.ts`.
3. ✅ CLI smoke scripts added to `package.json` for rapid local diagnostics.
4. ✅ **Status Helper Behavior**: The `getGemmaStatus` helper now includes explicit `error_code` enums and `modelAvailable` checks.
5. ✅ **Provenance Endpoint**: `GET /api/v1/conversations/runs/:runId/provenance` is implemented and verified.
   - Tests assert that it returns `USED_EVIDENCE` for an account-scoped `AgentRun`.
   - Tests assert that cross-account access returns exactly a `404` status.
   - Tests assert that an `AgentRun` with no `USED_EVIDENCE` safely returns an empty array with zero stats.
6. ⏳ **Manual Trial (Pending)**:
   - Tried to ping `http://localhost:1234/v1/models` and `http://localhost:11434/v1/models`.
   - Result: Endpoints unreachable (no local runtime active).
   - To complete verification: Start LM Studio or Ollama, set `GEMMA_LOCAL_BASE_URL`, and run `npm run gemma:status` and `npm run gemma:smoke`.

## 5. Next Steps

With the Gemma local infrastructure bound and verifiable, the next epic should execute the **Real Local Gemma Manual Trial**.

- **Execute Smoke Tests**: Download LM Studio/Ollama, load the Gemma model, configure the `.env` file, and run `npm run gemma:smoke`.
- **Full Browser Product Loop E2E**: Prove the product path `canvas → selection → conversation → message → AgentRun → provenance UI`.
