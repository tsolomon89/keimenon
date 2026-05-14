import { Router, Request, Response, NextFunction } from 'express';
import type { AuthServiceV2 } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { gemmaProvider } from '../services/agent/gemma-local-provider';
import { featureManifestForAccountClass, type AccountClass } from '@keimenon/types';

export function createRuntimeRoutes(authService?: AuthServiceV2): Router {
  const router = Router();

  if (authService) {
    router.use(requireAuth(authService));
  }

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
      res.json(status);
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
