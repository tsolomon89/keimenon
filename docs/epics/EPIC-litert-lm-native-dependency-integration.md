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

To verify dependency layout before compiling the C++ integration, we will probe for `libLiteRt.dll` dynamically in our Node-API `binding.cc` via `LoadLibraryA`. If absent, we report `RUNTIME_DEPENDENCY_MISSING`. If present, we return `RUNTIME_BINDING_INCOMPLETE` until the actual CMake-built API logic is wired up.
