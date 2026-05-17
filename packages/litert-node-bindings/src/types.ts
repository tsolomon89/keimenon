export type NativeBindingState =
  | 'runtime_dependency_missing'
  | 'runtime_dependency_partial'
  | 'runtime_dependency_found'
  | 'runtime_binding_incomplete'
  | 'ready';

export interface NativeDependency {
  filename: string;
  present: boolean;
  required: boolean;
}

export interface NativeStatus {
  runtime: string;
  state: NativeBindingState;
  platform: string;
  arch: string;
  dependencies: NativeDependency[];
  details?: string;
}

export interface LiteRTNodeBindings {
  status(): NativeStatus;
  loadModel(modelPath: string): boolean;
  generate(prompt: string): string;
}
