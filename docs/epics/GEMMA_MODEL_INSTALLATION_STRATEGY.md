# Gemma Model Installation Strategy

This document outlines the standard process for verifying and installing Gemma models when a user runs the Keimenon desktop application.

**Core Tenets:**

1. Keimenon connects to a Keimenon-managed native local Gemma runtime. (Developer fallbacks such as Docker, LM Studio, or Ollama are supported via a compatibility endpoint).
2. The runtime host is infrastructure. For the product, Keimenon manages it natively.
3. Keimenon requires the `gemma` model family. Support for other model families is explicitly excluded.
4. Model weights are **not bundled** into the Keimenon `.exe` payload. They are downloaded post-install.

## Installation Path

The current implementation relies on a "detect and advise" strategy:

1. **Host Detection:**
   Keimenon uses the `LocalInferenceManager` to check the status of the native runtime backend.
2. **Model Verification:**
   Keimenon checks if a valid Gemma model is installed locally under `<userData>/models/gemma`.

3. **Status Reporting:**
   The UI reports explicit states: "Native runtime not installed", "Gemma model missing", "License/terms required", etc.

4. **Installation Guidance:**
   If the native runtime or model is missing, Keimenon provides actionable next steps (e.g., "Download model", "Accept terms").

   **Primary path:** Keimenon-managed native Gemma runtime.
   **Fallback compatibility:** Docker was evaluated as a developer proof/fallback path, but is not the end-user product architecture. Local endpoints exposing an exact Gemma-family model ID remain as a developer fallback.

## Configuring GEMMA_LOCAL_MODEL

Recommended GEMMA_LOCAL_MODEL cannot be hard-coded until the selected local runtime host exposes the model through /models.

For install planning, target an official Gemma-family instruction model verified from Google documentation or an official registry.

At runtime, set GEMMA_LOCAL_MODEL to the exact Gemma-family model ID returned by /models.

If no Gemma-family model appears in `/models`, Keimenon reports `GEMMA_MODEL_NOT_FOUND`.

## Re-Verification and Smoke Test

Once the user confirms they have installed the model into the runtime host, Keimenon re-checks the `/v1/models` endpoint. Upon successful detection, Keimenon executes the standard `npm run gemma:smoke` routine to verify inference capability before marking the runtime as "Ready".

## Current Trial Status (2026-05-16)

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
