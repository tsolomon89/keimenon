"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIGRATION_003_DOWN = exports.MIGRATION_003_UP = void 0;
exports.up = up;
exports.down = down;
exports.isApplied = isApplied;
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
 * Phase: Foundation (Week 1)
 * Date: 2025-10-13
 */
exports.MIGRATION_003_UP = `
-- 1. Add node_key and content_id to nodes table
ALTER TABLE nodes ADD COLUMN node_key TEXT;
ALTER TABLE nodes ADD COLUMN content_id TEXT;

CREATE INDEX IF NOT EXISTS idx_nodes_node_key ON nodes(node_key);
CREATE INDEX IF NOT EXISTS idx_nodes_content_id ON nodes(content_id);

-- 2. Create blobs table for content-addressed storage
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,          -- SHA-256 of raw bytes (blob_abc123...)
  size INTEGER NOT NULL,
  mime_type TEXT,
  encoding TEXT NOT NULL DEFAULT 'utf8',
  storage_path TEXT NOT NULL,     -- Relative path in storage
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blobs_account ON blobs(account_id);
CREATE INDEX IF NOT EXISTS idx_blobs_mime ON blobs(mime_type);

-- 3. Create node_spans table (multi-span support)
-- A single node can reference multiple byte ranges (e.g., same code in 3 files)
CREATE TABLE IF NOT EXISTS node_spans (
  node_id TEXT NOT NULL,
  blob_hash TEXT NOT NULL,
  byte_start INTEGER NOT NULL,
  byte_end INTEGER NOT NULL,
  encoding TEXT NOT NULL DEFAULT 'utf8',
  offset_kind TEXT NOT NULL DEFAULT 'byte',
  level TEXT NOT NULL CHECK(level IN ('token','phrase','sentence','block','section')),
  modality TEXT NOT NULL CHECK(modality IN ('code','prose','math','json','csv','markdown','html')),
  parent_node_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (node_id, blob_hash, byte_start, byte_end),
  FOREIGN KEY (blob_hash) REFERENCES blobs(hash) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_node_id) REFERENCES nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_spans_level_modality ON node_spans(level, modality);
CREATE INDEX IF NOT EXISTS idx_spans_blob ON node_spans(blob_hash);
CREATE INDEX IF NOT EXISTS idx_spans_parent ON node_spans(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_spans_node ON node_spans(node_id);

-- 4. Create node_signatures table (for deduplication and clustering)
CREATE TABLE IF NOT EXISTS node_signatures (
  node_id TEXT PRIMARY KEY,
  node_key TEXT NOT NULL UNIQUE,           -- Stable hash: sha256(blob_id|level|modality|span)
  content_id TEXT NOT NULL,                -- Hash of normalized content
  h_exact TEXT NOT NULL,                   -- Same as content_id for exact matching
  minhash_sig BLOB NOT NULL,               -- 128 uint32 values (512 bytes)
  tfidf_vector BLOB,                       -- Sparse vector (optional)
  structural_sig TEXT NOT NULL,            -- e.g., "h1[2]|h2[5]|p[3]"
  token_sketch TEXT,                       -- For code: "op|ident|num|..."
  modality TEXT NOT NULL,
  level TEXT NOT NULL,
  normalization_config TEXT,               -- JSON with config used
  created_at INTEGER NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sig_node_key ON node_signatures(node_key);
CREATE INDEX IF NOT EXISTS idx_sig_content_id ON node_signatures(content_id);
CREATE INDEX IF NOT EXISTS idx_sig_h_exact ON node_signatures(h_exact);
CREATE INDEX IF NOT EXISTS idx_sig_structural ON node_signatures(structural_sig);
CREATE INDEX IF NOT EXISTS idx_sig_modality_level ON node_signatures(modality, level);

-- 5. Create LSH bands table (for incremental MinHash/LSH)
CREATE TABLE IF NOT EXISTS lsh_bands (
  band_id INTEGER NOT NULL,
  modality TEXT NOT NULL,
  band_hash TEXT NOT NULL,
  node_ids TEXT NOT NULL,                  -- JSON array of node_ids
  created_at INTEGER NOT NULL,
  PRIMARY KEY (modality, band_id, band_hash)
);

CREATE INDEX IF NOT EXISTS idx_lsh_band_hash ON lsh_bands(band_hash);
CREATE INDEX IF NOT EXISTS idx_lsh_modality ON lsh_bands(modality);

-- 6. Create clusters table
CREATE TABLE IF NOT EXISTS clusters (
  cluster_id TEXT PRIMARY KEY,             -- Lexicographically smallest node_key
  canonical_node_id TEXT NOT NULL,
  modality TEXT NOT NULL,
  level TEXT NOT NULL,
  label TEXT NOT NULL,                     -- Human-readable label (top tf-idf phrases)
  threshold_used REAL NOT NULL,            -- e.g., 0.92 for code, 0.88 for prose
  member_count INTEGER NOT NULL DEFAULT 0,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (canonical_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clusters_modality ON clusters(modality, level);
CREATE INDEX IF NOT EXISTS idx_clusters_account ON clusters(account_id);
CREATE INDEX IF NOT EXISTS idx_clusters_canonical ON clusters(canonical_node_id);

-- 7. Create cluster_members table
CREATE TABLE IF NOT EXISTS cluster_members (
  cluster_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  score REAL NOT NULL,                     -- Similarity score to canonical
  PRIMARY KEY (cluster_id, node_id),
  FOREIGN KEY (cluster_id) REFERENCES clusters(cluster_id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cluster_members_node ON cluster_members(node_id);
CREATE INDEX IF NOT EXISTS idx_cluster_members_score ON cluster_members(score DESC);

-- 8. Update edges table to support new edge kinds
-- Note: SQLite doesn't support modifying CHECK constraints, so we'll update via trigger
-- New edge kinds: EXACT_DUP, NEAR_DUP, SPAN_CONTAINS, CLUSTER_MEMBER

-- Add CHECK constraint validation via trigger (workaround for SQLite limitation)
CREATE TRIGGER IF NOT EXISTS validate_edge_kind_grouping
BEFORE INSERT ON edges
FOR EACH ROW
WHEN NEW.kind IN ('EXACT_DUP', 'NEAR_DUP', 'SPAN_CONTAINS', 'CLUSTER_MEMBER')
BEGIN
  SELECT CASE
    WHEN NEW.kind NOT IN (
      'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
      'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
      'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
      'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
      'FOLDS_INTO_FOLDER', 'AFFINITY', 'DISCOURSE',
      'EXACT_DUP', 'NEAR_DUP', 'SPAN_CONTAINS', 'CLUSTER_MEMBER'
    )
    THEN RAISE(ABORT, 'Invalid edge kind')
  END;
END;

-- 9. Create metadata table for migration tracking
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

INSERT INTO migrations (version, name, applied_at)
VALUES ('003', 'grouping_engine_schema', ${Date.now()});

-- 10. Update schema metadata
UPDATE schema_metadata SET value = '3.0', key = 'version' WHERE key = 'version';
UPDATE schema_metadata SET value = datetime('now') WHERE key = 'updated_at';
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('migration_003_applied', datetime('now'));
`;
exports.MIGRATION_003_DOWN = `
-- Rollback migration 003

-- Drop triggers
DROP TRIGGER IF EXISTS validate_edge_kind_grouping;

-- Drop tables in reverse order
DROP TABLE IF EXISTS cluster_members;
DROP TABLE IF EXISTS clusters;
DROP TABLE IF EXISTS lsh_bands;
DROP TABLE IF EXISTS node_signatures;
DROP TABLE IF EXISTS node_spans;
DROP TABLE IF EXISTS blobs;

-- Drop indexes (they'll be dropped with tables, but explicit for clarity)
DROP INDEX IF EXISTS idx_nodes_node_key;
DROP INDEX IF EXISTS idx_nodes_content_id;

-- Remove columns from nodes table
-- Note: SQLite doesn't support DROP COLUMN before version 3.35.0
-- For older versions, you'd need to recreate the table
-- This is a simplified version that assumes SQLite 3.35.0+

-- ALTER TABLE nodes DROP COLUMN node_key;
-- ALTER TABLE nodes DROP COLUMN content_id;

-- For older SQLite, uncomment and use this approach:
-- CREATE TABLE nodes_backup AS SELECT id, kind, properties, account_id, created_by, created_at, updated_at FROM nodes;
-- DROP TABLE nodes;
-- CREATE TABLE nodes (...); -- Original schema without new columns
-- INSERT INTO nodes SELECT * FROM nodes_backup;
-- DROP TABLE nodes_backup;

-- Remove migration record
DELETE FROM migrations WHERE version = '003';

-- Revert schema version
UPDATE schema_metadata SET value = '2.0' WHERE key = 'version';
DELETE FROM schema_metadata WHERE key = 'migration_003_applied';
`;
/**
 * Apply migration
 */
async function up(db) {
    console.log('Running migration 003: Grouping Engine Schema...');
    try {
        db.exec(exports.MIGRATION_003_UP);
        console.log('✅ Migration 003 completed successfully');
    }
    catch (error) {
        console.error('❌ Migration 003 failed:', error);
        throw error;
    }
}
/**
 * Rollback migration
 */
async function down(db) {
    console.log('Rolling back migration 003: Grouping Engine Schema...');
    try {
        db.exec(exports.MIGRATION_003_DOWN);
        console.log('✅ Migration 003 rolled back successfully');
    }
    catch (error) {
        console.error('❌ Migration 003 rollback failed:', error);
        throw error;
    }
}
/**
 * Check if migration has been applied
 */
function isApplied(db) {
    const result = db
        .prepare("SELECT value FROM schema_metadata WHERE key = 'version'")
        .get();
    return result && parseFloat(result.value) >= 3.0;
}
//# sourceMappingURL=003_grouping_engine_schema.js.map