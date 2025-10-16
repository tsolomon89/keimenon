/**
 * Duplicates API Routes
 * Manages duplicate detection, review, and resolution
 */

import { Router, Request, Response } from 'express';
import { DuplicateDetectionService } from '../services/duplicate-detection';

const router = Router();
const duplicateService = new DuplicateDetectionService();

/**
 * POST /api/v1/duplicates/detect
 * Run duplicate detection on provided conversations
 */
router.post('/detect', async (req: Request, res: Response) => {
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

    const duplicateGroups = await duplicateService.findDuplicates(
      conversations,
      detectionConfig
    );

    res.json({
      success: true,
      totalGroups: duplicateGroups.length,
      totalDuplicates: duplicateGroups.reduce((sum, g) => sum + g.totalDuplicates, 0),
      groups: duplicateGroups,
    });
  } catch (error: any) {
    console.error('Duplicate detection error:', error);
    res.status(500).json({
      error: 'Failed to detect duplicates',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/duplicates/groups/:groupId
 * Get duplicate candidates for a specific group
 */
router.get('/groups/:groupId', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;

    // In a real implementation, this would query a database
    // For now, return a mock response structure
    res.json({
      success: true,
      groupId,
      candidates: [],
      message: 'Database integration pending',
    });
  } catch (error: any) {
    console.error('Get duplicate group error:', error);
    res.status(500).json({
      error: 'Failed to get duplicate group',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/duplicates/resolve
 * Resolve a duplicate by applying a decision (keep-primary, keep-duplicate, merge, keep-both)
 */
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const { candidateId, decision } = req.body;

    if (!candidateId || !decision) {
      return res.status(400).json({
        error: 'candidateId and decision are required',
      });
    }

    const validDecisions = ['keep-primary', 'keep-duplicate', 'keep-both', 'merge'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        error: `Invalid decision. Must be one of: ${validDecisions.join(', ')}`,
      });
    }

    // In a real implementation, this would update the database
    res.json({
      success: true,
      candidateId,
      decision,
      message: 'Duplicate resolved (database integration pending)',
    });
  } catch (error: any) {
    console.error('Resolve duplicate error:', error);
    res.status(500).json({
      error: 'Failed to resolve duplicate',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/v1/duplicates/:id
 * Delete a duplicate message
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // In a real implementation, this would delete from database
    res.json({
      success: true,
      deletedId: id,
      message: 'Duplicate deleted (database integration pending)',
    });
  } catch (error: any) {
    console.error('Delete duplicate error:', error);
    res.status(500).json({
      error: 'Failed to delete duplicate',
      message: error.message,
    });
  }
});

export default router;
