-- Migration 017: Backfill Content Hashes for Existing Nodes
-- Date: 2025-10-23
-- Purpose: Calculate and populate content_hash for existing nodes
-- Note: This is a data migration (not schema) and may take time for large datasets
-- Related: Migration 016, docs/architecture/CANONICALIZATION.md

-- This migration is intentionally empty for the SQL file.
-- The actual backfill will be performed by application code using
-- the canonicalization and content-addressing utilities.

-- Rationale:
-- 1. Content hashing requires the canonicalization algorithm implemented in TypeScript
-- 2. Node-type-specific canonicalization rules must be applied
-- 3. Large datasets need batching and progress tracking
-- 4. Hash calculation is CPU-intensive and should be done with monitoring

-- The backfill process will:
-- 1. Read existing nodes in batches
-- 2. Apply canonicalization based on node kind
-- 3. Generate SHA-256 content hash
-- 4. Update nodes with content_hash and canonical_content
-- 5. Detect and mark duplicates
-- 6. Log deduplication results

-- Mark this migration as requiring application-level processing
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_017_requires_backfill', 'true');

INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_017_backfill_status', 'pending');

INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_017_description', 'Backfill content hashes for existing nodes (requires application processing)');

-- Record that this migration was applied (but backfill is pending)
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_017_applied', datetime('now'));

-- Create a progress tracking table for the backfill
CREATE TABLE IF NOT EXISTS migration_017_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number INTEGER NOT NULL,
  nodes_processed INTEGER NOT NULL,
  nodes_hashed INTEGER NOT NULL,
  duplicates_found INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
  error_message TEXT
);

-- Create index for progress queries
CREATE INDEX IF NOT EXISTS idx_migration_017_status ON migration_017_progress(status);
