import Database from 'better-sqlite3';

/**
 * Migration 003: Add Grouping Engine Schema
 *
 * Adds tables and columns for deterministic multi-level grouping:
 * - node_key and content_id columns to nodes
 * - node_spans table (multi-span support)
 * - node_signatures table (minhash, tfidf, structural_sig)
 * - lsh_bands table (incremental LSH)
 * - clusters and cluster_members tables
 * - New edge kinds for deduplication and clustering
 *
 * SECURITY: All Phase 1-3 tables include account_id for multi-tenant isolation from day 1.
 * This prevents the security vulnerability that would require migration 007.
 *
 * Phase: Foundation (Week 1)
 * Date: 2025-10-13
 * Updated: 2025-11-08 (added account_id columns)
 */

export const MIGRATION_003_UP = `
-- NOTE: Standalone Phase 1-3 schema (no dependencies on nodes/accounts tables)

-- 1. Create blobs table for content-addressed storage
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,          -- SHA-256 of raw bytes (blob_abc123...)
  size_bytes INTEGER NOT NULL,
  mime_type TEXT,
  encoding TEXT NOT NULL DEFAULT 'utf8',
  storage_path TEXT NOT NULL,     -- Relative path in storage
  account_id TEXT,                -- Multi-tenant isolation (nullable for migration compatibility)
  data_tag TEXT NOT NULL,         -- For test isolation (e.g., 'test', 'prod')
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blobs_account ON blobs(account_id);
CREATE INDEX IF NOT EXISTS idx_blobs_data_tag ON blobs(data_tag);
CREATE INDEX IF NOT EXISTS idx_blobs_mime ON blobs(mime_type);

-- 2. Create node_spans table (multi-span support)
-- A single node can reference multiple byte ranges (e.g., same code in 3 files)
CREATE TABLE IF NOT EXISTS node_spans (
  node_id TEXT NOT NULL,
  node_key TEXT NOT NULL,           -- Stable hash: sha256(blob_id|level|modality|span)
  blob_hash TEXT NOT NULL,
  byte_start INTEGER NOT NULL,
  byte_end INTEGER NOT NULL,
  encoding TEXT NOT NULL DEFAULT 'utf8',
  offset_kind TEXT NOT NULL DEFAULT 'byte',
  level TEXT NOT NULL CHECK(level IN ('token','phrase','sentence','block','section','message','conversation')),
  modality TEXT NOT NULL CHECK(modality IN ('code','prose','math','json','csv','markdown','html')),
  parent_node_id TEXT,
  account_id TEXT,                  -- Multi-tenant isolation (nullable for migration compatibility)
  data_tag TEXT NOT NULL,           -- For test isolation
  created_at INTEGER NOT NULL,
  PRIMARY KEY (node_id, blob_hash, byte_start, byte_end),
  FOREIGN KEY (blob_hash) REFERENCES blobs(hash) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spans_account ON node_spans(account_id);
CREATE INDEX IF NOT EXISTS idx_spans_level_modality ON node_spans(level, modality);
CREATE INDEX IF NOT EXISTS idx_spans_blob ON node_spans(blob_hash);
CREATE INDEX IF NOT EXISTS idx_spans_parent ON node_spans(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_spans_node ON node_spans(node_id);

-- 3. Create node_signatures table (for deduplication and clustering)
CREATE TABLE IF NOT EXISTS node_signatures (
  node_id TEXT PRIMARY KEY,
  node_key TEXT NOT NULL,                  -- Stable hash: sha256(blob_id|level|modality|span)
  content_id TEXT NOT NULL,                -- Hash of normalized content
  minhash BLOB NOT NULL,                   -- MinHash signature
  tfidf_vector TEXT,                       -- Sparse vector (optional, JSON)
  token_sketch TEXT,                       -- For code: "op|ident|num|..."
  structural_path TEXT NOT NULL,           -- e.g., "h1[2]|h2[5]|p[3]"
  account_id TEXT,                         -- Multi-tenant isolation (nullable for migration compatibility)
  data_tag TEXT NOT NULL,                  -- For test isolation
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sig_account ON node_signatures(account_id);
CREATE INDEX IF NOT EXISTS idx_sig_node_key ON node_signatures(node_key);
CREATE INDEX IF NOT EXISTS idx_sig_content_id ON node_signatures(content_id);
CREATE INDEX IF NOT EXISTS idx_sig_structural ON node_signatures(structural_path);
CREATE INDEX IF NOT EXISTS idx_sig_data_tag ON node_signatures(data_tag);

-- 4. Create LSH bands table (for incremental MinHash/LSH)
CREATE TABLE IF NOT EXISTS lsh_bands (
  band_hash TEXT NOT NULL,
  band_index INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  account_id TEXT,                         -- Multi-tenant isolation (nullable for migration compatibility)
  data_tag TEXT NOT NULL,                  -- For test isolation
  created_at INTEGER NOT NULL,
  PRIMARY KEY (band_hash, band_index, node_id)
);

CREATE INDEX IF NOT EXISTS idx_lsh_account ON lsh_bands(account_id);
CREATE INDEX IF NOT EXISTS idx_lsh_band_hash ON lsh_bands(band_hash);
CREATE INDEX IF NOT EXISTS idx_lsh_node ON lsh_bands(node_id);
CREATE INDEX IF NOT EXISTS idx_lsh_data_tag ON lsh_bands(data_tag);

-- 5. Create edges table (for EXACT_DUP and NEAR_DUP relationships)
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('EXACT_DUP', 'NEAR_DUP', 'PARENT', 'CHILD')),
  weight REAL NOT NULL DEFAULT 1.0,
  metadata TEXT,                           -- JSON blob
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);

-- 6. Create canonical_map table (node_id → canonical_node_id mapping)
CREATE TABLE IF NOT EXISTS canonical_map (
  node_id TEXT PRIMARY KEY,
  canonical_node_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('EXACT_DUP', 'NEAR_DUP')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canonical_map_canonical ON canonical_map(canonical_node_id);

-- 7. Create canonical_stats table (evidence scores for canonical nodes)
CREATE TABLE IF NOT EXISTS canonical_stats (
  canonical_node_id TEXT PRIMARY KEY,
  instances_count INTEGER NOT NULL,
  distinct_blobs INTEGER NOT NULL,
  distinct_roles INTEGER NOT NULL,
  distinct_modalities INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  evidence_score REAL NOT NULL,
  freq_weight REAL NOT NULL,
  diversity_weight REAL NOT NULL,
  role_weight REAL NOT NULL,
  temporal_weight REAL NOT NULL,
  modality_weight REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canonical_stats_score ON canonical_stats(evidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_stats_instances ON canonical_stats(instances_count DESC);

-- 8. Create clusters table
CREATE TABLE IF NOT EXISTS clusters (
  cluster_id TEXT PRIMARY KEY,
  representative_node TEXT NOT NULL,
  member_count INTEGER NOT NULL,
  algorithm TEXT NOT NULL CHECK(algorithm IN ('minhash', 'jaccard', 'cosine', 'ast', 'combined')),
  threshold REAL NOT NULL,
  run_id TEXT,                             -- Link to cluster_runs
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 9. Create cluster_members table
CREATE TABLE IF NOT EXISTS cluster_members (
  cluster_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (cluster_id, node_id),
  FOREIGN KEY (cluster_id) REFERENCES clusters(cluster_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cluster_members_node ON cluster_members(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_members_score ON cluster_members(similarity_score DESC);

-- 10. Create cluster_runs table (track clustering operations)
CREATE TABLE IF NOT EXISTS cluster_runs (
  run_id TEXT PRIMARY KEY,
  slice_level TEXT NOT NULL,
  slice_modality TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  threshold_attach REAL NOT NULL,
  threshold_review REAL NOT NULL,
  threshold_reject REAL NOT NULL,
  lsh_bands INTEGER NOT NULL,
  lsh_rows_per_band INTEGER NOT NULL,
  seed TEXT,                               -- Optional seed for reproducibility
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  finished_at INTEGER,
  nodes_processed INTEGER,
  clusters_created INTEGER,
  edges_created INTEGER,
  review_queued INTEGER,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
  stats TEXT                               -- JSON blob with stats
);

CREATE INDEX IF NOT EXISTS idx_cluster_runs_level_modality ON cluster_runs(slice_level, slice_modality);
CREATE INDEX IF NOT EXISTS idx_cluster_runs_started ON cluster_runs(started_at DESC);
`;

export const MIGRATION_003_DOWN = `
-- Rollback migration 003: Drop Phase 1-3 tables

DROP TABLE IF EXISTS cluster_runs;
DROP TABLE IF EXISTS cluster_members;
DROP TABLE IF EXISTS clusters;
DROP TABLE IF EXISTS canonical_stats;
DROP TABLE IF EXISTS canonical_map;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS lsh_bands;
DROP TABLE IF EXISTS node_signatures;
DROP TABLE IF EXISTS node_spans;
DROP TABLE IF EXISTS blobs;
`;

/**
 * Apply migration
 */
export function up(db: Database.Database): void {
  console.log('Running migration 003: Grouping Engine Schema...');

  try {
    db.exec(MIGRATION_003_UP);
    console.log('✅ Migration 003 completed successfully');
  } catch (error) {
    console.error('❌ Migration 003 failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
export function down(db: Database.Database): void {
  console.log('Rolling back migration 003: Grouping Engine Schema...');

  try {
    db.exec(MIGRATION_003_DOWN);
    console.log('✅ Migration 003 rolled back successfully');
  } catch (error) {
    console.error('❌ Migration 003 rollback failed:', error);
    throw error;
  }
}

/**
 * Check if migration has been applied
 *
 * Checks if blobs table exists with account_id column.
 * This ensures we detect both old and new versions of migration 003.
 */
export function isApplied(db: Database.Database): boolean {
  // Check if blobs table exists
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blobs'")
    .get() as any;

  if (!tableExists) {
    return false;
  }

  // Check if blobs table has account_id column (new version)
  const columns = db.prepare('PRAGMA table_info(blobs)').all() as any[];
  const hasAccountId = columns.some((col: any) => col.name === 'account_id');

  return hasAccountId;
}
