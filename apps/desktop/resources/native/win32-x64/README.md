# Native Dependencies

This directory contains the `litert-node-bindings.node` C++ binary and its dynamically loaded shared libraries.

To enable LiteRT-LM GPU execution, the `libLiteRt.dll` delegate library must be placed here.
Currently, this file is intentionally missing to enforce the `RUNTIME_DEPENDENCY_MISSING` state during testing.

When the real `LiteRT-LM` pipeline is completely integrated and built via `cmake-js`, all underlying dependent DLLs will be deployed here by the build system.
