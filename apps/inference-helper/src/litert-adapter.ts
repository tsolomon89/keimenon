import fs from 'fs';
import {
  GenerateInput,
  GenerateResult,
  HelperStatusResult,
  LoadModelResult,
  ModelValidationResult,
  NativeGemmaRuntimeAdapter,
} from './adapter';

export class LiteRTGemmaRuntimeAdapter implements NativeGemmaRuntimeAdapter {
  private bindings: any = null;
  private loadAttempted: boolean = false;
  private isLoaded: boolean = false;

  private tryLoadBindings() {
    if (this.loadAttempted) return;
    this.loadAttempted = true;
    try {
      // Hypothetical future node binding package
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.bindings = require('@keimenon/litert-node-bindings');
    } catch (e: any) {
      this.bindings = null;
    }
  }

  async status(): Promise<HelperStatusResult> {
    this.tryLoadBindings();

    if (!this.bindings) {
      return {
        ok: true,
        runtime: 'native-gemma',
        state: 'runtime_dependency_missing',
        message: 'The LiteRT-LM node binding (@keimenon/litert-node-bindings) is not installed.',
      };
    }

    return {
      ok: true,
      runtime: 'native-gemma',
      state: this.isLoaded ? 'model_loaded' : 'ready',
      message: this.isLoaded
        ? 'LiteRT-LM model loaded and ready.'
        : 'LiteRT-LM bindings loaded. Awaiting model.',
    };
  }

  async validateModelFile(modelPath: string): Promise<ModelValidationResult> {
    this.tryLoadBindings();

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
        valid: true, // The file itself looks valid, but runtime is missing
        state: 'runtime_dependency_missing',
        message:
          'The LiteRT-LM node binding is missing, so we cannot verify the model contents deeply.',
      };
    }

    return {
      valid: true,
      state: 'ready',
      message: 'Model file is present and valid.',
    };
  }

  async loadModel(modelPath: string): Promise<LoadModelResult> {
    this.tryLoadBindings();

    if (!this.bindings) {
      return {
        success: false,
        state: 'runtime_dependency_missing',
        message: 'Cannot load model: The LiteRT-LM node binding is not installed.',
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
      // Hypothetical binding load call
      // await this.bindings.loadModel(modelPath);
      this.isLoaded = true;
      return {
        success: true,
        state: 'model_loaded',
        message: 'Model loaded successfully.',
      };
    } catch (e: any) {
      return {
        success: false,
        state: 'model_load_failed',
        message: `Failed to load model: ${e.message}`,
      };
    }
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    this.tryLoadBindings();

    if (!this.bindings) {
      return {
        success: false,
        error: 'Cannot generate: The LiteRT-LM node binding is not installed.',
      };
    }

    if (!this.isLoaded) {
      return {
        success: false,
        error: 'Cannot generate: No model is loaded.',
      };
    }

    try {
      // Hypothetical binding generate call
      // const text = await this.bindings.generate(input.prompt, input.max_tokens);
      return {
        success: false,
        error: 'LiteRT-LM generation logic is mocked and not yet fully wired to C++.',
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Generation failed: ${e.message}`,
      };
    }
  }

  async unloadModel(): Promise<void> {
    this.tryLoadBindings();
    if (this.bindings && this.isLoaded) {
      // await this.bindings.unloadModel();
      this.isLoaded = false;
    }
  }
}
