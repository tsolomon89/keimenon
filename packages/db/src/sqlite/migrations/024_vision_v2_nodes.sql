-- Migration 024: Vision V2 - Add UGC Spine and Verified Graph nodes/edges
-- Purpose: Enable two-layer epistemic graph (UGC Spine + Verified Layer)
--
-- New Node Types:
--   UGC Spine: Lexeme, Phrase, Topic, SourceDoc
--   Verified:  VerifiedSource, VerifiedClaim
--
-- New Edge Types:
--   Spine:     MENTIONS, ABOUT, CO_OCCURS_WITH, BELONGS_TO_TOPIC
--   Verified:  SOURCED_FROM
--   Existing (not in schema): EXACT_DUP, NEAR_DUP, SPAN_CONTAINS, CLUSTER_MEMBER
--
-- Note: SQLite doesn't support altering CHECK constraints, so we recreate tables

-- ============================================================================
-- PART 1: Backup existing nodes and edges
-- ============================================================================

CREATE TABLE nodes_backup AS SELECT * FROM nodes;
CREATE TABLE edges_backup AS SELECT * FROM edges;

-- ============================================================================
-- PART 2: Drop existing tables (edges first due to FK)
-- ============================================================================

DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;

-- ============================================================================
-- PART 3: Recreate nodes table with V2 node kinds
-- ============================================================================

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    -- Original kinds
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation',
    'UserNode', 'AccountNode', 'Board',
    -- V2 UGC Spine nodes
    'SourceDoc',        -- Stitched user segments (was missing)
    'Lexeme',           -- Canonical word token
    'Phrase',           -- Multiword unit / named entity
    'Topic',            -- Cluster of phrases
    -- V2 Verified nodes
    'VerifiedSource',   -- External authority with trust score
    'VerifiedClaim'     -- Fact anchored to verified source
  )),
  properties TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  content_hash TEXT,
  canonical_content TEXT,
  is_duplicate INTEGER DEFAULT 0,
  original_node_id TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Recreate node indexes
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
CREATE INDEX IF NOT EXISTS idx_nodes_is_duplicate ON nodes(is_duplicate);

-- V2 specific indexes for spine queries
CREATE INDEX IF NOT EXISTS idx_nodes_spine ON nodes(kind) WHERE kind IN ('Lexeme', 'Phrase', 'Topic');
CREATE INDEX IF NOT EXISTS idx_nodes_verified ON nodes(kind) WHERE kind IN ('VerifiedSource', 'VerifiedClaim');

-- ============================================================================
-- PART 4: Recreate edges table with V2 edge kinds
-- ============================================================================

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    -- Original kinds
    'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
    'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
    'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
    'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
    'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE', 'OWNER_OF',
    -- Existing in types, added to schema
    'EXACT_DUP',        -- Content-addressed exact duplicates
    'NEAR_DUP',         -- Similarity-based near duplicates
    'SPAN_CONTAINS',    -- Byte-level hierarchical containment
    'CLUSTER_MEMBER',   -- Node belongs to cluster
    -- V2 UGC Spine edges
    'MENTIONS',         -- UGCDoc → Lexeme/Phrase
    'ABOUT',            -- UGCDoc → Topic
    'CO_OCCURS_WITH',   -- Phrase ↔ Phrase (co-occurrence)
    'BELONGS_TO_TOPIC', -- Phrase → Topic
    -- V2 Verified edges
    'SOURCED_FROM'      -- VerifiedClaim → VerifiedSource
  )),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  properties TEXT,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Recreate edge indexes
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
CREATE INDEX IF NOT EXISTS idx_edges_data_tag ON edges(data_tag);

-- V2 specific indexes for spine traversal
CREATE INDEX IF NOT EXISTS idx_edges_spine ON edges(kind) WHERE kind IN ('MENTIONS', 'ABOUT', 'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC');
CREATE INDEX IF NOT EXISTS idx_edges_verified ON edges(kind) WHERE kind IN ('SOURCED_FROM', 'VERIFIED_BY');

-- ============================================================================
-- PART 5: Restore data from backup
-- ============================================================================

-- Insert nodes with explicit column mapping
INSERT INTO nodes (
  id, kind, properties, account_id, created_by, created_at, updated_at,
  data_tag, content_hash, canonical_content, is_duplicate, original_node_id
)
SELECT
  id, kind, properties, account_id, created_by, created_at, updated_at,
  data_tag, content_hash, canonical_content, is_duplicate, original_node_id
FROM nodes_backup;

-- Insert edges with explicit column mapping
INSERT INTO edges (
  id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
)
SELECT
  id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
FROM edges_backup;

-- ============================================================================
-- PART 6: Cleanup backup tables
-- ============================================================================

DROP TABLE nodes_backup;
DROP TABLE edges_backup;

-- ============================================================================
-- VERIFICATION (run manually to confirm)
-- ============================================================================

-- Verify node counts:
-- SELECT 'nodes restored' AS check, COUNT(*) AS count FROM nodes;

-- Verify edge counts:
-- SELECT 'edges restored' AS check, COUNT(*) AS count FROM edges;

-- Check new node kinds constraint:
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes';

-- Check new edge kinds constraint:
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='edges';

-- Test inserting V2 nodes (should succeed):
-- INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
-- VALUES ('test-lexeme', 'Lexeme', '{"lemma":"test"}', 'acc1', 'user1', 1234567890, 1234567890);
