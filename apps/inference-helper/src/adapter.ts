export type HelperStatusState =
  | 'runtime_unimplemented'
  | 'runtime_dependency_missing'
  | 'runtime_binding_incomplete'
  | 'model_missing'
  | 'model_invalid'
  | 'model_load_failed'
  | 'model_loaded'
  | 'ready'
  | 'error';

export interface HelperStatusResult {
  ok: boolean;
  runtime: 'native-gemma';
  state: HelperStatusState;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface ModelValidationResult {
  valid: boolean;
  state: HelperStatusState;
  message: string;
}

export interface LoadModelResult {
  success: boolean;
  state: HelperStatusState;
  message: string;
}

export interface GenerateInput {
  prompt: string;
  max_tokens?: number;
}

export interface GenerateResult {
  success: boolean;
  text?: string;
  error?: string;
}

export interface NativeGemmaRuntimeAdapter {
  status(): Promise<HelperStatusResult>;
  validateModelFile(path: string): Promise<ModelValidationResult>;
  loadModel(path: string): Promise<LoadModelResult>;
  generate(input: GenerateInput): Promise<GenerateResult>;
  unloadModel(): Promise<void>;
}
