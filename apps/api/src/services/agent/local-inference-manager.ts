import {
  LocalInferenceStatus,
  LocalModelAcquisitionState,
  LocalInferenceNextAction,
} from '@keimenon/types';
import { nativeGemmaBackend } from './native-gemma-runtime-backend';
import { gemmaProvider } from './gemma-local-provider';
import { modelManager } from './model-manager';

export class LocalInferenceManager {
  public async getCombinedStatus(): Promise<LocalInferenceStatus> {
    const modelStatus: LocalModelAcquisitionState = await modelManager.getModelStatus();
    const baseActions: LocalInferenceNextAction[] = [
      {
        id: 'open-model-folder',
        action_type: 'open_external',
        label: 'Open Models Folder',
        description: 'Open the directory where models are stored.',
        requires_user_confirmation: false,
      },
      {
        id: 'run-check',
        action_type: 'run_check',
        label: 'Refresh Status',
        description: 'Re-check model files and runtime readiness.',
        requires_user_confirmation: false,
      },
    ];

    if (modelStatus === 'source_pending') {
      return {
        model_family: 'gemma',
        preferred_backend: 'native-gemma',
        state: 'model_missing',
        can_run_offline: true,
        requires_admin: false,
        message: 'No official model source selected or verified.',
        next_actions: [...baseActions],
      };
    }

    if (modelStatus === 'terms_required') {
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
          ...baseActions,
        ],
      };
    }

    if (
      modelStatus === 'ready_to_download' ||
      modelStatus === 'downloading' ||
      modelStatus === 'failed'
    ) {
      return {
        model_family: 'gemma',
        preferred_backend: 'native-gemma',
        state: 'model_missing',
        can_run_offline: true,
        requires_admin: false,
        message:
          modelStatus === 'downloading'
            ? 'Model is currently downloading...'
            : 'Gemma model weights need to be downloaded.',
        next_actions: [
          {
            id: 'download-model',
            action_type: 'download',
            label: 'Download Model',
            description: 'Download the official Gemma model weights.',
            requires_user_confirmation: true,
            disabled: true,
            disabled_reason:
              'Manual model acquisition bridge: Automated download is blocked pending exact official file verification and terms bypass.',
          },
          ...baseActions,
        ],
      };
    }

    if (modelStatus === 'downloaded' || modelStatus === 'verified') {
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
            next_actions: baseActions,
          };
        }
      }

      // Merge actions into nativeStatus
      return {
        ...nativeStatus,
        next_actions: [...(nativeStatus.next_actions || []), ...baseActions],
      };
    }

    // Default catch-all
    return {
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'error',
      can_run_offline: false,
      requires_admin: false,
      message: 'Unknown model acquisition state.',
      next_actions: baseActions,
    };
  }
}

export const localInferenceManager = new LocalInferenceManager();
