import { LocalInferenceStatus } from './local-inference-types';
import { nativeGemmaBackend } from './native-gemma-runtime-backend';
import { gemmaProvider } from './gemma-local-provider';

export class LocalInferenceManager {
  public async getCombinedStatus(): Promise<LocalInferenceStatus> {
    // 1. Check Native Runtime (Product Target)
    const nativeStatus = await nativeGemmaBackend.checkStatus();
    if (nativeStatus.state === 'ready') {
      return nativeStatus;
    }

    // 2. Check OpenAI-Compatible Fallback (Developer Trial)
    if (process.env.GEMMA_LOCAL_BASE_URL) {
      const fallbackStatus = await gemmaProvider.checkStatus();
      if (fallbackStatus.status === 'online') {
        return {
          model_family: 'gemma',
          preferred_backend: 'native-gemma',
          active_backend: 'openai-compatible',
          state: 'ready',
          can_run_offline: true,
          requires_admin: false,
          model_id: fallbackStatus.modelName,
          message: 'Using developer fallback OpenAI-compatible endpoint.',
          next_actions: [],
        };
      }
    }

    // Default to the native status (even if unimplemented/missing)
    // as it is the primary product target.
    return nativeStatus;
  }
}

export const localInferenceManager = new LocalInferenceManager();
