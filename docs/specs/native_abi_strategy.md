# Native ABI Strategy

Keimenon relies on C++ native bindings for high-performance operations, particularly the `better-sqlite3` database adapter and the upcoming `@keimenon/litert-node-bindings` for local inference. This document formalizes the ABI (Application Binary Interface) strategy required to ensure these bindings run reliably within the Electron desktop environment.

## 1. Node ABI vs. Electron ABI

Native Node.js modules are compiled against specific V8 header versions (Node ABI). Because Electron bundles its own customized V8 and Node runtime, the Node ABI of the host machine often mismatches the Electron ABI.

- **Requirement:** All native modules MUST be rebuilt specifically against the target Electron version headers.

## 2. Rebuild Strategy & Postinstall Hooks

We utilize `electron-builder install-app-deps` as the canonical rebuild mechanism.

- **Hook:** The `apps/desktop/package.json` defines a `postinstall` script: `"postinstall": "electron-builder install-app-deps"`.
- **Behavior:** This command scans the `node_modules` tree, detects native addons, downloads the correct Electron headers matching `electron` in `devDependencies`, and recompiles them via `node-gyp`.

## 3. Windows x64 Target

For the primary Windows distribution:

- **Architecture:** `x64`
- **Compiler:** MSVC (Visual Studio Build Tools with C++ workload)
- **Prebuilds:** Where available, `electron-builder` will download pre-built binaries for the target ABI. If unavailable (as is the case for bespoke packages like `@keimenon/litert-node-bindings`), local compilation is forced.

## 4. Electron-Builder Packaging

The `electron-builder` configuration in `apps/desktop/package.json` ensures native dependencies are correctly packaged into `app.asar.unpacked` or specific resource directories.

- Third-party native modules are automatically placed in `app.asar.unpacked/node_modules` to prevent `EACCES` or `ENOENT` loading errors inside the ASAR archive.
- Proprietary or side-car native binaries (like `.node` files, DLLs) for `LiteRT-LM` must be explicitly defined in the `extraResources` array (mapped to `resources/native`).

## 5. CI Packaging Checks

To prevent ABI mismatch regressions:

1. The CI pipeline MUST run `npm rebuild` and `electron-builder install-app-deps` before executing `npm run make`.
2. Integration tests MUST boot the compiled executable and verify that the API backend successfully loads `better-sqlite3` and the native inference helper without throwing `Error: The module was compiled against a different Node.js version`.

By centralizing the rebuild step and explicitly defining the `native` resource layout, we guarantee that the inference helper process has predictable, reliable access to the exact `.node` files it needs to interface with Gemma 4 models on device.
