# win32-x64 Native Dependencies

This directory holds the native C++ dependencies required to compile and run `@keimenon/litert-node-bindings` for the `win32-x64` platform.

## Directory Structure

- `include/`: LiteRT-LM headers from the official source/build. (e.g., `engine.h`, `engine_factory.h`). These will be used by `cmake-js` during the bindings compilation.
- `lib/`: Import libraries or static libs (`.lib`) output from the CMake/Bazel build of LiteRT-LM. These will be linked against our `.node` file.
- `bin/`: Runtime DLLs (`.dll`). These include the required `libLiteRt.dll` and any optional backend delegates (e.g., `libLiteRtWebGpuAccelerator.dll`). These are copied into the Electron `resources/native/win32-x64` output directory during desktop packaging.

Do not commit large binaries directly to this repository if they can be fetched via a reproducible script, unless necessary for the core build loop. Ensure that `bin/` contains the files defined in the `dependency-manifest.json`.
