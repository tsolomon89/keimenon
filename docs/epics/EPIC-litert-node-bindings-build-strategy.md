# EPIC: LiteRT-LM Build Strategy

## Current Scaffold: `node-gyp`

For the initial native binding integration, `@keimenon/litert-node-bindings` uses `node-gyp`. This is because the current iteration is a thin N-API package that provides the structural integration with the Electron desktop app and the inference helper, but does not yet link against the real LiteRT CMake dependencies. `node-gyp` integrates seamlessly with standard `electron-builder` native recompilation steps, ensuring the structural pipeline is verified first.

## Future Path: `cmake-js`

Based on the latest integration research, the LiteRT-LM C++ API is distributed strictly as source code (via Bazel/CMake `CMakeLists.txt`), not as a prebuilt `litert_lm.dll`. Therefore, to link the actual C++ implementation, the bindings package must eventually pull down the LiteRT-LM source and link against `LiteRTLM::Runtime::Engine` natively. `cmake-js` is confirmed as the future build system since it integrates natively with `CMakeLists.txt`, allowing us to use `FetchContent` to download and build LiteRT-LM safely.

### Concrete Integration Decisions

1. **Can node-gyp directly include LiteRT-LM headers/libs?**
   No, `node-gyp` does not handle Bazel or CMake targets elegantly without complex manual pre-build steps.
2. **Should LiteRT-LM be built separately via Bazel, then linked?**
   While possible, it breaks the cross-platform `npm install` flow. Embedding the build into `cmake-js` via `FetchContent` is preferable.
3. **Should the addon migrate to cmake-js?**
   Yes. `cmake-js` natively understands CMake targets, and LiteRT-LM provides a `CMakeLists.txt` for its runtime engine.
4. **What is the least risky Windows path?**
   Building LiteRT-LM using `cmake-js` alongside the N-API binding as a single compiled `.node` artifact, while copying the prebuilt GPU delegate DLLs from Google's repository into the Electron `native/win32-x64/bin` folder.
5. **What files must be produced before binding.cc can call `EngineFactory::CreateDefault()`?**
   - A static library or object files for `LiteRTLM::Runtime::Engine`
   - LiteRT-LM C++ Headers (`engine.h`, `engine_factory.h`) available in the include path
   - The underlying `libLiteRt.dll` (which we dynamically probe at runtime)

## Desktop Packaging Target

For the desktop product, the preferred linking strategy is **dynamic DLL loading**. The intended layout is:

```txt
resources/
  native/
    win32-x64/
      litert-node-bindings.node
      bin/
        libLiteRt.dll
        libLiteRtWebGpuAccelerator.dll
```

Static linking is avoided initially to ease inspection, debugging, and dynamic replacement, as well as to simplify platform-specific binary distribution packaging.
