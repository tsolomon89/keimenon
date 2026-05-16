# Native Binding Distribution Layout

This folder contains precompiled native artifacts for Keimenon's desktop distribution. The `electron-builder` config includes this directory in the final packaged application.

## Structure

```txt
native/
  win32-x64/
    litert-node-bindings.node
  darwin-x64/
  darwin-arm64/
  linux-x64/
```

Currently, this acts as a placeholder structure until the real `LiteRT-LM` bindings are compiled and deployed.
