export interface LiteRTNodeBindings {
  status(): any;
  loadModel(modelPath: string): Promise<void>;
  generate(prompt: string, maxTokens?: number): Promise<string>;
  unloadModel?(): Promise<void>;
}

// Ensure the module fails fast and truthfully if required dynamically without a real implementation.
throw new Error('RUNTIME_DEPENDENCY_MISSING: Native bindings not compiled');
