export type NativeBindingState =
  | 'runtime_dependency_missing'
  | 'runtime_dependency_partial'
  | 'runtime_dependency_found'
  | 'runtime_binding_incomplete'
  | 'ready';

export interface NativeDependency {
  filename: string;
  path?: string;
  present: boolean;
  required: boolean;
}

export interface NativeStatus {
  runtime: string;
  state: NativeBindingState;
  platform: string;
  arch: string;
  native_deps_dir?: string;
  dependencies: NativeDependency[];
  details?: string;
}

export interface LiteRTNodeBindings {
  status(nativeDepsDir?: string): NativeStatus;
  loadModel(modelPath: string, nativeDepsDir?: string): boolean;
  generate(prompt: string, maxTokens?: number, nativeDepsDir?: string): string;
}
