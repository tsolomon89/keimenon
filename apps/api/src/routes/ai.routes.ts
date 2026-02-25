import { Router } from 'express';
import { AiAnalysisService } from '../services/ai-analysis-service';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';

export function createAiRoutes(authService: AuthService) {
  const router = Router();
  const aiService = AiAnalysisService.getInstance();

  // Middleware
  router.use(requireAuth(authService));

  /**
   * POST /api/v1/ai/analyze-source
   * Analyze a specific source document
   */
  router.post('/analyze-source', async (req, res) => {
    try {
      const { sourceId, content } = req.body;

      if (!sourceId || !content) {
        return res.status(400).json({ error: 'Missing sourceId or content' });
      }

      const result = await aiService.analyzeSource(sourceId, content);
      return res.json(result);
    } catch (error: any) {
      console.error('AI Analysis failed:', error);
      return res.status(500).json({ error: error.message || 'Analysis failed' });
    }
  });

  return router;
}
