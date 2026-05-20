# EPIC: LiteRT-LM Build Strategy

## Current Scaffold: `node-gyp`

For the initial native binding integration, `@keimenon/litert-node-bindings` uses `node-gyp`. This is because the current iteration is a thin N-API package that provides the structural integration with the Electron desktop app and the inference helper, but does not yet link against the real LiteRT CMake dependencies. `node-gyp` integrates seamlessly with standard `electron-builder` native recompilation steps, ensuring the structural pipeline is verified first.

## Future Path: Separate Bazel Build + `node-gyp` Linkage

Based on the latest integration research, the LiteRT-LM C++ API is distributed as source code heavily optimized for Bazel. Attempting to convert the entire Google Bazel build graph into `cmake-js` or `node-gyp` natively is operationally risky and fragile.

Therefore, the chosen strategy (Strategy C) is to build LiteRT-LM separately using its native Bazel toolchain via a dedicated fetch/build script, stage the output artifacts (`.lib` static archives, `.h` headers, and prebuilt `.dll`s) into a structured `native/win32-x64` directory, and then consume them natively in `node-gyp`.

### Concrete Integration Decisions

1. **Can node-gyp directly include LiteRT-LM headers/libs?**
   Yes, once they are built separately via Bazel and staged locally.
2. **Should LiteRT-LM be built separately via Bazel, then linked?**
   Yes. This respects upstream tooling, produces reliable optimized libraries, and keeps the Node compilation step fast and simple.
3. **Should the addon migrate to cmake-js?**
   No. Since we are pre-building the C++ dependencies via Bazel, `node-gyp` is perfectly capable of compiling our `binding.cc` against the prebuilt static libraries and headers.
4. **What is the least risky Windows path?**
   Fetch LiteRT-LM source -> Run Bazel build -> Copy `.lib` and `.dll` to `packages/litert-node-bindings/native/win32-x64/` -> Compile `binding.cc` with `node-gyp` linking against the `.lib`.
5. **What files must be produced before binding.cc can call `EngineFactory::CreateDefault()`?**
   - A static library or object files for `LiteRTLM::Runtime::Engine` (staged in `lib/`)
   - LiteRT-LM C++ Headers (`engine.h`, `engine_factory.h`) (staged in `include/`)
   - The underlying `libLiteRt.dll` (staged in `bin/`)

### Package scripts preparation

As of the current phase, `package.json` contains:

- `build:native:node-gyp`
- `build:native:cmake`

This allows us to verify `cmake-js` capability locally without breaking the CI pipelines until the full `CMakeLists.txt` is introduced.

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
