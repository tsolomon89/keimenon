import fs from 'fs';
import {
  GenerateInput,
  GenerateResult,
  HelperStatusResult,
  HelperStatusState,
  LoadModelResult,
  ModelValidationResult,
  NativeGemmaRuntimeAdapter,
} from './adapter';
import { tryLoadBindings } from './binding-loader';

export class LiteRTGemmaRuntimeAdapter implements NativeGemmaRuntimeAdapter {
  private bindings: any = null;
  private loadState: string = 'ready';
  private isLoaded: boolean = false;

  private dependencies: any = undefined;
  private nativeDepsDir: string | undefined = undefined;

  private ensureBindingsLoaded() {
    if (this.bindings) return;
    const result = tryLoadBindings('@keimenon/litert-node-bindings');
    this.bindings = result.bindings;
    this.loadState = result.state;
    this.dependencies = result.dependencies;
    this.nativeDepsDir = result.native_deps_dir;
  }

  async status(): Promise<HelperStatusResult> {
    this.ensureBindingsLoaded();

    if (!this.bindings) {
      return {
        ok: true,
        runtime: 'native-gemma',
        state: this.loadState as any,
        message: 'The LiteRT-LM node binding is not installed or incomplete.',
        native_deps_dir: this.nativeDepsDir,
        dependencies: this.dependencies,
      };
    }

    try {
      const nativeStatus =
        typeof this.bindings.status === 'function' ? await this.bindings.status() : null;

      if (!nativeStatus) {
        return {
          ok: true,
          runtime: 'native-gemma',
          state: 'runtime_binding_incomplete',
          message: 'The native binding status method is missing or failed.',
          native_deps_dir: this.nativeDepsDir,
          dependencies: this.dependencies,
        };
      }

      const {
        state: nativeState,
        native_deps_dir: nativeDepsDir,
        dependencies: nativeDeps,
        details,
        platform,
        arch,
      } = nativeStatus;

      let finalState: HelperStatusState = nativeState;
      if (nativeState === 'ready') {
        if (this.isLoaded) {
          finalState = 'model_loaded';
        } else {
          finalState = 'ready';
        }
      }

      return {
        ok: true,
        runtime: 'native-gemma',
        state: finalState,
        message:
          details ||
          (this.isLoaded
            ? 'LiteRT-LM model loaded and ready.'
            : 'LiteRT-LM bindings loaded. Awaiting model.'),
        native_deps_dir: nativeDepsDir || this.nativeDepsDir,
        dependencies: nativeDeps || this.dependencies,
        details,
        platform,
        arch,
      };
    } catch (e: any) {
      return {
        ok: false,
        runtime: 'native-gemma',
        state: 'error',
        message: `Failed to query native binding status: ${e.message}`,
        native_deps_dir: this.nativeDepsDir,
        dependencies: this.dependencies,
      };
    }
  }

  async validateModelFile(modelPath: string): Promise<ModelValidationResult> {
    this.ensureBindingsLoaded();

    if (!modelPath) {
      return { valid: false, state: 'model_invalid', message: 'No model path provided' };
    }

    if (!fs.existsSync(modelPath)) {
      return { valid: false, state: 'model_missing', message: 'Model file does not exist' };
    }

    if (!modelPath.endsWith('.litertlm')) {
      return {
        valid: false,
        state: 'model_invalid',
        message: 'Model file must be a .litertlm file',
      };
    }

    if (!this.bindings) {
      return {
        valid: false,
        state: this.loadState as any,
        message: 'The LiteRT-LM node binding is not installed or incomplete.',
      };
    }

    return {
      valid: true,
      state: 'ready',
      message: 'Model file is present and valid.',
    };
  }

  async loadModel(modelPath: string): Promise<LoadModelResult> {
    this.ensureBindingsLoaded();

    if (!this.bindings) {
      return {
        success: false,
        state: this.loadState as any,
        message: 'Cannot load model: The LiteRT-LM node binding is not installed or incomplete.',
      };
    }

    const validation = await this.validateModelFile(modelPath);
    if (!validation.valid) {
      return {
        success: false,
        state: validation.state,
        message: validation.message,
      };
    }

    try {
      if (typeof this.bindings.loadModel !== 'function') {
        return {
          success: false,
          state: 'runtime_binding_incomplete',
          message: 'The node binding exists but does not export a loadModel method.',
        };
      }

      await this.bindings.loadModel(modelPath);
      this.isLoaded = true;
      return {
        success: true,
        state: 'model_loaded',
        message: 'Model loaded successfully.',
      };
    } catch (e: any) {
      const msg = e.message || '';
      let state: HelperStatusState = 'model_load_failed';
      if (msg.includes('RUNTIME_DEPENDENCY_MISSING')) {
        state = 'runtime_dependency_missing';
      } else if (msg.includes('MODEL_INVALID')) {
        state = 'model_invalid';
      } else if (msg.includes('MODEL_MISSING')) {
        state = 'model_missing';
      } else if (msg.includes('MODEL_LOAD_FAILED')) {
        state = 'model_load_failed';
      }

      return {
        success: false,
        state,
        message: msg || `Failed to load model: ${e.message}`,
      };
    }
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    this.ensureBindingsLoaded();

    if (!this.bindings) {
      return {
        success: false,
        error: 'Cannot generate: The LiteRT-LM node binding is not installed or incomplete.',
      };
    }

    if (!this.isLoaded) {
      return {
        success: false,
        error: 'Cannot generate: No model is loaded.',
      };
    }

    try {
      if (typeof this.bindings.generate !== 'function') {
        return {
          success: false,
          error: 'The node binding exists but does not export a generate method.',
        };
      }

      const text = await this.bindings.generate(input.prompt, input.max_tokens);
      return {
        success: true,
        text,
      };
    } catch (e: any) {
      const msg = e.message || '';
      let error = `Generation failed: ${msg}`;
      if (msg.includes('MODEL_NOT_LOADED')) {
        error = 'Cannot generate: No model is loaded.';
      } else if (msg.includes('INFERENCE_FAILED')) {
        error = 'Inference failed: LiteRT-LM failed to generate content.';
      }
      return {
        success: false,
        error,
      };
    }
  }

  async unloadModel(): Promise<void> {
    this.ensureBindingsLoaded();
    if (this.bindings && this.isLoaded) {
      if (typeof this.bindings.unloadModel === 'function') {
        await this.bindings.unloadModel();
      }
      this.isLoaded = false;
    }
  }
}
