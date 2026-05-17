# EPIC: LiteRT-LM Build Strategy

## Current Scaffold: `node-gyp`

For the initial native binding integration, `@keimenon/litert-node-bindings` uses `node-gyp`. This is because the current iteration is a thin N-API package that provides the structural integration with the Electron desktop app and the inference helper, but does not yet link against the real LiteRT CMake dependencies. `node-gyp` integrates seamlessly with standard `electron-builder` native recompilation steps, ensuring the structural pipeline is verified first.

## Future Path: `cmake-js`

When the actual Google LiteRT and LiteRT-LM C++ libraries are integrated into the project, it is highly likely they will require imported CMake targets. At that point, the build system will pivot to `cmake-js` (or a CMake-driven native build) to natively resolve and link those dependencies. The scaffold we build now is designed to be build-system agnostic from the perspective of the consuming TypeScript code.

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
