import {
  GenerateInput,
  GenerateResult,
  HelperStatusResult,
  LoadModelResult,
  ModelValidationResult,
  NativeGemmaRuntimeAdapter,
} from './adapter';

export class UnimplementedGemmaRuntimeAdapter implements NativeGemmaRuntimeAdapter {
  async status(): Promise<HelperStatusResult> {
    return {
      ok: true,
      runtime: 'native-gemma',
      state: 'runtime_unimplemented',
      message:
        'Helper process prototype shell is running, but real LiteRT inference is unimplemented.',
    };
  }

  async validateModelFile(path: string): Promise<ModelValidationResult> {
    return {
      valid: false,
      state: 'runtime_unimplemented',
      message: 'Validation is unimplemented in prototype shell.',
    };
  }

  async loadModel(path: string): Promise<LoadModelResult> {
    return {
      success: false,
      state: 'runtime_unimplemented',
      message: 'Not implemented in prototype shell',
    };
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    return {
      success: false,
      error: 'Native Gemma generation is not implemented yet.',
    };
  }

  async unloadModel(): Promise<void> {
    // No-op
  }
}
