import * as fs from 'fs';
import {
  GenerateInput,
  GenerateResult,
  HelperStatusResult,
  LoadModelResult,
  ModelValidationResult,
  NativeGemmaRuntimeAdapter,
} from './adapter';
import { litertBindings } from '@keimenon/litert-node-bindings';

export class LiteRtGemmaRuntimeAdapter implements NativeGemmaRuntimeAdapter {
  async status(): Promise<HelperStatusResult> {
    const rawStatus = litertBindings.status();
    return {
      ok: rawStatus.ok,
      runtime: 'native-gemma',
      state: rawStatus.state as any,
      message: rawStatus.message,
      native_deps_dir: rawStatus.native_deps_dir,
      dependencies: rawStatus.dependencies,
    };
  }

  async validateModelFile(modelPath: string): Promise<ModelValidationResult> {
    if (!modelPath.endsWith('.litertlm') && !modelPath.endsWith('.task')) {
      return {
        valid: false,
        state: 'model_invalid',
        message: 'Unsupported model file format. Requires .litertlm or .task files.',
      };
    }

    if (!fs.existsSync(modelPath)) {
      return {
        valid: false,
        state: 'model_missing',
        message: `Model file does not exist at specified path: ${modelPath}`,
      };
    }

    try {
      const stats = fs.statSync(modelPath);
      if (stats.size === 0) {
        return {
          valid: false,
          state: 'model_invalid',
          message: `Model file is empty: ${modelPath}`,
        };
      }
    } catch (e: any) {
      return {
        valid: false,
        state: 'model_invalid',
        message: `Failed to inspect model file: ${e.message}`,
      };
    }

    return {
      valid: true,
      state: 'runtime_dependency_found',
      message: 'Model format and file presence validated.',
    };
  }

  async loadModel(path: string): Promise<LoadModelResult> {
    const status = await this.status();
    if (!status.ok && status.state !== 'runtime_dependency_partial') {
      return {
        success: false,
        state: status.state,
        message: `Prerequisites failed: ${status.message}`,
      };
    }

    try {
      const res = await litertBindings.loadModel(path);
      return {
        success: res.success,
        state: res.success ? 'model_loaded' : 'model_load_failed',
        message: res.message,
      };
    } catch (e: any) {
      return {
        success: false,
        state: 'model_load_failed',
        message: `Inference load error: ${e.message}`,
      };
    }
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    try {
      const res = await litertBindings.generate(input.prompt, input.max_tokens);
      return {
        success: res.success,
        text: res.text,
        error: res.error,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Inference generation error: ${e.message}`,
      };
    }
  }

  async cancel(): Promise<void> {
    if (typeof litertBindings.cancel === 'function') {
      await litertBindings.cancel();
    }
  }

  async unloadModel(): Promise<void> {
    await litertBindings.unloadModel();
  }
}
