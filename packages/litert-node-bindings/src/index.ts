import bindings from 'bindings';

export interface NativeStatus {
  runtime: string;
  platform: string;
  arch: string;
  state:
    | 'runtime_dependency_missing'
    | 'runtime_binding_incomplete'
    | 'runtime_dependency_found'
    | 'ready';
  details: string;
}

export interface LiteRTNodeBindings {
  status(): NativeStatus;
  loadModel(modelPath: string): Promise<void> | void;
  generate(prompt: string, maxTokens?: number): Promise<string> | string;
  unloadModel?(): Promise<void> | void;
}

export function getLiteRTBindings(): LiteRTNodeBindings {
  let nativeBinding;
  try {
    nativeBinding = bindings('litert-node-bindings.node');
  } catch (err: any) {
    throw new Error(
      'RUNTIME_DEPENDENCY_MISSING: Native bindings not compiled or failed to load. ' + err.message
    );
  }

  if (
    !nativeBinding ||
    typeof nativeBinding.loadModel !== 'function' ||
    typeof nativeBinding.generate !== 'function'
  ) {
    throw new Error(
      'RUNTIME_BINDING_INCOMPLETE: Native bindings loaded but missing required methods.'
    );
  }

  return nativeBinding as LiteRTNodeBindings;
}
