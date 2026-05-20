# EPIC: Real LiteRT-LM Native Dependency Integration

## Purpose

This document outlines the findings and implementation strategy for integrating the actual LiteRT-LM C++ APIs into `@keimenon/litert-node-bindings`.

## Dependency Source Findings

Based on the [Google AI Edge LiteRT-LM repository](https://github.com/google-ai-edge/LiteRT-LM):

1. **What C++ library loads `.litertlm`?**
   The LiteRT-LM orchestration C++ layer, specifically using `litert::lm::EngineFactory::CreateDefault()`. The actual heavy lifting is done via the underlying `LiteRt` accelerator delegates.
2. **Where are its headers?**
   Headers are located in `runtime/engine/` (e.g. `engine.h`, `engine_factory.h`) and `runtime/conversation/`.
3. **Where are its Windows binaries or build instructions?**
   Build instructions use `bazel build //runtime/engine:litert_lm_main --config=windows`. Prebuilt GPU delegates (e.g. `libLiteRt.dll`, `libLiteRtWebGpuAccelerator.dll`) are distributed in `prebuilt/windows_x86_64/`. The orchestration layer (C++) must be built from source.
4. **Does it expose a C API, C++ API, CLI, or only mobile APIs?**
   It exposes a C++ API (`litert::lm`), Kotlin (Android), Python (`litert-lm run` via `uv`), and a CLI (`litert_lm_main`).
5. **Does it support Windows desktop?**
   Yes. LiteRT-LM runs natively on Windows with CPU and GPU backend support.
6. **Does it support CPU execution?**
   Yes, via `--backend=cpu`.
7. **Does it require GPU/Vulkan/DirectML delegates?**
   No, but if running on the GPU, it requires the prebuilt GPU delegate DLLs.
8. **Is the dependency available as prebuilt binaries or must Keimenon build from source?**
   The orchestration C++ APIs must be built from source. The lower-level GPU delegates are prebuilt binaries.
9. **Does it require CMake?**
   Officially uses Bazel, but it provides `CMakeLists.txt` making CMake (via `cmake-js`) a viable strategy for integration into our `.node` module.
10. **What exact minimal sample loads a `.litertlm` file?**

```cpp
ASSIGN_OR_RETURN(ModelAssets model_assets, ModelAssets::Create(model_path));
ASSIGN_OR_RETURN(Backend backend, litert::lm::GetBackendFromString("cpu"));
ASSIGN_OR_RETURN(EngineSettings engine_settings, EngineSettings::CreateDefault(std::move(model_assets), backend));
ASSIGN_OR_RETURN(auto engine, litert::lm::EngineFactory::CreateDefault(std::move(engine_settings)));
auto session_config = litert::lm::SessionConfig::CreateDefault();
ASSIGN_OR_RETURN(auto conversation_config, ConversationConfig::Builder().SetSessionConfig(session_config).Build(*engine));
ASSIGN_OR_RETURN(auto conversation, Conversation::Create(*engine, conversation_config));
```

## Integration Strategy

We are using a **dependency manifest** (`packages/litert-node-bindings/native/dependency-manifest.json`) to define the required and optional binaries:

- **Required**: `libLiteRt.dll`
- **Optional**: `libLiteRtWebGpuAccelerator.dll`

To verify dependency layout before compiling the C++ integration, we probe for these DLLs dynamically in our Node-API `binding.cc` via `LoadLibraryA`.

- If required dependencies are absent, we report `RUNTIME_DEPENDENCY_MISSING`.
- If some optional dependencies are absent but required ones are present, we report `RUNTIME_DEPENDENCY_PARTIAL` (which will be treated as `RUNTIME_BINDING_INCOMPLETE` until the API is linked).
- If present, we return `RUNTIME_BINDING_INCOMPLETE` until the actual CMake-built API logic is wired up.

Our next phase involves migrating the build from `node-gyp` to `cmake-js`, at which point `EngineFactory::CreateDefault()` will be successfully compiled against the LiteRT-LM C++ source headers.

## Upstream Verification (Phase 1)

1. **Exact repository URL:** `https://github.com/google-ai-edge/LiteRT-LM`
2. **Version strategy:** Pin to a specific commit or tag in `vendor/litert-lm/VERSION.json` to ensure deterministic builds.
3. **Windows build command:** `bazel build -c opt //runtime/... --config=windows` (if using Bazel) or via CMake.
4. **Bazel version requirements:** Bazelisk is recommended, usually Bazel 7.x.
5. **CMake availability:** `CMakeLists.txt` is provided, enabling CMake usage.
6. **Visual Studio Build Tools:** Requires MSVC (Desktop development with C++ workload) and Windows 10/11 SDK.
7. **Expected build outputs:** C++ static/shared libraries for orchestration (`liblitert_lm_engine.a` / `.lib`).
8. **Where DLLs are produced:** `libLiteRt.dll` and GPU delegates are distributed via `prebuilt/windows_x86_64/` or Bazel cache `bazel-bin/`.
9. **C++ API headers:** Available directly from source checkout under `runtime/engine/` and `runtime/conversation/`.
10. **Linkability:** `EngineFactory::CreateDefault()` is linkable by consuming the built libraries or building source directly.
