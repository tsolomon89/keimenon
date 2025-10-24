/**
 * Duplicates API Routes
 * Manages duplicate detection, review, and resolution
 *
 * Key Principles:
 * - Immutability: Never delete nodes, only create relationship edges
 * - Decision types map to edge types:
 *   - keep-primary: Creates REVIEWED_DUP edge (primary is preferred)
 *   - keep-duplicate: Creates REVIEWED_DUP edge (duplicate is preferred)
 *   - keep-both: Creates SIMILAR edge (both valid, marked as reviewed)
 *   - merge: Creates EXACT_DUP edge (canonical relationship)
 */

import { Router, Request, Response } from 'express';
import { DuplicateDetectionService } from '../services/duplicate-detection';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { randomUUID } from 'crypto';

/**
 * Factory function to create duplicates routes with database and auth
 */
export function createDuplicatesRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();
  const duplicateService = new DuplicateDetectionService();

  /**
   * POST /api/v1/duplicates/detect
   * Run duplicate detection on provided conversations
   */
  router.post('/detect', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { conversations, config } = req.body;

      if (!conversations || !Array.isArray(conversations)) {
        return res.status(400).json({ error: 'conversations array is required' });
      }

      const detectionConfig = config || {
        enabled: true,
        exactMatch: true,
        similarityThreshold: 0.85,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 3,
        lengthRatioTolerance: 0.2,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: true,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const duplicateGroups = await duplicateService.findDuplicates(conversations, detectionConfig);

      return res.json({
        success: true,
        totalGroups: duplicateGroups.length,
        totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.totalDuplicates, 0),
        groups: duplicateGroups,
      });
    } catch (error: any) {
      console.error('Duplicate detection error:', error);
      return res.status(500).json({
        error: 'Failed to detect duplicates',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/duplicates/groups/:groupId
   * Get duplicate candidates for a specific group
   */
  router.get('/groups/:groupId', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { groupId } = req.params;
      const accountId = (req as any).user?.accountId;

      if (!accountId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Query NEAR_DUP edges for this group
      const database = db.getDatabase();
      const edges = database
        .prepare(
          `
        SELECT
          e.id as edge_id,
          e.from_node,
          e.to_node,
          e.weight as similarity_score,
          e.metadata,
          e.created_at
        FROM edges e
        WHERE e.kind IN ('NEAR_DUP', 'SIMILAR')
          AND e.metadata LIKE '%' || ? || '%'
        ORDER BY e.weight DESC
        LIMIT 100
      `
        )
        .all(groupId) as any[];

      return res.json({
        success: true,
        groupId,
        candidates: edges.map((edge) => ({
          id: edge.edge_id,
          fromNode: edge.from_node,
          toNode: edge.to_node,
          similarity: edge.similarity_score,
          metadata: JSON.parse(edge.metadata || '{}'),
          createdAt: edge.created_at,
        })),
      });
    } catch (error: any) {
      console.error('Get duplicate group error:', error);
      return res.status(500).json({
        error: 'Failed to get duplicate group',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/v1/duplicates/resolve
   * Resolve a duplicate by applying a decision (keep-primary, keep-duplicate, merge, keep-both)
   *
   * Creates appropriate edges based on decision type:
   * - keep-primary: REVIEWED_DUP edge (duplicate → primary, weight 0.3)
   * - keep-duplicate: REVIEWED_DUP edge (primary → duplicate, weight 0.3)
   * - keep-both: SIMILAR edges (bidirectional, weight 0.7)
   * - merge: EXACT_DUP edge (duplicate → primary, weight 1.0)
   */
  router.post('/resolve', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { candidateId, decision, primaryNodeId, duplicateNodeId } = req.body;
      const accountId = (req as any).user?.accountId;
      const userId = (req as any).user?.userId;

      if (!accountId || !userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!candidateId || !decision) {
        return res.status(400).json({
          error: 'candidateId and decision are required',
        });
      }

      if (!primaryNodeId || !duplicateNodeId) {
        return res.status(400).json({
          error: 'primaryNodeId and duplicateNodeId are required',
        });
      }

      const validDecisions = ['keep-primary', 'keep-duplicate', 'keep-both', 'merge'];
      if (!validDecisions.includes(decision)) {
        return res.status(400).json({
          error: `Invalid decision. Must be one of: ${validDecisions.join(', ')}`,
        });
      }

      const database = db.getDatabase();
      const now = Date.now();
      let edgesCreated = 0;
      let edgeKind = '';
      let fromNode = '';
      let toNode = '';
      let weight = 0;

      // Determine edge configuration based on decision
      switch (decision) {
        case 'keep-primary':
          // Duplicate points to primary (primary is canonical)
          edgeKind = 'REVIEWED_DUP';
          fromNode = duplicateNodeId;
          toNode = primaryNodeId;
          weight = 0.3; // Low weight = user prefers primary
          break;

        case 'keep-duplicate':
          // Primary points to duplicate (duplicate is actually better)
          edgeKind = 'REVIEWED_DUP';
          fromNode = primaryNodeId;
          toNode = duplicateNodeId;
          weight = 0.3; // Low weight = user prefers duplicate
          break;

        case 'keep-both':
          // Create bidirectional SIMILAR edges (both are valid)
          edgeKind = 'SIMILAR';
          weight = 0.7; // Medium weight = similar but distinct
          // Will create two edges below
          break;

        case 'merge':
          // Treat as exact duplicate (canonical relationship)
          edgeKind = 'EXACT_DUP';
          fromNode = duplicateNodeId;
          toNode = primaryNodeId;
          weight = 1.0; // Max weight = exact match
          break;
      }

      // Create edge(s) in database
      const createEdge = (from: string, to: string) => {
        const edgeId = `edge_${edgeKind.toLowerCase()}_${from}_${to}_${now}`;
        const metadata = {
          candidate_id: candidateId,
          decision,
          reviewed_by: userId,
          reviewed_at: now,
          account_id: accountId,
        };

        database
          .prepare(
            `
          INSERT OR REPLACE INTO edges (
            id, from_node, to_node, kind, weight, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(edgeId, from, to, edgeKind, weight, JSON.stringify(metadata), now);

        edgesCreated++;
      };

      if (decision === 'keep-both') {
        // Bidirectional edges for keep-both
        createEdge(primaryNodeId, duplicateNodeId);
        createEdge(duplicateNodeId, primaryNodeId);
      } else {
        // Single directional edge
        createEdge(fromNode, toNode);
      }

      // Update canonical_map if this is a merge decision
      if (decision === 'merge') {
        database
          .prepare(
            `
          INSERT OR REPLACE INTO canonical_map (
            node_id, canonical_node_id, updated_at
          ) VALUES (?, ?, ?)
        `
          )
          .run(duplicateNodeId, primaryNodeId, now);
      }

      console.log(
        `[Duplicates] Resolved candidate ${candidateId} with decision '${decision}' - created ${edgesCreated} edge(s)`
      );

      return res.json({
        success: true,
        candidateId,
        decision,
        edgesCreated,
        edgeKind,
        message: `Duplicate resolved: ${decision}`,
      });
    } catch (error: any) {
      console.error('Resolve duplicate error:', error);
      return res.status(500).json({
        error: 'Failed to resolve duplicate',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/v1/duplicates/:id/ignore
   * Mark a duplicate as ignored (creates IGNORE edge instead of deleting)
   *
   * IMPORTANT: This follows immutability principle - nodes are never deleted.
   * Instead, we create an IGNORE edge to mark that the user wants to hide this relationship.
   */
  router.post('/:id/ignore', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { primaryNodeId, duplicateNodeId } = req.body;
      const accountId = (req as any).user?.accountId;
      const userId = (req as any).user?.userId;

      if (!accountId || !userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!primaryNodeId || !duplicateNodeId) {
        return res.status(400).json({
          error: 'primaryNodeId and duplicateNodeId are required',
        });
      }

      const database = db.getDatabase();
      const now = Date.now();
      const edgeId = `edge_ignore_${primaryNodeId}_${duplicateNodeId}_${now}`;

      const metadata = {
        candidate_id: id,
        ignored_by: userId,
        ignored_at: now,
        account_id: accountId,
      };

      // Create IGNORE edge (prevents this pair from showing up in duplicate detection)
      database
        .prepare(
          `
        INSERT OR REPLACE INTO edges (
          id, from_node, to_node, kind, weight, metadata, created_at
        ) VALUES (?, ?, ?, 'IGNORE', 0.0, ?, ?)
      `
        )
        .run(edgeId, primaryNodeId, duplicateNodeId, JSON.stringify(metadata), now);

      console.log(`[Duplicates] Ignored candidate ${id} - created IGNORE edge`);

      return res.json({
        success: true,
        candidateId: id,
        edgeId,
        message: 'Duplicate marked as ignored (nodes preserved)',
      });
    } catch (error: any) {
      console.error('Ignore duplicate error:', error);
      return res.status(500).json({
        error: 'Failed to ignore duplicate',
        message: error.message,
      });
    }
  });

  /**
   * DELETE /api/v1/duplicates/:id
   * @deprecated Use POST /api/v1/duplicates/:id/ignore instead
   *
   * This endpoint is kept for backward compatibility but redirects to ignore.
   * We never actually delete nodes - only mark relationships as ignored.
   */
  router.delete('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      return res.status(410).json({
        success: false,
        error: 'Deletion not supported - use POST /api/v1/duplicates/:id/ignore instead',
        message:
          'This system maintains immutability - nodes are never deleted, only relationships are marked as ignored.',
        recommendation: {
          method: 'POST',
          endpoint: `/api/v1/duplicates/${id}/ignore`,
          body: {
            primaryNodeId: 'node_id_1',
            duplicateNodeId: 'node_id_2',
          },
        },
      });
    } catch (error: any) {
      console.error('Delete duplicate error:', error);
      return res.status(500).json({
        error: 'Failed to process request',
        message: error.message,
      });
    }
  });

  return router;
}

export default createDuplicatesRoutes;
