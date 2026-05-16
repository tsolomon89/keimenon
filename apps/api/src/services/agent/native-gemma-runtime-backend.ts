import { LocalInferenceStatus } from './local-inference-types';

export class NativeGemmaRuntimeBackend {
  public async checkStatus(): Promise<LocalInferenceStatus> {
    // This is a scaffold. The actual native integration is pending feasibility/implementation.
    return {
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'runtime_unimplemented',
      can_run_offline: true,
      requires_admin: false,
      model_id: null,
      message: 'Keimenon native local Gemma runtime is not yet implemented.',
      next_actions: [],
    };
  }
}

export const nativeGemmaBackend = new NativeGemmaRuntimeBackend();
