import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { GathererAgent, AutogrouperAgent, VerifierAgent } from '@keimenon/agents';
import { GathererInputSchema, AutogrouperInputSchema, VerifierInputSchema } from '@keimenon/types';

export function createAgentsRoutes(authService: AuthService): Router {
  const router = Router();

  const gatherer = new GathererAgent();
  const autogrouper = new AutogrouperAgent();
  const verifier = new VerifierAgent();

  /**
   * POST /api/v1/agents/gatherer
   * Run the Gatherer agent
   */
  router.post('/gatherer', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const input = GathererInputSchema.parse(req.body);
      const output = await gatherer.run(input);
      return res.json({ success: true, data: output });
    } catch (error: any) {
      console.error('Gatherer agent error:', error);
      return res.status(500).json({ error: error.message || 'Gatherer agent failed' });
    }
  });

  /**
   * POST /api/v1/agents/autogrouper
   * Run the Autogrouper agent
   */
  router.post('/autogrouper', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const input = AutogrouperInputSchema.parse(req.body);
      const output = await autogrouper.run(input);
      return res.json({ success: true, data: output });
    } catch (error: any) {
      console.error('Autogrouper agent error:', error);
      return res.status(500).json({ error: error.message || 'Autogrouper agent failed' });
    }
  });

  /**
   * POST /api/v1/agents/verifier
   * Run the Verifier agent
   */
  router.post('/verifier', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const input = VerifierInputSchema.parse(req.body);
      const output = await verifier.run(input);
      return res.json({ success: true, data: output });
    } catch (error: any) {
      console.error('Verifier agent error:', error);
      return res.status(500).json({ error: error.message || 'Verifier agent failed' });
    }
  });

  return router;
}
