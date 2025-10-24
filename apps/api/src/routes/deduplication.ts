/**
 * Deduplication API Routes
 *
 * Endpoints for content-addressable storage deduplication features:
 * - GET /stats - Get deduplication statistics for an account
 * - POST /merge - Merge duplicate nodes
 * - POST /analyze - Analyze potential duplicates
 * - GET /duplicates - List duplicate nodes
 *
 * Related:
 * - packages/db/src/sqlite/client.ts - Database methods
 * - packages/parsers/src/services/content-addressing.ts - CAS utilities
 * - apps/web/src/components/settings/DeduplicationCard.tsx - UI component
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';
import { SQLiteClient } from '@canvas-memory/db';

export function createDeduplicationRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();

  /**
   * GET /api/deduplication/stats
   *
   * Get deduplication statistics for an account
   *
   * Query params:
   * - accountId: string (required)
   *
   * Response:
   * {
   *   totalNodes: number,
   *   uniqueContent: number,
   *   duplicates: number,
   *   spaceSaved: number,
   *   efficiency: number // 0-100 percentage
   * }
   */
  router.get('/stats', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { accountId } = req.query;

      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid accountId parameter',
        });
      }

      // Verify user has access to this account
      const user = (req as any).user;
      if (user.accountId !== accountId && user.accountType !== 'admin') {
        return res.status(403).json({
          error: 'Access denied to this account',
        });
      }

      const stats = await db.getDeduplicationStats(accountId);

      if (!stats) {
        return res.status(404).json({
          error: 'No deduplication statistics found for this account',
        });
      }

      // Calculate efficiency percentage
      const efficiency =
        stats.total_nodes > 0 ? Math.round((stats.duplicate_count / stats.total_nodes) * 100) : 0;

      // Map database response (snake_case) to API response (camelCase)
      return res.json({
        totalNodes: stats.total_nodes,
        uniqueContent: stats.unique_content,
        duplicates: stats.duplicate_count,
        spaceSaved: stats.space_saved_bytes,
        efficiency,
      });
    } catch (error) {
      console.error('Error fetching deduplication stats:', error);
      return res.status(500).json({
        error: 'Failed to fetch deduplication statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/deduplication/merge
   *
   * Merge duplicate nodes with the same content hash
   *
   * Body:
   * {
   *   accountId: string,
   *   dryRun?: boolean // If true, return merge plan without executing
   * }
   *
   * Response:
   * {
   *   mergedCount: number,
   *   edgesRelinked: number,
   *   duplicatesRemoved: number,
   *   errors: string[]
   * }
   */
  router.post('/merge', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { accountId, dryRun = false } = req.body;

      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid accountId in request body',
        });
      }

      // Verify user has access to this account
      const user = (req as any).user;
      if (user.accountId !== accountId && user.accountType !== 'admin') {
        return res.status(403).json({
          error: 'Access denied to this account',
        });
      }

      // Find all content hashes with duplicates
      const duplicateHashes = await db.findAllDuplicateGroupsByAccount(accountId);

      if (duplicateHashes.length === 0) {
        return res.json({
          mergedCount: 0,
          edgesRelinked: 0,
          duplicatesRemoved: 0,
          errors: [],
          message: 'No duplicates found to merge',
        });
      }

      if (dryRun) {
        // Return merge plan without executing
        return res.json({
          dryRun: true,
          duplicateGroups: duplicateHashes.length,
          estimatedMerges: duplicateHashes.reduce((sum, group) => sum + group.count - 1, 0),
          message: 'Dry run - no changes made',
        });
      }

      let mergedCount = 0;
      let edgesRelinked = 0;
      let duplicatesRemoved = 0;
      const errors: string[] = [];

      // Merge each duplicate group
      for (const { contentHash, count } of duplicateHashes) {
        if (count <= 1) continue;

        try {
          const result = await db.mergeDuplicateNodes(contentHash, accountId);
          mergedCount++;
          edgesRelinked += result.edgesRelinked;
          duplicatesRemoved += result.duplicatesRemoved;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to merge content hash ${contentHash}: ${errorMsg}`);
          console.error(`Merge error for hash ${contentHash}:`, error);
        }
      }

      console.log(`Deduplication merge completed for account ${accountId}:`, {
        mergedCount,
        edgesRelinked,
        duplicatesRemoved,
        errors: errors.length,
      });

      return res.json({
        mergedCount,
        edgesRelinked,
        duplicatesRemoved,
        errors,
        success: errors.length === 0,
      });
    } catch (error) {
      console.error('Error merging duplicates:', error);
      return res.status(500).json({
        error: 'Failed to merge duplicates',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/deduplication/analyze
   *
   * Analyze nodes to identify potential duplicates
   * (Useful for testing or investigating specific nodes)
   *
   * Body:
   * {
   *   accountId: string,
   *   nodeIds?: string[] // Optional: analyze specific nodes
   * }
   *
   * Response:
   * {
   *   analyzed: number,
   *   duplicateGroups: Array<{
   *     contentHash: string,
   *     nodes: Array<{ id: string, kind: string, created: number }>,
   *     count: number
   *   }>
   * }
   */
  router.post('/analyze', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { accountId, nodeIds } = req.body;

      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid accountId in request body',
        });
      }

      // Verify user has access to this account
      const user = (req as any).user;
      if (user.accountId !== accountId && user.accountType !== 'admin') {
        return res.status(403).json({
          error: 'Access denied to this account',
        });
      }

      // If specific nodeIds provided, analyze those
      if (nodeIds && Array.isArray(nodeIds) && nodeIds.length > 0) {
        const duplicateGroups = [];

        for (const nodeId of nodeIds) {
          const node = await db.getNode(nodeId);
          if (!node) continue;

          // Type guard: check if node has account_id and content_hash
          const nodeData = node as any;
          if (nodeData.account_id !== accountId) continue;

          if (nodeData.content_hash) {
            const duplicates = await db.findNodeByContentHash(nodeData.content_hash, accountId);
            if (duplicates && (duplicates as any).length > 1) {
              duplicateGroups.push({
                contentHash: nodeData.content_hash,
                nodes: (duplicates as any).map((n: any) => ({
                  id: n.id,
                  kind: n.kind,
                  created: n.created,
                })),
                count: (duplicates as any).length,
              });
            }
          }
        }

        return res.json({
          analyzed: nodeIds.length,
          duplicateGroups,
        });
      }

      // Otherwise, find all duplicate groups in account
      const duplicateHashes = await db.findAllDuplicateGroupsByAccount(accountId);
      const duplicateGroups = [];

      for (const { contentHash, count } of duplicateHashes) {
        if (count <= 1) continue;

        const nodes = await db.findNodeByContentHash(contentHash, accountId);
        if (nodes && (nodes as any).length > 1) {
          duplicateGroups.push({
            contentHash,
            nodes: (nodes as any).map((n: any) => ({
              id: n.id,
              kind: n.kind,
              created: n.created,
            })),
            count: (nodes as any).length,
          });
        }
      }

      return res.json({
        analyzed: duplicateGroups.reduce((sum, g) => sum + g.count, 0),
        duplicateGroups,
      });
    } catch (error) {
      console.error('Error analyzing duplicates:', error);
      return res.status(500).json({
        error: 'Failed to analyze duplicates',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/deduplication/duplicates
   *
   * List duplicate nodes in an account
   *
   * Query params:
   * - accountId: string (required)
   * - limit?: number (default: 100, max: 1000)
   * - offset?: number (default: 0)
   *
   * Response:
   * {
   *   total: number,
   *   limit: number,
   *   offset: number,
   *   duplicates: Array<{
   *     id: string,
   *     kind: string,
   *     contentHash: string,
   *     isDuplicate: boolean,
   *     originalNodeId: string | null,
   *     created: number
   *   }>
   * }
   */
  router.get('/duplicates', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { accountId, limit = '100', offset = '0' } = req.query;

      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid accountId parameter',
        });
      }

      // Verify user has access to this account
      const user = (req as any).user;
      if (user.accountId !== accountId && user.accountType !== 'admin') {
        return res.status(403).json({
          error: 'Access denied to this account',
        });
      }

      const limitNum = Math.min(parseInt(limit as string, 10) || 100, 1000);
      const offsetNum = parseInt(offset as string, 10) || 0;

      // Query for duplicate nodes
      const query = `
      SELECT
        id,
        kind,
        content_hash,
        is_duplicate,
        original_node_id,
        created
      FROM nodes
      WHERE account_id = ? AND is_duplicate = 1
      ORDER BY created DESC
      LIMIT ? OFFSET ?
    `;

      const duplicatesResult = await db.execute(query, [accountId, limitNum, offsetNum]);
      const duplicates = duplicatesResult.records as any[];

      // Get total count
      const countQuery = `
      SELECT COUNT(*) as total
      FROM nodes
      WHERE account_id = ? AND is_duplicate = 1
    `;
      const countResult = await db.execute(countQuery, [accountId]);
      const { total } = countResult.records[0] as { total: number };

      return res.json({
        total,
        limit: limitNum,
        offset: offsetNum,
        duplicates: duplicates.map((d) => ({
          id: d.id,
          kind: d.kind,
          contentHash: d.content_hash,
          isDuplicate: d.is_duplicate === 1,
          originalNodeId: d.original_node_id,
          created: d.created,
        })),
      });
    } catch (error) {
      console.error('Error fetching duplicates list:', error);
      return res.status(500).json({
        error: 'Failed to fetch duplicates list',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
