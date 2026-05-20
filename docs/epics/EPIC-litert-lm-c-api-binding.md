# EPIC: LiteRT-LM C API Binding Reference

This document acts as the technical specification and verification matrix for the LiteRT-LM C API integration inside `@keimenon/litert-node-bindings`.

## C API Symbol Table

All C API signatures are located in `c/engine.h`.

| Operation                      | Header       | Exact Symbol                                   | Input Types                                                                                                                  | Output Types              | Ownership / Cleanup Rule                                                                                                             |
| :----------------------------- | :----------- | :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------- |
| **Engine Settings Creation**   | `c/engine.h` | `litert_lm_engine_settings_create`             | `const char* model_path`<br>`const char* backend_str`<br>`const char* vision_backend_str`<br>`const char* audio_backend_str` | `LiteRtLmEngineSettings*` | Caller owns returned object. Must destroy via `litert_lm_engine_settings_delete`. Returns `NULL` on failure.                         |
| **Set Max Tokens**             | `c/engine.h` | `litert_lm_engine_settings_set_max_num_tokens` | `LiteRtLmEngineSettings* settings`<br>`int max_num_tokens`                                                                   | `void`                    | Settings object property mutation. No ownership transfer.                                                                            |
| **Engine Settings Cleanup**    | `c/engine.h` | `litert_lm_engine_settings_delete`             | `LiteRtLmEngineSettings* settings`                                                                                           | `void`                    | Frees the settings object memory.                                                                                                    |
| **Engine Instance Creation**   | `c/engine.h` | `litert_lm_engine_create`                      | `const LiteRtLmEngineSettings* settings`                                                                                     | `LiteRtLmEngine*`         | Caller owns returned engine. Must destroy via `litert_lm_engine_delete`. Returns `NULL` on failure.                                  |
| **Engine Instance Cleanup**    | `c/engine.h` | `litert_lm_engine_delete`                      | `LiteRtLmEngine* engine`                                                                                                     | `void`                    | Frees the engine memory.                                                                                                             |
| **Inference Session Creation** | `c/engine.h` | `litert_lm_engine_create_session`              | `LiteRtLmEngine* engine`<br>`LiteRtLmSessionConfig* config`                                                                  | `LiteRtLmSession*`        | Caller owns returned session. Must destroy via `litert_lm_session_delete`. Returns `NULL` on failure.                                |
| **Inference Session Cleanup**  | `c/engine.h` | `litert_lm_session_delete`                     | `LiteRtLmSession* session`                                                                                                   | `void`                    | Frees the session memory.                                                                                                            |
| **Generate Content**           | `c/engine.h` | `litert_lm_session_generate_content`           | `LiteRtLmSession* session`<br>`const LiteRtLmInputData* inputs`<br>`size_t num_inputs`                                       | `LiteRtLmResponses*`      | Caller owns returned responses. Must destroy via `litert_lm_responses_delete`. Returns `NULL` on failure.                            |
| **Get Candidate Count**        | `c/engine.h` | `litert_lm_responses_get_num_candidates`       | `const LiteRtLmResponses* responses`                                                                                         | `int`                     | Reads candidate count. No ownership transfer.                                                                                        |
| **Extract Response Text**      | `c/engine.h` | `litert_lm_responses_get_response_text_at`     | `const LiteRtLmResponses* responses`<br>`int index`                                                                          | `const char*`             | Returned pointer is owned by `responses` and valid only for its lifetime. Do **not** free directly. Returns `NULL` if out of bounds. |
| **Response Cleanup**           | `c/engine.h` | `litert_lm_responses_delete`                   | `LiteRtLmResponses* responses`                                                                                               | `void`                    | Frees the responses memory.                                                                                                          |
| **Set Min Log Level**          | `c/engine.h` | `litert_lm_set_min_log_level`                  | `int level`                                                                                                                  | `void`                    | Mutation of library global log level. No ownership transfer.                                                                         |

## Build Gating Strategy

We selected **Option A — Strict Native Build** with a graceful wrapper:

- Executing `build:native` directly inside `packages/litert-node-bindings` fails explicitly if `litert_lm_engine.lib` is absent.
- Executing `npm run build` or `turbo run build` from the workspace root runs a `check-and-build.js` wrapper. It detects that it is executing in a root-level workspace context and gracefully skips compiling the native addon (exiting with code `0` and a warning), preventing any workspace build breakages for other developers or CI runs.

## Native Model State Lifecycle

The global handles in `binding.cc` are managed as follows:

- `LiteRtLmEngine* g_engine = nullptr`
- `LiteRtLmSession* g_session = nullptr`
- `bool isModelLoaded = false`

State lifecycle steps:

1. `loadModel` checks for active model. If present, it executes `unloadModel` first.
2. It initializes the engine and session via C API symbols.
3. On any failure, global handles are cleanly deleted and nullified, throwing typed JS errors.
4. `unloadModel` nullifies all global pointers and deletes active engine/session instances in an idempotent manner.
