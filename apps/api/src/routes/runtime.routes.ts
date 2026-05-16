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

  const requireAgentRuntime = (req: Request, res: Response): boolean => {
    const accountClass = getAccountClass(req);
    const features = featureManifestForAccountClass(accountClass);
    if (!features.agent_runtime) {
      res
        .status(403)
        .json({ error: 'Agent runtime is not enabled for this account tier', state: 'error' });
      return false;
    }
    return true;
  };

  router.get('/local-inference/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireAgentRuntime(req, res)) return;
      const status = await localInferenceManager.getCombinedStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  router.get('/local-inference/models', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireAgentRuntime(req, res)) return;
      const { modelManager } = await import('../services/agent/model-manager');
      const models = await modelManager.getInstalledModels();
      res.json({ models });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/local-inference/models/directory',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const info = await modelManager.getModelDirectoryInfo();
        res.json(info);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/local-inference/models/sources',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const sources = await modelManager.getSourceCandidates();
        res.json({ sources });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/local-inference/models/license-acceptance',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const { model_family, model_id, candidate_id, accepted, terms_source } = req.body;

        if (!accepted) {
          res.status(400).json({ error: 'License must be accepted' });
          return;
        }

        if (model_family !== 'gemma') {
          res.status(400).json({ error: 'Only Gemma models are supported' });
          return;
        }

        await modelManager.recordLicenseAcceptance({
          model_family: 'gemma',
          model_id,
          candidate_id,
          terms_source,
        });

        const status = await localInferenceManager.getCombinedStatus();
        res.json({
          ...status,
          message:
            'This local acknowledgement does not replace any external account/terms flow required by the official model host.',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/local-inference/models/download-plan/:candidateId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const plan = await modelManager.getModelDownloadPlan(req.params.candidateId);
        res.json({ plan });
      } catch (error: any) {
        if (error.message === 'Candidate not found') {
          res.status(404).json({ error: 'Candidate not found' });
          return;
        }
        next(error);
      }
    }
  );

  router.post(
    '/local-inference/models/pending',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const { candidateId } = req.body;

        if (!candidateId) {
          res.status(400).json({ error: 'candidateId is required' });
          return;
        }

        const manifest = await modelManager.prepareModelDownload(candidateId);
        res.json({ manifest });
      } catch (error: any) {
        if (error.message === 'Candidate not found') {
          res.status(404).json({ error: 'Candidate not found' });
          return;
        }
        next(error);
      }
    }
  );

  router.post(
    '/local-inference/models/download-started',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const { candidateId } = req.body;

        if (!candidateId) {
          res.status(400).json({ error: 'candidateId is required' });
          return;
        }

        await modelManager.recordDownloadStarted(candidateId);
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/local-inference/models/download-failed',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const { candidateId, reason } = req.body;

        if (!candidateId) {
          res.status(400).json({ error: 'candidateId is required' });
          return;
        }

        await modelManager.recordDownloadFailed(candidateId, reason || 'Unknown error');
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/local-inference/models/download-complete',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const { candidateId, local_path, size_bytes } = req.body;

        if (!candidateId) {
          res.status(400).json({ error: 'candidateId is required' });
          return;
        }

        if (!local_path) {
          res.status(400).json({ error: 'local_path is required' });
          return;
        }

        await modelManager.recordDownloadComplete({
          candidate_id: candidateId,
          local_path,
          size_bytes,
        });
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/local-inference/models/active',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const model = await modelManager.getActiveGemmaManifest();
        if (!model) {
          res.status(404).json({ error: 'No active Gemma model manifest found' });
          return;
        }
        res.json({ active_model: model });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/local-inference/models/verify',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!requireAgentRuntime(req, res)) return;
        const { modelManager } = await import('../services/agent/model-manager');
        const { candidateId } = req.body;

        if (!candidateId) {
          res.status(400).json({ error: 'candidateId is required' });
          return;
        }

        const verification = await modelManager.verifyModelFile({ candidate_id: candidateId });
        res.json(verification);
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
            'Install or load the required Gemma model in your native runtime, then re-check status.',
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
          next_steps: ['Start your native runtime, then re-check status.'],
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
