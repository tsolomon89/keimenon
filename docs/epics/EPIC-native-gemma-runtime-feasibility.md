# EPIC: Native Gemma Runtime Feasibility

**Status:** NATIVE RUNTIME SCAFFOLD IMPLEMENTED
**Date:** 2026-05-16

## Current Status (Contract Hardening)

- Native runtime scaffold exists (`NativeGemmaRuntimeBackend`).
- Model manifest foundation exists (`ModelManager`).
- License gate scaffold exists.
- Real native helper process is pending (C++ implementation).
- Real model download pending official source implementation.

## 1. Mission

Shift Keimenon's local LLM runtime architecture to a native, self-managed local Gemma runtime bundled with the desktop application.

This document records the **Feasibility Hypotheses** that must be verified before locking in this architecture.

**Candidate target: Architecture B — Keimenon-managed native helper process wrapping an official Google-supported local Gemma runtime, if verified.**

## 2. Feasibility Hypotheses to Verify

The following claims form the foundation of Architecture B. They must be verified against official sources.

| Claim                                                                                                                                                                          | Official Source URL                                         | Confidence | Implication for Keimenon                                                                                          | Unresolved Questions                                                                                                      |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- | :--------- | :---------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| **1. Official Local Runtime:** Google LiteRT (formerly TensorFlow Lite) / `litert-lm` is the officially recommended engine for running Gemma natively on edge/desktop devices. | https://ai.google.dev/edge/litert                           | High       | Keimenon should target LiteRT bindings instead of ONNX or generic Llama.cpp if pursuing the official Google path. | Is `litert-lm` production-ready for desktop C++ integration, or only Android/iOS?                                         |
| **2. Windows Desktop Support:** LiteRT supports native execution on Windows desktop environments.                                                                              | https://ai.google.dev/edge/litert/build                     | High       | A Windows `.exe` helper process can be compiled.                                                                  | Are pre-compiled Windows binaries available, or must we build LiteRT from source?                                         |
| **3. CPU-only Support:** LiteRT supports high-performance CPU inference via XNNPACK delegates.                                                                                 | https://github.com/google/XNNPACK                           | High       | Baseline users without dedicated GPUs can still run Keimenon natively.                                            | What is the expected token/sec rate for Gemma on a standard consumer CPU?                                                 |
| **4. GPU Acceleration on Windows:** LiteRT supports Windows GPU acceleration (e.g., via Vulkan or DirectML delegates).                                                         | https://ai.google.dev/edge/litert/performance/gpu           | Medium     | Users with dedicated GPUs can get significantly faster synthesis.                                                 | Which backend (Vulkan vs DirectML) is officially recommended and stable for Gemma via LiteRT on Windows?                  |
| **5. Model Format:** LiteRT requires models to be converted to `.tflite` or `.task` format.                                                                                    | https://ai.google.dev/gemma/docs/lite_rt                    | High       | We cannot use `.gguf` or PyTorch formats directly.                                                                | Are pre-converted Gemma instruction models officially maintained by Google?                                               |
| **6. Model Download Source:** Official `.tflite` model files are available via Kaggle or Hugging Face.                                                                         | https://huggingface.co/google                               | High       | We can point Keimenon's `ModelManager` to these URLs.                                                             | What is the exact URL and programmatic download API for the `.tflite` format?                                             |
| **7. Post-Install Downloadability:** Model files can be downloaded programmatically by Keimenon after installation.                                                            | N/A (Standard Node/Electron capability)                     | High       | We don't need to bloat the Keimenon installer with a multi-GB model file.                                         | Can we resume interrupted downloads natively?                                                                             |
| **8. License/Terms Gate:** Gemma terms of use must be accepted before downloading official weights.                                                                            | https://ai.google.dev/gemma/terms                           | High       | The Keimenon UI must present a license acceptance screen before initiating the download.                          | How does automated downloading prove consent to Kaggle/HF (e.g., using a user-provided token)?                            |
| **9. Native Integration:** Direct N-API integration into Node/Electron is possible.                                                                                            | N/A                                                         | Low        | If true, we could run inference in the same process.                                                              | Is it safe to run heavy C++ inference in Electron's main process without blocking the event loop or causing hard crashes? |
| **10. Architecture B (Helper Process):** A Keimenon-managed native helper process (wrapping LiteRT) is safer and more robust than direct N-API integration.                    | N/A (Architectural best practice)                           | High       | We must build and ship a separate `keimenon-inference.exe` binary.                                                | How will Keimenon communicate with this process (stdio/JSON-RPC, local HTTP, or local sockets)?                           |
| **11. Packaging Implications:** The helper executable and required LiteRT DLLs can be bundled in Electron `extraResources`.                                                    | https://www.electron.build/configuration/configuration.html | High       | The NSIS installer size will grow slightly to include the C++ binary.                                             | What are the exact C++ redistributable dependencies required by LiteRT on Windows?                                        |
| **12. Minimal Viable Model:** A specific Gemma model variant is optimal for desktop non-technical users.                                                                       | Pending                                                     | Low        | Keimenon's `ModelManager` will request this exact variant.                                                        | Which official variant provides the best balance of context window, intelligence, and RAM usage on consumer hardware?     |

## 3. Decision Matrix (Hypothesis Validation)

The sprint will validate the above claims to formally select the architecture.

- **A. Native direct Node integration:** High risk of application crashes and event-loop blocking.
- **B. Keimenon-managed native helper process (LiteRT):** **Candidate Target.** Safest isolation, aligns with official edge paths.
- **C. Endpoint-compatible developer fallback:** Demoted to compatibility fallback. Not the target product architecture.

## 4. Next Steps

1.  Review and verify the official LiteRT documentation for Windows desktop integration.
2.  Determine the exact communication protocol between Keimenon Node backend and the native helper process.
3.  Establish the minimal viable Gemma model based on official LiteRT availability.
