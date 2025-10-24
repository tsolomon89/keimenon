-- Migration 014: Add AccountNode support to graph schema
-- Purpose: Enable AccountNode as a graph node type for visualization
-- Note: SQLite doesn't support altering CHECK constraints, so we recreate the nodes table

-- ============================================================================
-- PART 1: Backup existing nodes and edges
-- ============================================================================

-- Create temporary backup tables
CREATE TABLE nodes_backup AS SELECT * FROM nodes;
CREATE TABLE edges_backup AS SELECT * FROM edges;

-- ============================================================================
-- PART 2: Drop existing tables
-- ============================================================================

DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;

-- ============================================================================
-- PART 3: Recreate nodes table with AccountNode support
-- ============================================================================

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation',
    'UserNode', 'AccountNode'  -- NEW: Added AccountNode
  )),
  properties TEXT NOT NULL,  -- JSON
  account_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT CHECK(data_tag IN ('real', 'augmented', 'temporary', 'imported')),

  -- Optimistic locking (Phase 3)
  version INTEGER DEFAULT 1,
  last_modified_by TEXT,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);

-- ============================================================================
-- PART 4: Recreate edges table with new edge types
-- ============================================================================

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
    'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
    'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
    'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
    'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE',
    'MEMBER_OF',      -- NEW: User → Account (any membership)
    'ADMIN_OF',       -- NEW: User → Account (admin role)
    'OWNER_OF',       -- NEW: User → Account (account owner)
    'INVITED_BY'      -- NEW: User → User (invitation graph)
  )),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  properties TEXT,  -- JSON
  account_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  data_tag TEXT CHECK(data_tag IN ('real', 'augmented', 'temporary', 'imported')),

  -- Optimistic locking (Phase 3)
  version INTEGER DEFAULT 1,
  last_modified_by TEXT,

  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
CREATE INDEX IF NOT EXISTS idx_edges_data_tag ON edges(data_tag);

-- ============================================================================
-- PART 5: Restore data from backup
-- ============================================================================

-- Insert nodes with explicit column mapping (new columns get default values)
INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
SELECT id, kind, properties, account_id, created_by, created_at, updated_at, data_tag
FROM nodes_backup;

-- Insert edges with explicit column mapping (new columns get default values)
-- Note: edges_backup doesn't have updated_at column, so we omit it (will get NULL)
INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
SELECT id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
FROM edges_backup;

-- ============================================================================
-- PART 6: Cleanup backup tables
-- ============================================================================

DROP TABLE nodes_backup;
DROP TABLE edges_backup;

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================

-- Verify node counts match
-- SELECT 'nodes restored' AS check, COUNT(*) AS count FROM nodes;

-- Verify edge counts match
-- SELECT 'edges restored' AS check, COUNT(*) AS count FROM edges;

-- Check new constraints are in place
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes';
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='edges';
