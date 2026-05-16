import { LocalInferenceStatus } from '@keimenon/types';
import { nativeGemmaBackend } from './native-gemma-runtime-backend';
import { gemmaProvider } from './gemma-local-provider';

import { modelManager } from './model-manager';

export class LocalInferenceManager {
  public async getCombinedStatus(): Promise<LocalInferenceStatus> {
    // 1. Check Model Manager States
    const modelStatus = await modelManager.getModelStatus();

    if (modelStatus === 'model_missing') {
      return {
        model_family: 'gemma',
        preferred_backend: 'native-gemma',
        state: 'model_missing',
        can_run_offline: true,
        requires_admin: false,
        message: 'Gemma model weights are not installed.',
        next_actions: [
          {
            id: 'download-model',
            action_type: 'download',
            label: 'Download Model',
            description: 'Download the official Gemma LiteRT model weights.',
            requires_user_confirmation: true,
          },
          {
            id: 'open-model-folder',
            action_type: 'open_external',
            label: 'Open Models Folder',
            description: 'Open the directory where models are stored.',
            requires_user_confirmation: false,
          },
        ],
      };
    }

    if (modelStatus === 'license_required') {
      return {
        model_family: 'gemma',
        preferred_backend: 'native-gemma',
        state: 'license_required',
        can_run_offline: true,
        requires_admin: false,
        message: 'You must accept the Google Gemma Terms of Use.',
        next_actions: [
          {
            id: 'accept-terms',
            action_type: 'accept_terms',
            label: 'Accept Terms',
            description: 'Acknowledge the Gemma license to continue.',
            requires_user_confirmation: true,
          },
        ],
      };
    }

    // 2. Check Native Runtime (Product Target)
    const nativeStatus = await nativeGemmaBackend.checkStatus();
    if (nativeStatus.state === 'ready') {
      return nativeStatus;
    }

    // 3. Check OpenAI-Compatible Fallback (Developer Trial)
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
