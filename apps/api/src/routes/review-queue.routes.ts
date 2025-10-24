/**
 * Review Queue API Routes
 *
 * Endpoints for managing clustering review queue:
 * - GET /api/review-queue - List pending reviews
 * - POST /api/review-queue/:id/decision - Make decision
 * - GET /api/review-queue/stats - Queue statistics
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/review-queue
 * List pending review items with filtering and pagination
 */
router.get('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { status = 'pending', modality, level, limit = '50', cursor } = req.query;

    const db = req.app.locals.db as Database.Database;

    // Build query
    let query = `
      SELECT
        queue_id,
        node_id,
        level,
        modality,
        candidates,
        top_score,
        score_epsilon,
        multi_candidate_structural_conflict,
        created_at,
        reviewed_at,
        final_decision,
        reviewer_id,
        review_notes
      FROM review_queue
      WHERE 1=1
    `;

    const params: any[] = [];

    // Filter by status
    if (status === 'pending') {
      query += ` AND reviewed_at IS NULL`;
    } else if (status === 'reviewed') {
      query += ` AND reviewed_at IS NOT NULL`;
    }

    // Filter by modality
    if (modality) {
      query += ` AND modality = ?`;
      params.push(modality);
    }

    // Filter by level
    if (level) {
      query += ` AND level = ?`;
      params.push(level);
    }

    // Cursor-based pagination
    if (cursor) {
      query += ` AND queue_id > ?`;
      params.push(cursor);
    }

    // Order by score (desc) then created_at (asc)
    query += ` ORDER BY top_score DESC, created_at ASC`;

    // Limit
    const limitNum = parseInt(limit as string, 10);
    query += ` LIMIT ?`;
    params.push(limitNum + 1); // +1 to check if there's a next page

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    // Check if there's a next page
    const hasMore = rows.length > limitNum;
    const items = hasMore ? rows.slice(0, limitNum) : rows;

    // Parse JSON fields
    const formattedItems = items.map((row) => ({
      queue_id: row.queue_id,
      node_id: row.node_id,
      level: row.level,
      modality: row.modality,
      candidates: JSON.parse(row.candidates),
      top_score: row.top_score,
      score_epsilon: row.score_epsilon,
      multi_candidate_structural_conflict: row.multi_candidate_structural_conflict === 1,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      final_decision: row.final_decision,
      reviewer_id: row.reviewer_id,
      review_notes: row.review_notes,
    }));

    return res.json({
      success: true,
      data: {
        items: formattedItems,
        next_cursor: hasMore ? items[items.length - 1].queue_id : null,
        has_more: hasMore,
      },
    });
  } catch (error: any) {
    console.error('Error fetching review queue:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch review queue',
    });
  }
});

/**
 * POST /api/review-queue/:id/decision
 * Make a decision on a review item
 */
router.post('/:id/decision', requireAuth, (req: Request, res: Response) => {
  try {
    const { id: queueId } = req.params;
    const { decision, note } = req.body;

    // Validate decision
    if (!['approve', 'reject', 'defer'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid decision. Must be: approve, reject, or defer',
      });
    }

    const db = req.app.locals.db as Database.Database;
    const userId = (req as any).user?.id || 'unknown';

    // Check if item exists and is pending
    const itemStmt = db.prepare(`
      SELECT * FROM review_queue WHERE queue_id = ?
    `);
    const item = itemStmt.get(queueId) as any;

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Review item not found',
      });
    }

    if (item.reviewed_at !== null) {
      return res.status(409).json({
        success: false,
        error: 'Review item already reviewed',
      });
    }

    // Apply decision
    if (decision === 'defer') {
      // Just log the defer, don't mark as reviewed
      return res.json({
        success: true,
        message: 'Review deferred',
      });
      return;
    }

    const now = Date.now();
    const candidates = JSON.parse(item.candidates);

    // Determine final_decision value
    let finalDecision: string;
    if (decision === 'approve') {
      // Attach to top candidate
      finalDecision = `attach:${candidates[0].cluster_id}`;
    } else {
      // Reject
      finalDecision = 'reject';
    }

    // Update review queue
    const updateStmt = db.prepare(`
      UPDATE review_queue
      SET reviewed_at = ?,
          final_decision = ?,
          reviewer_id = ?,
          review_notes = ?
      WHERE queue_id = ?
    `);

    updateStmt.run(now, finalDecision, userId, note || null, queueId);

    // Apply the decision to clustering
    if (decision === 'approve') {
      const clusterId = candidates[0].cluster_id;

      // Check if cluster exists
      const clusterStmt = db.prepare(`
        SELECT * FROM clusters WHERE cluster_id = ?
      `);
      const cluster = clusterStmt.get(clusterId) as any;

      if (!cluster) {
        // Create singleton cluster first
        const createClusterStmt = db.prepare(`
          INSERT INTO clusters (
            cluster_id, level, modality, representative_node,
            member_count, algorithm, threshold, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, 'manual_review', 0.0, ?, ?)
        `);
        createClusterStmt.run(clusterId, item.level, item.modality, item.node_id, now, now);
      }

      // Add node to cluster
      const memberStmt = db.prepare(`
        INSERT INTO cluster_memberships (
          cluster_id, node_id, level, modality, similarity_score, joined_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      memberStmt.run(clusterId, item.node_id, item.level, item.modality, item.top_score, now);

      // Update cluster member count
      const updateClusterStmt = db.prepare(`
        UPDATE clusters
        SET member_count = (
          SELECT COUNT(*) FROM cluster_memberships WHERE cluster_id = ?
        ),
        updated_at = ?
        WHERE cluster_id = ?
      `);
      updateClusterStmt.run(clusterId, now, clusterId);

      // Create NEAR_DUP edge
      const edgeStmt = db.prepare(`
        INSERT INTO edges (
          id, from_node, to_node, kind, weight, metadata, created_at
        ) VALUES (?, ?, ?, 'NEAR_DUP', ?, ?, ?)
      `);

      const edgeId = `edge_neardup_${item.node_id}_${cluster.representative_node}`;
      const metadata = {
        score: item.top_score,
        reason_code: 'MANUAL_REVIEW',
        level: item.level,
        modality: item.modality,
      };

      edgeStmt.run(
        edgeId,
        item.node_id,
        cluster.representative_node,
        item.top_score,
        JSON.stringify(metadata),
        Math.floor(now / 1000)
      );

      // Audit log
      const auditStmt = db.prepare(`
        INSERT INTO cluster_decisions (
          decision_id, node_id, cluster_id, candidate_clusters,
          final_score, threshold_attach, threshold_review, threshold_reject,
          decision, reason_code, policy_signature, timestamp
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'attach', 'MANUAL_REVIEW', 'manual', ?)
      `);

      auditStmt.run(
        `decision_${queueId}`,
        item.node_id,
        clusterId,
        item.candidates,
        item.top_score,
        now
      );
    } else {
      // Reject: Create singleton cluster
      const clusterId = `cluster_singleton_${item.node_id}`;

      const createClusterStmt = db.prepare(`
        INSERT INTO clusters (
          cluster_id, level, modality, representative_node,
          member_count, algorithm, threshold, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 'manual_reject', 0.0, ?, ?)
      `);
      createClusterStmt.run(clusterId, item.level, item.modality, item.node_id, now, now);

      const memberStmt = db.prepare(`
        INSERT INTO cluster_memberships (
          cluster_id, node_id, level, modality, similarity_score, joined_at
        ) VALUES (?, ?, ?, ?, 0, ?)
      `);
      memberStmt.run(clusterId, item.node_id, item.level, item.modality, now);

      // Audit log
      const auditStmt = db.prepare(`
        INSERT INTO cluster_decisions (
          decision_id, node_id, cluster_id, candidate_clusters,
          final_score, threshold_attach, threshold_review, threshold_reject,
          decision, reason_code, policy_signature, timestamp
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'reject', 'MANUAL_REJECT', 'manual', ?)
      `);

      auditStmt.run(
        `decision_${queueId}`,
        item.node_id,
        null,
        item.candidates,
        item.top_score,
        now
      );
    }

    return res.json({
      success: true,
      message: `Review ${decision}d successfully`,
      data: {
        queue_id: queueId,
        decision: finalDecision,
        reviewed_at: now,
        reviewer_id: userId,
      },
    });
  } catch (error: any) {
    console.error('Error processing review decision:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process review decision',
    });
  }
});

/**
 * GET /api/review-queue/stats
 * Get review queue statistics
 */
router.get('/stats', requireAuth, (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Database.Database;

    // Total counts by status
    const statusStmt = db.prepare(`
      SELECT
        CASE WHEN reviewed_at IS NULL THEN 'pending' ELSE 'reviewed' END as status,
        COUNT(*) as count
      FROM review_queue
      GROUP BY status
    `);
    const statusRows = statusStmt.all() as any[];

    const totals: Record<string, number> = {
      pending: 0,
      reviewed: 0,
    };
    statusRows.forEach((row) => {
      totals[row.status] = row.count;
    });

    // By modality (pending only)
    const modalityStmt = db.prepare(`
      SELECT modality, COUNT(*) as count, AVG(top_score) as avg_score
      FROM review_queue
      WHERE reviewed_at IS NULL
      GROUP BY modality
    `);
    const modalityRows = modalityStmt.all() as any[];

    const byModality: Record<string, { count: number; avg_score: number }> = {};
    modalityRows.forEach((row: any) => {
      byModality[row.modality] = {
        count: row.count,
        avg_score: row.avg_score,
      };
    });

    // By level (pending only)
    const levelStmt = db.prepare(`
      SELECT level, COUNT(*) as count, AVG(top_score) as avg_score
      FROM review_queue
      WHERE reviewed_at IS NULL
      GROUP BY level
    `);
    const levelRows = levelStmt.all() as any[];

    const byLevel: Record<string, { count: number; avg_score: number }> = {};
    levelRows.forEach((row: any) => {
      byLevel[row.level] = {
        count: row.count,
        avg_score: row.avg_score,
      };
    });

    // Decision breakdown (reviewed only)
    const decisionStmt = db.prepare(`
      SELECT
        CASE
          WHEN final_decision LIKE 'attach:%' THEN 'approved'
          WHEN final_decision = 'reject' THEN 'rejected'
          ELSE 'other'
        END as decision,
        COUNT(*) as count
      FROM review_queue
      WHERE reviewed_at IS NOT NULL
      GROUP BY decision
    `);
    const decisionRows = decisionStmt.all() as any[];

    const decisions: Record<string, number> = {
      approved: 0,
      rejected: 0,
    };
    decisionRows.forEach((row: any) => {
      if (row.decision === 'approved' || row.decision === 'rejected') {
        decisions[row.decision] = row.count;
      }
    });

    return res.json({
      success: true,
      data: {
        totals,
        by_modality: byModality,
        by_level: byLevel,
        decisions,
      },
    });
  } catch (error: any) {
    console.error('Error fetching review queue stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch review queue stats',
    });
  }
});

export default router;
