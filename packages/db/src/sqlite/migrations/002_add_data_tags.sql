-- Migration 002: Add data_tag column for test/real data separation
-- Date: 2025-10-15
-- Purpose: Enable selective cleanup of test data vs real data

-- Add data_tag column to nodes table (idempotent - check if exists)
-- Default to 'real' to preserve existing data
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- So we skip this if the column already exists (migration was run before)

-- Check will be done by MigrationRunner - if this fails due to duplicate column,
-- it means the migration was already applied manually

ALTER TABLE nodes ADD COLUMN data_tag TEXT DEFAULT 'real'
  CHECK(data_tag IN ('test', 'real', 'automated', 'manual'));

-- Add data_tag column to edges table
ALTER TABLE edges ADD COLUMN data_tag TEXT DEFAULT 'real'
  CHECK(data_tag IN ('test', 'real', 'automated', 'manual'));

-- Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
CREATE INDEX IF NOT EXISTS idx_edges_data_tag ON edges(data_tag);

-- Create index for combined account + tag queries (common in cleanup)
CREATE INDEX IF NOT EXISTS idx_nodes_account_tag ON nodes(account_id, data_tag);
CREATE INDEX IF NOT EXISTS idx_edges_account_tag ON edges(account_id, data_tag);

-- Update schema metadata
UPDATE schema_metadata SET value = '2.1' WHERE key = 'version';
UPDATE schema_metadata SET value = datetime('now') WHERE key = 'updated_at';
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_002_applied', datetime('now'));

-- Add documentation
INSERT OR REPLACE INTO schema_metadata (key, value)
  VALUES ('migration_002_description', 'Added data_tag column for test/real data separation');
