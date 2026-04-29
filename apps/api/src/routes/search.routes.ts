/**
 * Search Routes
 *
 * API endpoints for BM25-ranked search over SourceSpan nodes.
 * - POST /api/v1/search/index/rebuild — rebuild inverted index
 * - GET  /api/v1/search/query — BM25-ranked search
 * - GET  /api/v1/search/explain-connection — source-to-source explainability
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { getDbClient } from '../utils/get-db-client';
import { InvertedIndexService } from '../services/inverted-index.service';
import { SemanticIndexingPipeline } from '../services/semantic-indexing-pipeline';

function resolveAccountId(req: Request): string | undefined {
  return req.user?.accountId || (req as any).operating?.accountId;
}

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  explain: z.coerce.boolean().default(false),
  minScore: z.coerce.number().min(0).max(100).default(0.01),
});

const ExplainConnectionSchema = z.object({
  sourceA: z.string().min(1),
  sourceB: z.string().min(1),
});

export function createSearchRoutes(authService: AuthService) {
  const router = Router();
  router.use(requireAuth(authService));

  /**
   * POST /api/v1/search/index/rebuild
   * Rebuild the inverted index for the authenticated account.
   * Also runs full semantic indexing pipeline (spine + index + authority).
   */
  router.post('/index/rebuild', async (req: Request, res: Response) => {
    try {
      const accountId = resolveAccountId(req);
      const userId = req.user?.userId;
      if (!accountId || !userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      if (!database) {
        return res.status(500).json({ success: false, error: 'SQLite database unavailable' });
      }

      const pipeline = new SemanticIndexingPipeline(database);
      const result = await pipeline.runForImport({
        accountId,
        userId,
        sourceIds: req.body?.sourceIds,
        importJobId: req.body?.importJobId,
      });

      return res.json({
        success: true,
        stats: result,
      });
    } catch (error: any) {
      console.error('[SearchRoutes] Index rebuild failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Index rebuild failed',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/v1/search/query
   * BM25-ranked search over SourceSpan nodes.
   *
   * Query params:
   * - q: search query string
   * - limit: max results (default 20)
   * - explain: include score components (default false)
   * - minScore: minimum score threshold (default 0.01)
   */
  router.get('/query', async (req: Request, res: Response) => {
    try {
      const query = SearchQuerySchema.parse(req.query);
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      if (!database) {
        return res.status(500).json({ success: false, error: 'SQLite database unavailable' });
      }

      const indexService = new InvertedIndexService(database);
      if (!indexService.hasIndexTables()) {
        return res.status(503).json({
          success: false,
          error: 'Search index not available. Run POST /api/v1/search/index/rebuild first.',
        });
      }

      const results = indexService.search(accountId, query.q, {
        limit: query.limit,
        explain: query.explain,
        minScore: query.minScore,
      });

      // If explain is false, strip scoreComponents from results
      const responseResults = query.explain
        ? results
        : results.map(({ scoreComponents, ...rest }) => rest);

      return res.json({
        success: true,
        query: query.q,
        resultCount: results.length,
        results: responseResults,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      console.error('[SearchRoutes] Search failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Search failed',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/v1/search/explain-connection
   * Explain why two sources are connected.
   *
   * Query params:
   * - sourceA: first source node ID
   * - sourceB: second source node ID
   */
  router.get('/explain-connection', async (req: Request, res: Response) => {
    try {
      const params = ExplainConnectionSchema.parse(req.query);
      const accountId = resolveAccountId(req);
      if (!accountId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const db = await getDbClient(req);
      const database = (db as any).getDatabase?.();
      if (!database) {
        return res.status(500).json({ success: false, error: 'SQLite database unavailable' });
      }

      const indexService = new InvertedIndexService(database);
      const explanation = indexService.explainConnection(accountId, params.sourceA, params.sourceB);

      return res.json({
        success: true,
        explanation,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
      }
      console.error('[SearchRoutes] Explain connection failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Explain connection failed',
        details: error.message,
      });
    }
  });

  return router;
}
