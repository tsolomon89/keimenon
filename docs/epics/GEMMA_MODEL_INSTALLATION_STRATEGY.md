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
   Keimenon queries the `/v1/models` endpoint of the reachable host and parses the response to find an exact configured Gemma model ID. The default target is the **Gemma 4 E4B instruction model** (e.g., `gemma-4-e4b-it`), unless the local runtime exposes a different exact Gemma-family ID. Older aliases like `gemma:2b` or `gemma:7b` are fallback/low-resource examples, not the primary project target.

3. **Status Reporting:**
   If the host is unreachable, the UI reports **Gemma Runtime Offline**.
   If the host is reachable but lacks the Gemma model, the UI reports **Gemma Model Missing**.
   If both exist, the UI reports **Gemma Online**.

4. **Installation Guidance:**
   If the Gemma model is missing, Keimenon provides clear, copy-pasteable instructions for the user to pull the model into their respective host.

## Host-Specific Examples

### Ollama-compatible host

If the detected host operates via Ollama (`http://localhost:11434/v1`), provide the following instruction:

> "Install a Gemma model into the Ollama runtime host by running the following command in your terminal:"
>
> ```bash
> ollama run gemma-4-e4b-it
> ```
>
> _(Or use `ollama run gemma:2b` for a low-resource fallback)._

### LM Studio-compatible host

If the detected host operates via LM Studio (`http://localhost:1234/v1`), provide the following instruction:

> "Install a Gemma model into the LM Studio runtime host by opening the LM Studio application, searching for 'Gemma', and downloading the 'gemma-4-e4b-it' or equivalent Gemma-family model."

## Re-Verification and Smoke Test

Once the user confirms they have installed the model into the runtime host, Keimenon re-checks the `/v1/models` endpoint. Upon successful detection, Keimenon executes the standard `npm run gemma:smoke` routine to verify inference capability before marking the runtime as "Ready".

## Current Trial Status (2026-05-15)

Manual Gemma trial pending — no local runtime host serving Gemma is reachable.

- Tried: `http://localhost:1234/v1/models` (LM Studio)
- Tried: `http://localhost:11434/v1/models` (Ollama)
- Result: Connection refused.

Do not proceed with non-Gemma models. The system will report `GEMMA_MODEL_NOT_FOUND` if a host is reachable but exposes only non-Gemma model IDs.
