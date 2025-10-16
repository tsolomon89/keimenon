/**
 * Migration 006: Policy Versions and Cluster Run Tracking
 *
 * Adds:
 * - policy_versions: Historical policy storage
 * - cluster_runs: Reproducibility tracking for clustering runs
 *
 * Purpose: Freeze invariants, enable reproducibility, explainable runs
 */

import Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  console.log('Running migration 006: Policy Versions and Cluster Run Tracking...');

  // 1. Policy Versions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_versions (
      id TEXT PRIMARY KEY,              -- SHA-256 signature of policy
      version TEXT NOT NULL,            -- Semantic version from policy.yaml
      yaml_content TEXT NOT NULL,       -- Full YAML snapshot
      created_at INTEGER NOT NULL,      -- Unix timestamp (ms)
      created_by TEXT,                  -- User/system that created this version
      notes TEXT                        -- Optional description of changes
    );

    CREATE INDEX IF NOT EXISTS idx_policy_versions_created_at
      ON policy_versions(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_policy_versions_version
      ON policy_versions(version);
  `);

  // 2. Cluster Runs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_runs (
      run_id TEXT PRIMARY KEY,          -- Unique run identifier
      slice_level TEXT NOT NULL,        -- sentence/block/section
      slice_modality TEXT NOT NULL,     -- prose/code/math/json/markdown
      policy_id TEXT NOT NULL,          -- FK -> policy_versions(id)
      threshold_attach REAL NOT NULL,   -- Gray-band threshold used
      threshold_review REAL NOT NULL,
      threshold_reject REAL NOT NULL,
      lsh_bands INTEGER NOT NULL,       -- LSH parameters
      lsh_rows_per_band INTEGER NOT NULL,
      seed TEXT,                        -- Determinism seed (if any)
      started_at INTEGER NOT NULL,      -- Unix timestamp (ms)
      finished_at INTEGER,              -- NULL if still running
      nodes_processed INTEGER,          -- Total nodes in slice
      clusters_created INTEGER,         -- Clusters created
      edges_created INTEGER,            -- NEAR_DUP edges created
      review_queued INTEGER,            -- Items sent to review queue
      error_message TEXT,               -- NULL if successful
      FOREIGN KEY (policy_id) REFERENCES policy_versions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_cluster_runs_policy_id
      ON cluster_runs(policy_id);

    CREATE INDEX IF NOT EXISTS idx_cluster_runs_slice
      ON cluster_runs(slice_level, slice_modality);

    CREATE INDEX IF NOT EXISTS idx_cluster_runs_started_at
      ON cluster_runs(started_at DESC);
  `);

  // 3. Add run_id to clusters table (optional, for linkage)
  db.exec(`
    ALTER TABLE clusters ADD COLUMN run_id TEXT;

    CREATE INDEX IF NOT EXISTS idx_clusters_run_id
      ON clusters(run_id);
  `);

  // 4. Add run_id to edges metadata (optional, for full traceability)
  // Note: edges.metadata is JSON, so we'll just document that run_id should be included

  // 5. Cluster Operations Table (for manual merge/split audit)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_operations (
      operation_id TEXT PRIMARY KEY,
      operation_type TEXT NOT NULL CHECK(operation_type IN ('merge', 'split')),
      performed_by TEXT NOT NULL,
      performed_at INTEGER NOT NULL,
      affected_clusters TEXT NOT NULL,  -- JSON array
      result_clusters TEXT NOT NULL,    -- JSON array
      notes TEXT,
      reversible INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_cluster_operations_performed_at
      ON cluster_operations(performed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_cluster_operations_type
      ON cluster_operations(operation_type);
  `);

  console.log('Migration 006 complete: Policy versions, run tracking, and manual ops enabled');
}

export function down(db: Database.Database): void {
  console.log('Rolling back migration 006...');

  db.exec(`
    DROP INDEX IF EXISTS idx_clusters_run_id;
    -- Cannot remove column in SQLite without recreating table
    -- ALTER TABLE clusters DROP COLUMN run_id;

    DROP INDEX IF EXISTS idx_cluster_runs_started_at;
    DROP INDEX IF EXISTS idx_cluster_runs_slice;
    DROP INDEX IF EXISTS idx_cluster_runs_policy_id;
    DROP TABLE IF EXISTS cluster_runs;

    DROP INDEX IF EXISTS idx_policy_versions_version;
    DROP INDEX IF EXISTS idx_policy_versions_created_at;
    DROP TABLE IF EXISTS policy_versions;
  `);

  console.log('Migration 006 rolled back');
}
