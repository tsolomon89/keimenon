# EPIC: Gemma Local Runtime Setup / First-Run Configuration

**Status:** COMPLETE AND HARDENED  
**Date:** 2026-05-14

## 1. Overview

This epic completes the first-run configuration and structural hardening of the **local Gemma runtime**. It moves the Keimenon backend from an unverified proxy boundary to a hardened integration that supports status checking, graceful failure recovery, and manual runtime smoke-testing.

By design, this does _not_ introduce BYOK (Bring Your Own Key) or cloud-provider endpoints. It explicitly honors the Keimenon local-first requirement. The intended product architecture is a Keimenon-managed native Gemma runtime. Docker, LM Studio, and Ollama are supported merely as developer fallbacks or compatibility paths.

## Terminology: Gemma vs Runtime Host

Keimenon supports Gemma as the local model family. The default target is pending official runtime verification.

A local runtime host may be used only to serve a Gemma model through a local API. The intended end-user product architecture is a Keimenon-managed native local Gemma runtime. Third-party local runtime hosts such as Docker (ai/gemma4 via Docker Desktop), LM Studio, or Ollama are supported merely as developer proof/fallback compatibility paths. Docker was evaluated as a developer proof path, but is not the end-user product architecture.

The runtime host is not the model.

The model family remains Gemma.

The provider contract is:

```txt
Principal(agent)
→ uses GemmaLocalProvider
→ calls a local runtime host (e.g. Docker-hosted Gemma 4)
→ which serves an exact Gemma model ID
```

The local runtime trial checks the configured base URL. Third party fallbacks include:

- LM Studio-compatible host: `http://localhost:1234/v1`
- Ollama OpenAI-compatible host: `http://localhost:11434/v1`

These checks do not imply support for non-Gemma model families.

If a host is reachable but exposes only non-Gemma model IDs, Keimenon should report `GEMMA_MODEL_NOT_FOUND` and should not run synthesis against those models.

## 2. Configuration Contract

The runtime uses the following environment variables (defined in `.env`):

| Variable                   | Default             | Purpose                                                                        |
| :------------------------- | :------------------ | :----------------------------------------------------------------------------- |
| `GEMMA_LOCAL_BASE_URL`     | _(required)_        | Base URI for the local provider (e.g., `http://127.0.0.1:1234/v1`)             |
| `GEMMA_LOCAL_RUNTIME_KIND` | `openai-compatible` | Specifies provider format (`openai-compatible`, `ollama`, `lm-studio`)         |
| `GEMMA_LOCAL_MODEL`        | _(must set)_        | The exact model identifier required by the local server (verified via /models) |
| `GEMMA_LOCAL_TIMEOUT_MS`   | `60000`             | Synthesis request timeout limit in milliseconds                                |
| `GEMMA_LOCAL_THINKING`     | `off`               | Toggles processing of specific `<think>` output tags                           |

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
   - Result: Endpoints unreachable (no local runtime host active).
   - To complete verification: Start a local host serving a Gemma model, set `GEMMA_LOCAL_BASE_URL`, and run `npm run gemma:status` and `npm run gemma:smoke`.

## 5. Manual Local Gemma Trial

Gemma 4 local install blocked.

- Date: 2026-05-16
- Google AI Edge source reviewed: yes
- Docker `ai/gemma4` verified: yes (Official Google image found via Docker Hub and AI Edge references)
- official/sufficient source status: Official Docker integration exists (`docker model pull ai/gemma4`).
- Exact model ID: N/A
- Model variant: N/A
- Local runtime endpoint: N/A
- `/models` result: N/A
- `gemma:status` result: N/A
- `gemma:smoke` result: N/A
- Desktop status result: N/A
- Desktop real-Gemma conversation result: N/A
- AgentRun provider/model verification: N/A
- Issues encountered:
  - Docker Desktop is not running or not installed on this system.
  - The `docker ps` command failed with connection errors.
- Remaining risks: We cannot test end-to-end integration without a valid live host.

### Required Manual Action

Please install and run Docker Desktop, and use the Google AI Edge official instructions to pull and run the `ai/gemma4` image, exposing an OpenAI-compatible endpoint for Keimenon to connect to.

## 6. Next Steps

With the Gemma local infrastructure bound and verifiable, the next epic should execute the **Real Local Gemma Manual Trial**.

- **Manual Intervention**: Download and install Docker Desktop, and install the Gemma 4 model using `docker model pull ai/gemma4`.
- **Execute Smoke Tests**: Start a local host serving a Gemma model, configure the `.env` file, and run `npm run gemma:smoke`.
- **Full Browser Product Loop E2E**: Prove the product path `canvas → selection → conversation → message → AgentRun → provenance UI`.
