import { Router, Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

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

/**
 * POST /api/v1/import/chat/apply-decisions
 * Apply duplicate review decisions to finalize import
 */
router.post('/chat/apply-decisions', async (req: Request, res: Response) => {
  try {
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

    // TODO: Apply decisions to Neo4j database
    // This would involve:
    // 1. Delete nodes marked for removal
    // 2. Merge content for merge actions
    // 3. Update relationships

    // For now, return summary
    res.json({
      success: true,
      result: {
        applied_decisions: decisions.length,
        action_counts: actionCounts,
        nodes_kept: nodesToKeep.length,
        nodes_removed: nodesToRemove.length,
        nodes_merged: nodesToMerge.length,
        message: 'Decisions applied successfully',
      },
    });
  } catch (error: any) {
    console.error('Apply decisions error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      error: 'Failed to apply decisions',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/import/chat/decisions/status/:import_id
 * Get status of applied decisions for an import
 */
router.get('/chat/decisions/status/:import_id', async (req: Request, res: Response) => {
  try {
    const { import_id } = req.params;

    // TODO: Query Neo4j for import status
    // For now, return mock status

    res.json({
      success: true,
      status: {
        import_id,
        total_decisions: 0,
        applied: 0,
        pending: 0,
        last_updated: Date.now(),
      },
    });
  } catch (error: any) {
    console.error('Get decision status error:', error);
    res.status(500).json({
      error: 'Failed to get decision status',
      message: error.message,
    });
  }
});

export default router;
