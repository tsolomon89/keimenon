import { Router, Request, Response, NextFunction } from 'express';
import type { AuthServiceV2 } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { gemmaProvider } from '../services/agent/gemma-local-provider';
import { localInferenceManager } from '../services/agent/local-inference-manager';
import { featureManifestForAccountClass, type AccountClass } from '@keimenon/types';

export function createRuntimeRoutes(authService?: AuthServiceV2): Router {
  const router = Router();

  if (authService) {
    router.use(requireAuth(authService));
  }

  router.get('/local-inference/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountClass = getAccountClass(req);
      const features = featureManifestForAccountClass(accountClass);

      if (!features.agent_runtime) {
        res.status(403).json({
          error: 'Agent runtime is not enabled for this account tier',
          state: 'error',
        });
        return;
      }

      const status = await localInferenceManager.getCombinedStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  router.get('/local-inference/models', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { modelManager } = await import('../services/agent/model-manager');
      const models = await modelManager.getInstalledModels();
      res.json({ models });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/local-inference/models/license-acceptance',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { modelManager } = await import('../services/agent/model-manager');
        await modelManager.acceptLicense('gemma');
        const status = await localInferenceManager.getCombinedStatus();
        res.json(status);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get('/gemma/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate entitlement
      const accountClass = getAccountClass(req);
      const features = featureManifestForAccountClass(accountClass);

      if (!features.agent_runtime) {
        res.status(403).json({
          error: 'Agent runtime is not enabled for this account tier',
          configured: false,
          status: 'unavailable',
        });
        return;
      }

      const status = await gemmaProvider.checkStatus();

      const expected_runtime_endpoint =
        process.env.GEMMA_LOCAL_BASE_URL || 'http://localhost:1234/v1';
      let guidance: any = null;

      if (!status.configured || status.error_code === 'GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED') {
        guidance = {
          title: 'Gemma Not Configured',
          explanation: 'Keimenon needs a configured local runtime endpoint serving a Gemma model.',
          next_steps: ['Set GEMMA_LOCAL_BASE_URL and GEMMA_LOCAL_MODEL, then re-check status.'],
          expected_runtime_endpoint,
          model_requirement: 'gemma-family',
          exact_match_required: true,
        };
      } else if (status.error_code === 'GEMMA_MODEL_NOT_FOUND') {
        guidance = {
          title: 'Gemma Model Missing',
          explanation:
            'A local runtime endpoint was reachable, but it did not expose the configured Gemma-family model ID.',
          next_steps: [
            'Install or load the required Gemma model in your local runtime host, then re-check status.',
          ],
          expected_runtime_endpoint,
          model_requirement: 'gemma-family',
          exact_match_required: true,
        };
      } else if (
        status.status === 'offline' ||
        status.status === 'unavailable' ||
        status.error_code === 'GEMMA_LOCAL_RUNTIME_UNAVAILABLE' ||
        status.error_code === 'GEMMA_STATUS_CHECK_FAILED'
      ) {
        guidance = {
          title: 'Gemma Runtime Offline',
          explanation: 'Keimenon has a configured runtime endpoint, but it is not reachable.',
          next_steps: ['Start your local Gemma-serving runtime host, then re-check status.'],
          expected_runtime_endpoint,
          model_requirement: 'gemma-family',
          exact_match_required: true,
        };
      } else if (status.status === 'online') {
        guidance = {
          title: 'Gemma Online',
          explanation:
            'Keimenon found the configured Gemma model and can use it for local synthesis.',
          next_steps: [],
          expected_runtime_endpoint,
          model_requirement: 'gemma-family',
          exact_match_required: true,
        };
      }

      res.json({ ...status, guidance });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function getAccountClass(req: Request): AccountClass {
  const rawAccountClass = req.user?.accountClass;
  if (
    rawAccountClass === 'free' ||
    rawAccountClass === 'professional' ||
    rawAccountClass === 'business'
  ) {
    return rawAccountClass;
  }
  return 'free';
}
