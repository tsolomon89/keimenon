import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import type { AuthServiceV2 } from '../services/auth.service';
import { featureManifestForAccountClass, planTierForAccountClass } from '@keimenon/types';

export function createMeRoutes(authService: AuthServiceV2): Router {
  const router = Router();

  router.get('/features', requireAuth(authService), (req: Request, res: Response) => {
    const accountClass = (req.user?.accountClass || 'free') as 'free' | 'professional' | 'business';
    const features = featureManifestForAccountClass(accountClass);

    return res.json({
      plan: planTierForAccountClass(accountClass),
      accountClass,
      features,
      generatedAt: Date.now(),
    });
  });

  return router;
}
