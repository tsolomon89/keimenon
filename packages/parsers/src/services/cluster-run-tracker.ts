/**
 * Cluster Run Tracker
 *
 * Tracks clustering runs for reproducibility and audit.
 * Links runs to policy versions and records all parameters.
 */

import Database from 'better-sqlite3';
import { ClusteringPolicy, getThresholds } from '@canvas-memory/types';
import { v4 as uuidv4 } from 'uuid';

export interface ClusterRun {
  run_id: string;
  slice_level: string;
  slice_modality: string;
  policy_id: string;
  threshold_attach: number;
  threshold_review: number;
  threshold_reject: number;
  lsh_bands: number;
  lsh_rows_per_band: number;
  seed?: string;
  started_at: number;
  finished_at?: number;
  nodes_processed?: number;
  clusters_created?: number;
  edges_created?: number;
  review_queued?: number;
  error_message?: string;
}

export interface ClusterRunStats {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  avg_duration_ms: number;
  total_nodes_processed: number;
  total_clusters_created: number;
  total_edges_created: number;
}

export class ClusterRunTracker {
  constructor(private db: Database.Database) {}

  /**
   * Start a new cluster run
   */
  startRun(
    level: string,
    modality: string,
    policy: ClusteringPolicy,
    seed?: string
  ): string {
    const runId = `run_${uuidv4()}`;
    const now = Date.now();

    const thresholds = getThresholds(policy, modality as any, level as any);

    const stmt = this.db.prepare(`
      INSERT INTO cluster_runs (
        run_id, slice_level, slice_modality, policy_id,
        threshold_attach, threshold_review, threshold_reject,
        lsh_bands, lsh_rows_per_band, seed, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      runId,
      level,
      modality,
      policy.signature || 'unknown',
      thresholds.attach,
      thresholds.review_lower,
      thresholds.reject_below,
      policy.overlap.lsh_bands,
      policy.overlap.lsh_rows_per_band,
      seed || null,
      now
    );

    return runId;
  }

  /**
   * Finish a cluster run successfully
   */
  finishRun(
    runId: string,
    stats: {
      nodes_processed: number;
      clusters_created: number;
      edges_created: number;
      review_queued: number;
    }
  ): void {
    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE cluster_runs
      SET finished_at = ?,
          nodes_processed = ?,
          clusters_created = ?,
          edges_created = ?,
          review_queued = ?
      WHERE run_id = ?
    `);

    stmt.run(
      now,
      stats.nodes_processed,
      stats.clusters_created,
      stats.edges_created,
      stats.review_queued,
      runId
    );
  }

  /**
   * Mark a cluster run as failed
   */
  failRun(runId: string, errorMessage: string): void {
    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE cluster_runs
      SET finished_at = ?,
          error_message = ?
      WHERE run_id = ?
    `);

    stmt.run(now, errorMessage, runId);
  }

  /**
   * Get a cluster run by ID
   */
  getRun(runId: string): ClusterRun | null {
    const stmt = this.db.prepare('SELECT * FROM cluster_runs WHERE run_id = ?');
    const row = stmt.get(runId) as any;

    if (!row) {
      return null;
    }

    return {
      run_id: row.run_id,
      slice_level: row.slice_level,
      slice_modality: row.slice_modality,
      policy_id: row.policy_id,
      threshold_attach: row.threshold_attach,
      threshold_review: row.threshold_review,
      threshold_reject: row.threshold_reject,
      lsh_bands: row.lsh_bands,
      lsh_rows_per_band: row.lsh_rows_per_band,
      seed: row.seed,
      started_at: row.started_at,
      finished_at: row.finished_at,
      nodes_processed: row.nodes_processed,
      clusters_created: row.clusters_created,
      edges_created: row.edges_created,
      review_queued: row.review_queued,
      error_message: row.error_message,
    };
  }

  /**
   * List cluster runs with filtering
   */
  listRuns(options?: {
    level?: string;
    modality?: string;
    policyId?: string;
    limit?: number;
  }): ClusterRun[] {
    let query = 'SELECT * FROM cluster_runs WHERE 1=1';
    const params: any[] = [];

    if (options?.level) {
      query += ' AND slice_level = ?';
      params.push(options.level);
    }

    if (options?.modality) {
      query += ' AND slice_modality = ?';
      params.push(options.modality);
    }

    if (options?.policyId) {
      query += ' AND policy_id = ?';
      params.push(options.policyId);
    }

    query += ' ORDER BY started_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => ({
      run_id: row.run_id,
      slice_level: row.slice_level,
      slice_modality: row.slice_modality,
      policy_id: row.policy_id,
      threshold_attach: row.threshold_attach,
      threshold_review: row.threshold_review,
      threshold_reject: row.threshold_reject,
      lsh_bands: row.lsh_bands,
      lsh_rows_per_band: row.lsh_rows_per_band,
      seed: row.seed,
      started_at: row.started_at,
      finished_at: row.finished_at,
      nodes_processed: row.nodes_processed,
      clusters_created: row.clusters_created,
      edges_created: row.edges_created,
      review_queued: row.review_queued,
      error_message: row.error_message,
    }));
  }

  /**
   * Get statistics for all runs
   */
  getStats(options?: { level?: string; modality?: string; policyId?: string }): ClusterRunStats {
    let query = `
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN finished_at IS NOT NULL AND error_message IS NULL THEN 1 ELSE 0 END) as successful_runs,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) as failed_runs,
        AVG(CASE WHEN finished_at IS NOT NULL THEN finished_at - started_at ELSE NULL END) as avg_duration_ms,
        SUM(COALESCE(nodes_processed, 0)) as total_nodes_processed,
        SUM(COALESCE(clusters_created, 0)) as total_clusters_created,
        SUM(COALESCE(edges_created, 0)) as total_edges_created
      FROM cluster_runs
      WHERE 1=1
    `;

    const params: any[] = [];

    if (options?.level) {
      query += ' AND slice_level = ?';
      params.push(options.level);
    }

    if (options?.modality) {
      query += ' AND slice_modality = ?';
      params.push(options.modality);
    }

    if (options?.policyId) {
      query += ' AND policy_id = ?';
      params.push(options.policyId);
    }

    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as any;

    return {
      total_runs: row.total_runs || 0,
      successful_runs: row.successful_runs || 0,
      failed_runs: row.failed_runs || 0,
      avg_duration_ms: row.avg_duration_ms || 0,
      total_nodes_processed: row.total_nodes_processed || 0,
      total_clusters_created: row.total_clusters_created || 0,
      total_edges_created: row.total_edges_created || 0,
    };
  }

  /**
   * Link clusters to a run
   */
  linkClustersToRun(runId: string, clusterIds: string[]): void {
    const stmt = this.db.prepare('UPDATE clusters SET run_id = ? WHERE cluster_id = ?');

    for (const clusterId of clusterIds) {
      stmt.run(runId, clusterId);
    }
  }

  /**
   * Get clusters for a run
   */
  getClustersForRun(runId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM clusters WHERE run_id = ?');
    return stmt.all(runId) as any[];
  }

  /**
   * Check if a run is reproducible (has all required data)
   */
  isRunReproducible(runId: string): {
    reproducible: boolean;
    missing: string[];
  } {
    const run = this.getRun(runId);

    if (!run) {
      return { reproducible: false, missing: ['Run not found'] };
    }

    const missing: string[] = [];

    if (!run.policy_id) {
      missing.push('policy_id');
    }

    if (!run.seed) {
      missing.push('seed (optional but recommended)');
    }

    if (!run.finished_at) {
      missing.push('finished_at (run not completed)');
    }

    return {
      reproducible: missing.length === 0 || (missing.length === 1 && missing[0].includes('seed')),
      missing,
    };
  }

  /**
   * Clean old runs (keep last N per slice)
   */
  cleanOldRuns(keepLastPerSlice = 10): number {
    const slices = this.db
      .prepare('SELECT DISTINCT slice_level, slice_modality FROM cluster_runs')
      .all() as any[];

    let totalDeleted = 0;

    for (const slice of slices) {
      const stmt = this.db.prepare(`
        DELETE FROM cluster_runs
        WHERE slice_level = ? AND slice_modality = ?
        AND run_id NOT IN (
          SELECT run_id FROM cluster_runs
          WHERE slice_level = ? AND slice_modality = ?
          ORDER BY started_at DESC
          LIMIT ?
        )
      `);

      const result = stmt.run(
        slice.slice_level,
        slice.slice_modality,
        slice.slice_level,
        slice.slice_modality,
        keepLastPerSlice
      );

      totalDeleted += result.changes;
    }

    return totalDeleted;
  }
}

/**
 * Factory function
 */
export function createClusterRunTracker(db: Database.Database): ClusterRunTracker {
  return new ClusterRunTracker(db);
}
