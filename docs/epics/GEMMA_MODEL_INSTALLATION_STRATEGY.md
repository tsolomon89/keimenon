# Gemma Model Installation Strategy

This document outlines the standard process for verifying and installing Gemma models when a user runs the Keimenon desktop application.

**Core Tenets:**

1. Keimenon connects to a local Gemma-serving runtime host (e.g., LM Studio or Ollama).
2. The runtime host is not a model alternative. It is infrastructure.
3. Keimenon requires the `gemma` model family. Support for other model families is explicitly excluded.
4. Model weights are **not bundled** into the Keimenon `.exe` payload.

## Installation Path

The current implementation relies on a "detect and advise" strategy:

1. **Host Detection:**
   Keimenon attempts to connect to a local API (e.g., `http://localhost:11434/v1` for Ollama or `http://localhost:1234/v1` for LM Studio).
2. **Model Verification:**
   Keimenon queries the `/v1/models` endpoint of the reachable host and parses the response to find an exact configured Gemma model ID.

3. **Status Reporting:**
   If the host is unreachable, the UI reports **Gemma Runtime Offline**.
   If the host is reachable but lacks the Gemma model, the UI reports **Gemma Model Missing**.
   If both exist, the UI reports **Gemma Online**.

4. **Installation Guidance:**
   If the Gemma model is missing, Keimenon provides clear instructions for the user to pull the model into their respective host.

## Configuring GEMMA_LOCAL_MODEL

Do not guess the model ID.

First query:

```bash
curl <GEMMA_LOCAL_BASE_URL>/models
```

Then set:

```bash
GEMMA_LOCAL_MODEL=<exact Gemma-family model id returned by /models>
```

Example:

If `/models` returns:

```json
{
  "data": [{ "id": "google/gemma-4-e4b-it" }]
}
```

then set:

```bash
GEMMA_LOCAL_MODEL=google/gemma-4-e4b-it
```

If no Gemma-family model appears in `/models`, Keimenon reports `GEMMA_MODEL_NOT_FOUND`.

## Re-Verification and Smoke Test

Once the user confirms they have installed the model into the runtime host, Keimenon re-checks the `/v1/models` endpoint. Upon successful detection, Keimenon executes the standard `npm run gemma:smoke` routine to verify inference capability before marking the runtime as "Ready".

## Current Trial Status (2026-05-15)

Gemma 4 local install blocked.

- Date: 2026-05-15
- Model source: Checked https://huggingface.co/google/gemma-4-e4b-it / Google Deepmind
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
  - `ollama` and `lms` CLI tools are not installed or recognized.
  - Ports 11434 (Ollama) and 1234 (LM Studio) refused connection.
- Remaining risks: We cannot test end-to-end integration without a valid live host.

### Required Manual Action

Please download and install a local runtime host such as Ollama (https://ollama.com/) or LM Studio (https://lmstudio.ai/), then download the Gemma 4 (or equivalent Gemma-family) model.
