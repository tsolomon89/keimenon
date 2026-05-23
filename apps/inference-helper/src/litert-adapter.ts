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

  async validateModelFile(path: string): Promise<ModelValidationResult> {
    // Model validation involves verifying standard Litert-LM extension
    if (!path.endsWith('.litertlm') && !path.endsWith('.task')) {
      return {
        valid: false,
        state: 'model_invalid',
        message: 'Unsupported model file format. Requires .litertlm or .task files.',
      };
    }

    return {
      valid: true,
      state: 'runtime_dependency_found',
      message: 'Model format validated.',
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

  async unloadModel(): Promise<void> {
    await litertBindings.unloadModel();
  }
}
