/**
 * Spine Routes (Vision V2)
 *
 * API endpoints for UGC Spine operations:
 * - Extract lexemes and phrases from source documents
 * - Cluster phrases into topics
 * - Query spine nodes
 *
 * Related:
 * - apps/api/src/services/graph-spine-builder.ts
 * - packages/types/src/nodes.ts (LexemeNode, PhraseNode, TopicNode)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GraphSpineBuilder } from '../services/graph-spine-builder';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { LexemeNode, PhraseNode, TopicNode, SourceDoc } from '@keimenon/types';

export function createSpineRoutes(authService: AuthService) {
  const router = Router();
  const spineBuilder = GraphSpineBuilder.getInstance();

  // Middleware
  router.use(requireAuth(authService));

  /**
   * GET /api/v1/spine/health
   * Health check for spine service
   */
  router.get('/health', (_req: Request, res: Response) => {
    return res.json({
      status: 'ok',
      service: 'spine',
      version: '1.0.0',
    });
  });

  /**
   * POST /api/v1/spine/extract
   * Extract lexemes and phrases from a source document
   *
   * Body:
   * - sourceDocId: string - ID of the source document
   * - content: string - Text content to analyze
   *
   * Returns:
   * - lexemes: LexemeNode[]
   * - phrases: PhraseNode[]
   */
  router.post('/extract', async (req: Request, res: Response) => {
    try {
      const { sourceDocId, content } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!sourceDocId || !content) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'sourceDocId and content are required',
        });
      }

      // Create a minimal SourceDoc for the builder
      const sourceDoc: SourceDoc = {
        id: sourceDocId,
        kind: 'SourceDoc',
        title: 'Extraction Target',
        n_segments: 1,
        n_chars: content.length,
        created_ts_min: Date.now(),
        created_ts_max: Date.now(),
        provenance: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {},
      };

      // Extract spine
      const { lexemes, phrases } = spineBuilder.extractSpine(sourceDoc, content);

      // Add account context to nodes
      const enrichedLexemes = lexemes.map((l) => ({
        ...l,
        metadata: { ...l.metadata, account_id: accountId },
      }));
      const enrichedPhrases = phrases.map((p) => ({
        ...p,
        metadata: { ...p.metadata, account_id: accountId },
      }));

      return res.json({
        success: true,
        sourceDocId,
        lexemes: enrichedLexemes,
        phrases: enrichedPhrases,
        stats: {
          lexemeCount: enrichedLexemes.length,
          phraseCount: enrichedPhrases.length,
          contentLength: content.length,
        },
      });
    } catch (error: any) {
      console.error('[SpineRoutes] Extract failed:', error);
      return res.status(500).json({
        error: 'Spine extraction failed',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/v1/spine/cluster
   * Cluster phrases into topics
   *
   * Body:
   * - phrases: PhraseNode[] - Phrases to cluster
   *
   * Returns:
   * - topics: TopicNode[]
   */
  router.post('/cluster', async (req: Request, res: Response) => {
    try {
      const { phrases } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!phrases || !Array.isArray(phrases)) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'phrases array is required',
        });
      }

      // Cluster into topics
      const topics = spineBuilder.clusterTopics(phrases);

      // Add account context
      const enrichedTopics = topics.map((t) => ({
        ...t,
        metadata: { ...t.metadata, account_id: accountId },
      }));

      return res.json({
        success: true,
        topics: enrichedTopics,
        stats: {
          inputPhraseCount: phrases.length,
          topicCount: enrichedTopics.length,
        },
      });
    } catch (error: any) {
      console.error('[SpineRoutes] Cluster failed:', error);
      return res.status(500).json({
        error: 'Topic clustering failed',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/v1/spine/extract-and-cluster
   * Combined operation: extract spine then cluster into topics
   *
   * Body:
   * - sourceDocId: string
   * - content: string
   *
   * Returns:
   * - lexemes, phrases, topics
   */
  router.post('/extract-and-cluster', async (req: Request, res: Response) => {
    try {
      const { sourceDocId, content } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!sourceDocId || !content) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'sourceDocId and content are required',
        });
      }

      // Create minimal SourceDoc
      const sourceDoc: SourceDoc = {
        id: sourceDocId,
        kind: 'SourceDoc',
        title: 'Extraction Target',
        n_segments: 1,
        n_chars: content.length,
        created_ts_min: Date.now(),
        created_ts_max: Date.now(),
        provenance: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {},
      };

      // Step 1: Extract spine
      const { lexemes, phrases } = spineBuilder.extractSpine(sourceDoc, content);

      // Step 2: Cluster into topics
      const topics = spineBuilder.clusterTopics(phrases);

      // Add account context
      const enrichedLexemes = lexemes.map((l) => ({
        ...l,
        metadata: { ...l.metadata, account_id: accountId },
      }));
      const enrichedPhrases = phrases.map((p) => ({
        ...p,
        metadata: { ...p.metadata, account_id: accountId },
      }));
      const enrichedTopics = topics.map((t) => ({
        ...t,
        metadata: { ...t.metadata, account_id: accountId },
      }));

      return res.json({
        success: true,
        sourceDocId,
        lexemes: enrichedLexemes,
        phrases: enrichedPhrases,
        topics: enrichedTopics,
        stats: {
          lexemeCount: enrichedLexemes.length,
          phraseCount: enrichedPhrases.length,
          topicCount: enrichedTopics.length,
          contentLength: content.length,
        },
      });
    } catch (error: any) {
      console.error('[SpineRoutes] Extract-and-cluster failed:', error);
      return res.status(500).json({
        error: 'Combined spine operation failed',
        details: error.message,
      });
    }
  });

  return router;
}
