# Gemma Model Installation Strategy

This document outlines the standard process for verifying and installing Gemma models when a user runs the Keimenon desktop application.

**Core Tenets:**

1. Keimenon connects to a Keimenon-managed native local Gemma runtime. (An endpoint-compatible developer fallback is supported for local endpoints exposing an exact Gemma-family model ID).
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
   **Fallback compatibility:** Local endpoints exposing an exact Gemma-family model ID remain as an endpoint-compatible developer fallback.

## Configuring GEMMA_LOCAL_MODEL

At runtime, set GEMMA_LOCAL_MODEL to the exact Gemma-family model ID returned by the models registry.

If no Gemma-family model is found, Keimenon reports `GEMMA_MODEL_NOT_FOUND`.

## Re-Verification and Smoke Test

Once the user confirms they have installed the model, Keimenon re-checks the runtime status. Upon successful detection, Keimenon executes the standard `npm run gemma:smoke` routine to verify inference capability before marking the runtime as "Ready".

## Current Trial Status (2026-05-16)

Gemma local install pending native runtime implementation.

- Date: 2026-05-16
- Official LiteRT/Gemma artifact source reviewed: Yes
- Exact model ID: Pending official implementation
- Model variant: Pending
- Local runtime endpoint: Native Helper Process
- `/models` result: N/A
- `gemma:status` result: N/A
- `gemma:smoke` result: N/A
- Desktop status result: N/A
- Desktop real-Gemma conversation result: N/A
- AgentRun provider/model verification: N/A

### Required next implementation work:

- verify official LiteRT/Gemma local model artifact
- implement native helper model loading
- implement explicit user-consented model download
- keep model files under Electron userData/models/gemma

## Archived Historical Research Notes

> Note: Historical research evaluated Docker, Ollama, and LM Studio as potential integration targets. These are explicitly not the current product architecture. Named host software should not appear in current setup strategy.
