/**
 * Cluster API Routes (Phase 4 Thin Slice)
 *
 * Endpoints:
 * - POST /api/cluster/run - Run clustering
 * - GET /api/cluster/:id - Get cluster details
 * - GET /api/cluster/:id/evidence - Get cluster evidence
 * - GET /api/edges/export - Export NEAR_DUP edges
 * - POST /api/cluster/:id/merge - Merge clusters
 * - POST /api/cluster/:id/split - Split cluster
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.middleware';
import {
  ClusteringEngine,
  GroupingStorage,
  ClusterEvidenceComputer,
  ClusterRunTracker,
  ClusterManualOps,
} from '@keimenon/parsers';
import { loadPolicyFromFile, savePolicyVersion } from '@keimenon/types';
import { PublishableExport } from '../services/publishable-export';
import * as path from 'path';

const router = Router();

/**
 * POST /api/cluster/run
 * Trigger clustering run for a slice
 */
router.post('/run', requireAuth, async (req: Request, res: Response) => {
  try {
    const { level, modality, threshold, bands, seed } = req.body;

    // Validate parameters
    if (!level || !['sentence', 'block', 'section'].includes(level)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid level. Must be: sentence, block, or section',
      });
    }

    if (!modality || !['prose', 'code', 'math', 'json', 'markdown'].includes(modality)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid modality. Must be: prose, code, math, json, or markdown',
      });
    }

    const dbClient = req.app.locals.db;
    const db = dbClient.getDatabase();

    // Load policy
    const policyPath = path.join(__dirname, '../../policy.yaml');
    const policy = loadPolicyFromFile(policyPath);

    // Save policy version if not exists
    const userId = (req as any).user?.id || 'system';
    savePolicyVersion(db, policy, require('fs').readFileSync(policyPath, 'utf8'), userId);

    // Create services - GroupingStorage expects dbPath string, but we'll use existing db
    const dbPath = process.env.DATABASE_PATH || './data/canvas.db';
    const storage = new GroupingStorage(dbPath);
    const engine = new ClusteringEngine(db, storage, policy);

    // Run clustering
    const result = await engine.cluster(level, modality, seed);

    return res.json({
      success: true,
      data: {
        run_id: result.run_id,
        level,
        modality,
        stats: {
          nodes_processed: result.nodes_processed,
          clusters_created: result.clusters_created,
          edges_created: result.edges_created,
          attached_count: result.attached_count,
          rejected_count: result.rejected_count,
          review_queue_size: result.review_queue_size,
        },
      },
    });
  } catch (error: any) {
    console.error('Error running clustering:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to run clustering',
    });
  }
});

/**
 * GET /api/cluster/:id
 * Get cluster details
 */
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const { id: clusterId } = req.params;

    const db = req.app.locals.db as Database.Database;

    // Get cluster
    const clusterStmt = db.prepare('SELECT * FROM clusters WHERE cluster_id = ?');
    const cluster = clusterStmt.get(clusterId) as any;

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found',
      });
    }

    // Get members
    const membersStmt = db.prepare(`
      SELECT
        cm.node_id,
        cm.similarity_score,
        cm.joined_at,
        ns.level,
        ns.modality,
        ns.byte_start,
        ns.byte_end,
        ns.blob_hash
      FROM cluster_memberships cm
      JOIN node_spans ns ON cm.node_id = ns.node_id
      WHERE cm.cluster_id = ?
    `);
    const members = membersStmt.all(clusterId);

    // Check if superseded
    let superseded = false;
    let superseded_by = null;

    if (cluster.metadata) {
      try {
        const metadata = JSON.parse(cluster.metadata);
        if (metadata.superseded_by) {
          superseded = true;
          superseded_by = metadata.superseded_by;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    return res.json({
      success: true,
      data: {
        cluster: {
          cluster_id: cluster.cluster_id,
          level: cluster.level,
          modality: cluster.modality,
          representative_node: cluster.representative_node,
          member_count: cluster.member_count,
          algorithm: cluster.algorithm,
          threshold: cluster.threshold,
          created_at: cluster.created_at,
          updated_at: cluster.updated_at,
          run_id: cluster.run_id,
          superseded,
          superseded_by,
        },
        members,
      },
    });
  } catch (error: any) {
    console.error('Error fetching cluster:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cluster',
    });
  }
});

/**
 * GET /api/cluster/:id/evidence
 * Get cluster evidence
 */
router.get('/:id/evidence', requireAuth, (req: Request, res: Response) => {
  try {
    const { id: clusterId } = req.params;

    const db = req.app.locals.db as Database.Database;

    // Load policy
    const policyPath = path.join(__dirname, '../../policy.yaml');
    const policy = loadPolicyFromFile(policyPath);

    // Get evidence
    const computer = new ClusterEvidenceComputer(db, policy);
    const evidence = computer.computeEvidence(clusterId);

    return res.json({
      success: true,
      data: evidence,
    });
  } catch (error: any) {
    console.error('Error fetching cluster evidence:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cluster evidence',
    });
  }
});

/**
 * POST /api/cluster/:id/merge
 * Merge clusters
 */
router.post('/:id/merge', requireAuth, (req: Request, res: Response) => {
  try {
    const { id: clusterId } = req.params;
    const { merge_with, notes } = req.body;

    if (!merge_with || !Array.isArray(merge_with)) {
      return res.status(400).json({
        success: false,
        error: 'merge_with must be an array of cluster IDs',
      });
    }

    const db = req.app.locals.db as Database.Database;
    const userId = (req as any).user?.id || 'unknown';

    const manualOps = new ClusterManualOps(db);
    const result = manualOps.mergeClusters([clusterId, ...merge_with], userId, notes);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error merging clusters:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to merge clusters',
    });
  }
});

/**
 * POST /api/cluster/:id/split
 * Split cluster
 */
router.post('/:id/split', requireAuth, (req: Request, res: Response) => {
  try {
    const { id: clusterId } = req.params;
    const { member_groups, notes } = req.body;

    if (!member_groups || !Array.isArray(member_groups)) {
      return res.status(400).json({
        success: false,
        error: 'member_groups must be an array of arrays of node IDs',
      });
    }

    const db = req.app.locals.db as Database.Database;
    const userId = (req as any).user?.id || 'unknown';

    const manualOps = new ClusterManualOps(db);
    const result = manualOps.splitCluster(clusterId, member_groups, userId, notes);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error splitting cluster:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to split cluster',
    });
  }
});

/**
 * GET /api/edges/export
 * Export NEAR_DUP edges
 */
router.get('/export', requireAuth, (req: Request, res: Response) => {
  try {
    const { kind = 'NEAR_DUP', min_score, since, format = 'json' } = req.query;

    const db = req.app.locals.db as Database.Database;

    // Build query
    let query = 'SELECT * FROM edges WHERE kind = ?';
    const params: any[] = [kind];

    if (min_score) {
      query += ' AND weight >= ?';
      params.push(parseFloat(min_score as string));
    }

    if (since) {
      query += ' AND created_at >= ?';
      params.push(parseInt(since as string, 10));
    }

    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const edges = stmt.all(...params) as any[];

    // Format edges
    const formattedEdges = edges.map((edge) => {
      const metadata = edge.metadata ? JSON.parse(edge.metadata) : {};
      return {
        from_node: edge.from_node,
        to_node: edge.to_node,
        score: edge.weight,
        level: metadata.level,
        modality: metadata.modality,
        reason_code: metadata.reason_code,
        created_at: edge.created_at,
      };
    });

    if (format === 'csv') {
      // CSV export
      const csv = [
        'from_node,to_node,score,level,modality,reason_code,created_at',
        ...formattedEdges.map((e) =>
          [e.from_node, e.to_node, e.score, e.level, e.modality, e.reason_code, e.created_at].join(
            ','
          )
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=edges.csv');
      return res.send(csv);
    } else {
      // JSON export
      return res.json({
        success: true,
        data: {
          edges: formattedEdges,
          total: formattedEdges.length,
        },
      });
    }
  } catch (error: any) {
    console.error('Error exporting edges:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to export edges',
    });
  }
});

/**
 * GET /api/cluster/runs
 * List cluster runs
 */
router.get('/runs', requireAuth, (req: Request, res: Response) => {
  try {
    const { level, modality, policy_id, limit = '50' } = req.query;

    const db = req.app.locals.db as Database.Database;

    const tracker = new ClusterRunTracker(db);
    const runs = tracker.listRuns({
      level: level as string | undefined,
      modality: modality as string | undefined,
      policyId: policy_id as string | undefined,
      limit: parseInt(limit as string, 10),
    });

    return res.json({
      success: true,
      data: runs,
    });
  } catch (error: any) {
    console.error('Error listing runs:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list runs',
    });
  }
});

/**
 * GET /api/cluster/stats
 * Get clustering statistics
 */
router.get('/stats', requireAuth, (req: Request, res: Response) => {
  try {
    const { level, modality, policy_id } = req.query;

    const db = req.app.locals.db as Database.Database;

    const tracker = new ClusterRunTracker(db);
    const stats = tracker.getStats({
      level: level as string | undefined,
      modality: modality as string | undefined,
      policyId: policy_id as string | undefined,
    });

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stats',
    });
  }
});

export default router;
