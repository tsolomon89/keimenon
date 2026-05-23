import * as path from 'path';
import * as fs from 'fs';

export type NativeBindingState =
  | 'runtime_unimplemented'
  | 'runtime_dependency_missing'
  | 'runtime_dependency_partial'
  | 'runtime_dependency_found'
  | 'runtime_binding_incomplete'
  | 'model_missing'
  | 'model_loaded'
  | 'ready'
  | 'error';

export interface BindingStatus {
  ok: boolean;
  state: NativeBindingState;
  message: string;
  native_deps_dir?: string;
  dependencies?: { filename: string; present: boolean; required: boolean }[];
}

export interface LiteRtNodeBindings {
  status(): BindingStatus;
  loadModel(path: string): Promise<{ success: boolean; message: string }>;
  generate(
    prompt: string,
    maxTokens?: number
  ): Promise<{ success: boolean; text?: string; error?: string }>;
  unloadModel(): Promise<void>;
}

// Load the compiled N-API binary or provide validation fallback
let nativeAddon: any = null;

try {
  // Attempt to resolve the pre-built native module path
  const pathsToTry = [
    path.resolve(__dirname, '../build/Release/litert_node_bindings.node'),
    path.resolve(__dirname, '../native/win32-x64/litert_node_bindings.node'),
    // Packaging targets
    path.resolve(process.cwd(), 'resources/native/win32-x64/litert_node_bindings.node'),
  ];

  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      nativeAddon = require(p);
      break;
    }
  }
} catch (e: any) {
  console.warn('[LiteRtNodeBindings] Failed to load compiled native binary:', e.message);
}

class LiteRtNodeBindingsImpl implements LiteRtNodeBindings {
  public status(): BindingStatus {
    const manifestPath = path.resolve(__dirname, '../native/dependency-manifest.json');
    const win32Dir = path.resolve(__dirname, '../native/win32-x64/bin');

    let requiredPresent = true;
    let optionalPresent = true;
    const dependenciesList: { filename: string; present: boolean; required: boolean }[] = [];

    try {
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        if (Array.isArray(manifest.required)) {
          for (const req of manifest.required) {
            const dllPath = path.resolve(win32Dir, req);
            const present = fs.existsSync(dllPath);
            dependenciesList.push({ filename: req, present, required: true });
            if (!present) requiredPresent = false;
          }
        }

        if (Array.isArray(manifest.optional)) {
          for (const opt of manifest.optional) {
            const dllPath = path.resolve(win32Dir, opt);
            const present = fs.existsSync(dllPath);
            dependenciesList.push({ filename: opt, present, required: false });
            if (!present) optionalPresent = false;
          }
        }
      }
    } catch (e) {
      // Graceful fallback if manifest parsing fails
    }

    if (!nativeAddon) {
      if (!requiredPresent) {
        return {
          ok: false,
          state: 'runtime_dependency_missing',
          message: 'Required LiteRT-LM dynamic libraries (libLiteRt.dll) are missing.',
          native_deps_dir: win32Dir,
          dependencies: dependenciesList,
        };
      }

      if (!optionalPresent) {
        return {
          ok: false,
          state: 'runtime_dependency_partial',
          message:
            'Optional LiteRT GPU acceleration libraries are missing. Baseline CPU inference remains supported.',
          native_deps_dir: win32Dir,
          dependencies: dependenciesList,
        };
      }

      return {
        ok: false,
        state: 'runtime_binding_incomplete',
        message:
          'LiteRT-LM native binding library is uncompiled. Setup requires Bazel/CMake build steps.',
        native_deps_dir: win32Dir,
        dependencies: dependenciesList,
      };
    }

    // If native module loaded, delegate status check to C++ module
    try {
      return nativeAddon.status();
    } catch (e: any) {
      return {
        ok: false,
        state: 'error',
        message: `Native C++ execution failed: ${e.message}`,
        native_deps_dir: win32Dir,
      };
    }
  }

  public async loadModel(modelPath: string): Promise<{ success: boolean; message: string }> {
    const state = this.status();
    if (!state.ok && state.state !== 'runtime_dependency_partial') {
      return { success: false, message: state.message };
    }

    if (!nativeAddon) {
      return { success: false, message: 'Native addon is not compiled.' };
    }

    return nativeAddon.loadModel(modelPath);
  }

  public async generate(
    prompt: string,
    maxTokens: number = 1000
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    if (!nativeAddon) {
      return { success: false, error: 'Native addon is not compiled.' };
    }

    return nativeAddon.generate(prompt, maxTokens);
  }

  public async unloadModel(): Promise<void> {
    if (nativeAddon) {
      await nativeAddon.unloadModel();
    }
  }
}

export const litertBindings = new LiteRtNodeBindingsImpl();
