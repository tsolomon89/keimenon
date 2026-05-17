# EPIC: LiteRT-LM Build Strategy

## Current Scaffold: `node-gyp`

For the initial native binding integration, `@keimenon/litert-node-bindings` uses `node-gyp`. This is because the current iteration is a thin N-API package that provides the structural integration with the Electron desktop app and the inference helper, but does not yet link against the real LiteRT CMake dependencies. `node-gyp` integrates seamlessly with standard `electron-builder` native recompilation steps, ensuring the structural pipeline is verified first.

## Future Path: `cmake-js`

Based on the latest integration research, the LiteRT-LM C++ API is distributed strictly as source code (via Bazel/CMake `CMakeLists.txt`), not as a prebuilt `litert_lm.dll`. Therefore, to link the actual C++ implementation, the bindings package must eventually pull down the LiteRT-LM source and link against `LiteRTLM::Runtime::Engine` natively. `cmake-js` is confirmed as the future build system since it integrates natively with `CMakeLists.txt`, allowing us to use `FetchContent` to download and build LiteRT-LM safely.

## Desktop Packaging Target

For the desktop product, the preferred linking strategy is **dynamic DLL loading**. The intended layout is:

```txt
resources/
  native/
    win32-x64/
      litert-node-bindings.node
      LiteRT / LiteRT-LM DLLs (future)
      dependent DLLs (future)
```

Static linking is avoided initially to ease inspection, debugging, and dynamic replacement, as well as to simplify platform-specific binary distribution packaging.
