# Gemma 4 Model Installation Strategy

This document outlines the standard process for verifying and installing Gemma 4 models when a user runs the Keimenon desktop application.

**Core Tenets:**

1. Keimenon connects to a Keimenon-managed native local Gemma runtime. (An endpoint-compatible developer fallback is supported for local endpoints exposing an exact Gemma 4 model ID).
2. The runtime host is infrastructure. For the product, Keimenon manages it natively.
3. Keimenon explicitly targets the **Gemma 4** model family (e.g., E2B, E4B, 26B, 31B). Support for other model families or older Gemma 2 models is explicitly excluded from the active product path (Gemma 2 is restricted to archived fallback references only).
4. Model weights are **not bundled** into the Keimenon `.exe` payload. They are downloaded post-install.

## Installation Path

The current implementation relies on a "detect and advise" strategy:

1. **Host Detection:**
   Keimenon uses the `LocalInferenceManager` to check the status of the native runtime backend.
2. **Model Verification:**
   Keimenon checks if a valid Gemma 4 model is installed locally under `<userData>/models/gemma`.

3. **Status Reporting:**
   The UI reports explicit states: "Native runtime not installed", "Gemma 4 model missing", "License/terms required", etc.

4. **Installation Guidance:**
   If the native runtime or model is missing, Keimenon provides actionable next steps (e.g., "Download model", "Accept terms").
   _Note: The current blocker is not "Gemma model missing" generically. The blocker is: official Gemma 4 LiteRT/native artifact pending verification._

   **Primary path:** Keimenon-managed native Gemma 4 runtime.
   **Fallback compatibility:** Local endpoints exposing an exact Gemma 4 model ID remain as an endpoint-compatible developer fallback.

## Model Identity

The active local model is the verified manifest entry under `userData/models/gemma`.

## Re-Verification and Smoke Test

Once the user confirms they have installed the model, Keimenon re-checks the runtime status. Upon successful detection, Keimenon executes the standard `npm run inference:smoke` routine to verify inference capability before marking the runtime as "Ready".

## Current Trial Status (2026-05-16)

Gemma 4 local install pending native runtime implementation.

- Date: 2026-05-16
- Official LiteRT/Gemma 4 artifact source reviewed: Yes (Pending exact file verification)
- Exact model ID: Pending official implementation
- Model variant: Pending (E2B, E4B, 26B, 31B)
- Local runtime endpoint: Native Helper Process
- `/models` result: N/A
- `inference:status` result: N/A
- `inference:smoke` result: N/A
- Desktop status result: N/A
- Desktop real-Gemma conversation result: N/A
- AgentRun provider/model verification: N/A

### Required next implementation work:

- verify official LiteRT/Gemma 4 local model artifact
- implement native helper model loading
- implement explicit user-consented model download
- keep model files under Electron userData/models/gemma
