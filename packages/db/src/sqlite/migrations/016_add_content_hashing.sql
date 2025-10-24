-- Migration 016: Add Content-Addressable Storage Support
-- Date: 2025-10-23
-- Purpose: Enable content-based deduplication using cryptographic hashing
-- Related: docs/architecture/ARCHITECTURE_CONTRACT.md
--          docs/architecture/CANONICALIZATION.md

-- Add content_hash column to nodes table
-- This stores the SHA-256 hash of the canonical form of node content
ALTER TABLE nodes ADD COLUMN content_hash TEXT;

-- Add canonical_content column to nodes table
-- This stores the canonical (normalized) form of the content
-- Used for verification and deduplication
ALTER TABLE nodes ADD COLUMN canonical_content TEXT;

-- Create index on content_hash for O(1) duplicate detection
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);

-- Create composite index for account-scoped deduplication
-- Allows fast lookup of duplicates within a single account
CREATE INDEX IF NOT EXISTS idx_nodes_account_content_hash ON nodes(account_id, content_hash);

-- Create index for finding nodes by content hash across accounts
-- Useful for cross-account deduplication analysis (Business tier)
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash_kind ON nodes(content_hash, kind);

-- Add is_duplicate flag to nodes table
-- Marks nodes that are duplicates of earlier content
ALTER TABLE nodes ADD COLUMN is_duplicate INTEGER DEFAULT 0 CHECK(is_duplicate IN (0, 1));

-- Add original_node_id column to track canonical node for duplicates
-- If is_duplicate=1, this points to the original (earliest) node with same content
ALTER TABLE nodes ADD COLUMN original_node_id TEXT;

-- Create foreign key constraint for original_node_id
-- Note: SQLite doesn't support adding FK constraints after table creation
-- So we'll enforce this in application code

-- Create index for finding all duplicates of a canonical node
CREATE INDEX IF NOT EXISTS idx_nodes_original_node ON nodes(original_node_id) WHERE original_node_id IS NOT NULL;

-- Create statistics table for content addressing metrics
CREATE TABLE IF NOT EXISTS content_addressing_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  stat_date TEXT NOT NULL, -- ISO date (YYYY-MM-DD)
  total_nodes INTEGER NOT NULL DEFAULT 0,
  unique_content_hashes INTEGER NOT NULL DEFAULT 0,
  duplicate_nodes INTEGER NOT NULL DEFAULT 0,
  space_saved_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Create index for time-series queries on stats
CREATE INDEX IF NOT EXISTS idx_cas_stats_account_date ON content_addressing_stats(account_id, stat_date);

-- Create deduplication_log table for audit trail
CREATE TABLE IF NOT EXISTS deduplication_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('detect', 'merge', 'backfill')),
  content_hash TEXT NOT NULL,
  canonical_node_id TEXT NOT NULL, -- The node kept as canonical
  duplicate_node_ids TEXT NOT NULL, -- JSON array of duplicate node IDs
  edges_merged INTEGER DEFAULT 0,   -- Number of edges redirected
  space_saved_bytes INTEGER DEFAULT 0,
  performed_by TEXT NOT NULL,       -- User ID who triggered operation
  performed_at INTEGER NOT NULL,
  metadata TEXT,                     -- JSON blob for additional info
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for deduplication audit queries
CREATE INDEX IF NOT EXISTS idx_dedup_log_account ON deduplication_log(account_id);
CREATE INDEX IF NOT EXISTS idx_dedup_log_hash ON deduplication_log(content_hash);
CREATE INDEX IF NOT EXISTS idx_dedup_log_performed_at ON deduplication_log(performed_at);

-- Update schema metadata
UPDATE schema_metadata SET value = '2.2' WHERE key = 'version';
UPDATE schema_metadata SET value = datetime('now') WHERE key = 'updated_at';
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_016_applied', datetime('now'));

-- Add documentation
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_016_description', 'Added content-addressable storage support with SHA-256 hashing and deduplication tracking');

-- Add content addressing feature flag
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('feature_content_addressing', 'enabled');

-- Add canonicalization version (for future migrations if algorithm changes)
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('canonicalization_version', '1.0.0');

-- Add hash algorithm metadata
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('content_hash_algorithm', 'sha256');
