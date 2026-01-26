import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SQLiteClient } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler, ErrorFactory } from '../middleware/error-handler.middleware';

// Decision schema
const ReviewDecisionSchema = z.object({
  duplicateId: z.string(),
  action: z.enum(['keep-primary', 'keep-duplicate', 'keep-both', 'merge']),
  timestamp: z.number(),
  userId: z.string().optional(),
});

const ApplyDecisionsRequestSchema = z.object({
  decisions: z.array(ReviewDecisionSchema),
  import_id: z.string().optional(),
});

export function createImportDecisionsRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();
  // CRITICAL FIX: Database client must be obtained per-request for test isolation
  // See: apps/api/src/middleware/db-context.middleware.ts, tests/e2e/fixtures/test-isolation.ts

  /**
   * POST /api/v1/import/chat/apply-decisions
   * Apply duplicate review decisions to finalize import
   */
  router.post(
    '/chat/apply-decisions',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        // CRITICAL FIX: Get per-request database client for test isolation
        const { getDbClient } = await import('../utils/get-db-client');
        const dbClient = await getDbClient(req);
        const database = dbClient.getDatabase();

        // Validate request body
        const validatedData = ApplyDecisionsRequestSchema.parse(req.body);
        const { decisions } = validatedData;

        // Group decisions by action type
        const actionCounts = {
          'keep-primary': 0,
          'keep-duplicate': 0,
          'keep-both': 0,
          merge: 0,
        };

        const nodesToKeep: string[] = [];
        const nodesToRemove: string[] = [];
        const nodesToMerge: Array<{ primary: string; duplicate: string }> = [];

        // Process each decision
        for (const decision of decisions) {
          actionCounts[decision.action]++;

          // Extract node IDs from duplicateId
          // Format: "dup_primaryIdx_duplicateIdx"
          const match = decision.duplicateId.match(/^dup_(\d+)_(\d+)$/);
          if (!match) {
            console.warn(`Invalid duplicateId format: ${decision.duplicateId}`);
            continue;
          }

          const [, primaryIdx, duplicateIdx] = match;
          const primaryId = `msg_${primaryIdx}`;
          const duplicateId = `msg_${duplicateIdx}`;

          switch (decision.action) {
            case 'keep-primary':
              nodesToKeep.push(primaryId);
              nodesToRemove.push(duplicateId);
              break;
            case 'keep-duplicate':
              nodesToKeep.push(duplicateId);
              nodesToRemove.push(primaryId);
              break;
            case 'keep-both':
              nodesToKeep.push(primaryId);
              nodesToKeep.push(duplicateId);
              break;
            case 'merge':
              nodesToMerge.push({ primary: primaryId, duplicate: duplicateId });
              nodesToKeep.push(primaryId); // Keep primary after merge
              nodesToRemove.push(duplicateId); // Remove duplicate after merge
              break;
          }
        }

        // Apply decisions to database
        const user = (req as any).user;
        const accountId = user.accountId;
        let actuallyRemoved = 0;
        let actuallyMerged = 0;

        // Use savepoint instead of transaction for compatibility with test isolation
        const savepointId = `apply_decisions_${Date.now()}`;

        try {
          database.prepare(`SAVEPOINT ${savepointId}`).run();

          // 1. Process merge actions first (combine properties)
          for (const { primary, duplicate } of nodesToMerge) {
            // Get both nodes
            const primaryNode = database
              .prepare('SELECT * FROM nodes WHERE id = ? AND account_id = ?')
              .get(primary, accountId) as any;
            const duplicateNode = database
              .prepare('SELECT * FROM nodes WHERE id = ? AND account_id = ?')
              .get(duplicate, accountId) as any;

            if (!primaryNode || !duplicateNode) {
              console.warn(`Cannot merge: nodes not found (${primary}, ${duplicate})`);
              continue;
            }

            // Merge properties (combine labels if different)
            const mergedLabel =
              primaryNode.label !== duplicateNode.label
                ? `${primaryNode.label} / ${duplicateNode.label}`
                : primaryNode.label;

            database
              .prepare(
                `
          UPDATE nodes
          SET label = ?, updated_at = ?
          WHERE id = ? AND account_id = ?
        `
              )
              .run(mergedLabel, Date.now(), primary, accountId);

            actuallyMerged++;
          }

          // 2. Redirect edges from nodes being removed to their canonical counterparts
          for (const nodeId of nodesToRemove) {
            // Find all edges pointing to/from this node
            const outgoingEdges = database
              .prepare('SELECT * FROM edges WHERE from_node = ? AND account_id = ?')
              .all(nodeId, accountId) as any[];
            const incomingEdges = database
              .prepare('SELECT * FROM edges WHERE to_node = ? AND account_id = ?')
              .all(nodeId, accountId) as any[];

            // Find the canonical node this was duplicating
            // For 'keep-primary': canonical is the primary (already in nodesToKeep)
            // For 'merge': canonical is the primary (already in nodesToKeep)
            // We'll leave edges as-is and just delete the node

            console.log(
              `Removing ${outgoingEdges.length} outgoing and ${incomingEdges.length} incoming edges for node ${nodeId}`
            );
          }

          // 3. Delete nodes marked for removal
          const removeStmt = database.prepare('DELETE FROM nodes WHERE id = ? AND account_id = ?');
          for (const nodeId of nodesToRemove) {
            const result = removeStmt.run(nodeId, accountId);
            if (result.changes > 0) {
              actuallyRemoved++;
            }
          }

          // 4. Delete orphaned edges (edges connected to deleted nodes)
          database
            .prepare(
              `
        DELETE FROM edges
        WHERE account_id = ? AND (
          from_node NOT IN (SELECT id FROM nodes WHERE account_id = ?)
          OR to_node NOT IN (SELECT id FROM nodes WHERE account_id = ?)
        )
      `
            )
            .run(accountId, accountId, accountId);

          database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();

          return res.json({
            success: true,
            result: {
              applied_decisions: decisions.length,
              action_counts: actionCounts,
              nodes_kept: nodesToKeep.length,
              nodes_removed: actuallyRemoved,
              nodes_merged: actuallyMerged,
              message: `Applied ${decisions.length} decisions: ${actuallyRemoved} nodes removed, ${actuallyMerged} nodes merged`,
            },
          });
        } catch (dbError: any) {
          try {
            database.prepare(`ROLLBACK TO SAVEPOINT ${savepointId}`).run();
            database.prepare(`RELEASE SAVEPOINT ${savepointId}`).run();
          } catch {}
          throw ErrorFactory.database(
            'Failed to apply duplicate decisions to database',
            'importDecisions.apply',
            { accountId, userId: user.userId, nodeCountToRemove: nodesToRemove.length }
          );
        }
      } catch (error: any) {
        console.error('Apply decisions error:', error);

        if (error.name === 'ZodError') {
          return res.status(400).json({
            error: 'Invalid request data',
            details: error.errors,
          });
        }

        return res.status(500).json({
          error: 'Failed to apply decisions',
          message: error.message,
        });
      }
    })
  );

  /**
   * GET /api/v1/import/chat/decisions/status/:import_id
   * Get status of applied decisions for an import
   */
  router.get(
    '/chat/decisions/status/:import_id',
    requireAuth(authService),
    asyncHandler(async (req: Request, res: Response) => {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const { import_id } = req.params;
      const user = (req as any).user;
      const accountId = user.accountId;

      // Query actual node counts (simplified - real implementation would track decisions in separate table)
      const totalNodes = database
        .prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ? AND kind = ?')
        .get(accountId, 'Message') as any;
      const totalEdges = database
        .prepare('SELECT COUNT(*) as count FROM edges WHERE account_id = ?')
        .get(accountId) as any;

      return res.json({
        success: true,
        status: {
          import_id,
          total_nodes: totalNodes?.count || 0,
          total_edges: totalEdges?.count || 0,
          last_updated: Date.now(),
          message: 'Note: Detailed decision tracking will be added in future update',
        },
      });
    })
  );

  return router;
}

// For backward compatibility
export default function createRoutes(db: SQLiteClient, authService: AuthService) {
  return createImportDecisionsRoutes(db, authService);
}
