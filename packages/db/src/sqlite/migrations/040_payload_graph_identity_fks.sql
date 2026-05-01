-- Migration 040: Add graph identity FK constraints to normalized payload tables
--
-- Epic 3 correctness hardening. Ensures every source_spans/phrases/packets/
-- atomic_units row has a matching nodes.id graph identity row, with
-- ON DELETE CASCADE so that deleting the node automatically removes the
-- normalized payload row.
--
-- SAFETY: This migration rebuilds `nodes` which is referenced by `edges`.
-- To avoid invalidating or losing edges, we:
--   1. Disable FK enforcement for the rebuild section
--   2. Backup both nodes and edges into temp tables
--   3. Drop FTS triggers, indexes, edges, then nodes (in dependency order)
--   4. Recreate nodes with corrected CHECK, recreate edges unchanged
--   5. Restore all data from backups
--   6. Recreate all indexes and FTS triggers
--   7. Rehydrate missing skinny nodes for payload rows
--   8. Rebuild payload tables with FK constraints
--   9. Validate FK integrity and abort if violations remain

-- ============================================================================
-- 0. Disable FK enforcement for the table rebuild
-- ============================================================================

PRAGMA defer_foreign_keys = ON;

-- ============================================================================
-- 1. Backup nodes and edges into temp tables
-- ============================================================================

CREATE TEMP TABLE nodes_backup AS SELECT * FROM nodes;
CREATE TEMP TABLE edges_backup AS SELECT * FROM edges;

-- ============================================================================
-- 2. Drop FTS triggers that reference nodes
-- ============================================================================

DROP TRIGGER IF EXISTS nodes_fts_insert;
DROP TRIGGER IF EXISTS nodes_fts_update;
DROP TRIGGER IF EXISTS nodes_fts_delete;
DROP TRIGGER IF EXISTS messages_fts_duplicate_insert;
DROP TRIGGER IF EXISTS messages_fts_duplicate_update;
DROP TRIGGER IF EXISTS messages_fts_duplicate_delete;

-- ============================================================================
-- 3. Drop indexes on edges and nodes
-- ============================================================================

-- Edge indexes
DROP INDEX IF EXISTS idx_edges_kind;
DROP INDEX IF EXISTS idx_edges_account;
DROP INDEX IF EXISTS idx_edges_created_by;
DROP INDEX IF EXISTS idx_edges_from;
DROP INDEX IF EXISTS idx_edges_to;
DROP INDEX IF EXISTS idx_edges_from_to;
DROP INDEX IF EXISTS idx_edges_created;
DROP INDEX IF EXISTS idx_edges_data_tag;
DROP INDEX IF EXISTS idx_edges_account_tag;
DROP INDEX IF EXISTS idx_edges_spine;
DROP INDEX IF EXISTS idx_edges_verified;
DROP INDEX IF EXISTS idx_edges_agent;
DROP INDEX IF EXISTS idx_edges_workspace;
DROP INDEX IF EXISTS idx_edges_conversation;
DROP INDEX IF EXISTS idx_edges_run_attribution;
DROP INDEX IF EXISTS idx_edges_pro_import;

-- Node indexes
DROP INDEX IF EXISTS idx_nodes_kind;
DROP INDEX IF EXISTS idx_nodes_account;
DROP INDEX IF EXISTS idx_nodes_created_by;
DROP INDEX IF EXISTS idx_nodes_created;
DROP INDEX IF EXISTS idx_nodes_updated;
DROP INDEX IF EXISTS idx_nodes_data_tag;
DROP INDEX IF EXISTS idx_nodes_account_tag;
DROP INDEX IF EXISTS idx_nodes_content_hash;
DROP INDEX IF EXISTS idx_nodes_account_hash;
DROP INDEX IF EXISTS idx_nodes_spine;
DROP INDEX IF EXISTS idx_nodes_verified;
DROP INDEX IF EXISTS idx_nodes_objective_claim_status;
DROP INDEX IF EXISTS idx_nodes_agent;
DROP INDEX IF EXISTS idx_nodes_principal;
DROP INDEX IF EXISTS idx_nodes_conversation;
DROP INDEX IF EXISTS idx_nodes_actors;
DROP INDEX IF EXISTS idx_nodes_pro_import;

-- ============================================================================
-- 4. Drop edges FIRST (child), then nodes (parent) — dependency order
-- ============================================================================

DROP TABLE edges;
DROP TABLE nodes;

-- ============================================================================
-- 5. Recreate nodes with expanded CHECK constraint
-- ============================================================================

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation', 'UserNode', 'AccountNode', 'Board',
    'SourceDoc', 'Lexeme', 'Phrase', 'Topic', 'VerifiedSource', 'VerifiedClaim', 'AgentNode',
    'CanonicalDoc', 'DuplicateCluster', 'Evidence', 'Principal', 'ConversationThread',
    'SourceSpan', 'Packet', 'AtomicUnit'
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

-- ============================================================================
-- 6. Recreate edges with identical schema
-- ============================================================================

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
    'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
    'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
    'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
    'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE', 'OWNER_OF',
    'EXACT_DUP', 'NEAR_DUP', 'SPAN_CONTAINS', 'CLUSTER_MEMBER', 'MENTIONS', 'ABOUT',
    'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC', 'SOURCED_FROM', 'DERIVED_FROM', 'CANDIDATE_DUP',
    'CREATED_BY_AGENT', 'EVIDENCE_FOR', 'CREATED_BY', 'ATTACHED_TO', 'PINS_CONTEXT',
    'INITIATED_BY', 'PARTICIPATED_IN', 'PRODUCED_BY',
    'HAS_SPAN', 'OCCURS_IN_SPAN', 'COMPOSED_OF_ATOMIC'
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

-- ============================================================================
-- 7. Restore data from backups
-- ============================================================================

INSERT INTO nodes SELECT * FROM nodes_backup;

-- Verify nodes row count
SELECT CASE
  WHEN (SELECT COUNT(*) FROM nodes) < (SELECT COUNT(*) FROM nodes_backup)
  THEN RAISE(ABORT, 'Migration 040: nodes row count mismatch after restore')
END;

INSERT INTO edges SELECT * FROM edges_backup;

-- Verify edges row count
SELECT CASE
  WHEN (SELECT COUNT(*) FROM edges) < (SELECT COUNT(*) FROM edges_backup)
  THEN RAISE(ABORT, 'Migration 040: edges row count mismatch after restore')
END;

-- Drop temp backups
DROP TABLE nodes_backup;
DROP TABLE edges_backup;

-- ============================================================================
-- 8. Recreate all node indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
CREATE INDEX IF NOT EXISTS idx_nodes_created_by ON nodes(created_by);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_account_tag ON nodes(account_id, data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
CREATE INDEX IF NOT EXISTS idx_nodes_account_hash ON nodes(account_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_nodes_spine ON nodes(kind) WHERE kind IN ('Lexeme', 'Phrase', 'Topic');
CREATE INDEX IF NOT EXISTS idx_nodes_verified ON nodes(kind) WHERE kind IN ('VerifiedSource', 'VerifiedClaim');
CREATE INDEX IF NOT EXISTS idx_nodes_objective_claim_status
  ON nodes(kind, json_extract(properties, '$.status'))
  WHERE kind = 'ObjectiveClaim';
CREATE INDEX IF NOT EXISTS idx_nodes_agent ON nodes(kind) WHERE kind IN ('AgentNode', 'CanonicalDoc', 'DuplicateCluster', 'Evidence');
CREATE INDEX IF NOT EXISTS idx_nodes_principal ON nodes(kind) WHERE kind = 'Principal';
CREATE INDEX IF NOT EXISTS idx_nodes_conversation ON nodes(kind) WHERE kind = 'ConversationThread';
CREATE INDEX IF NOT EXISTS idx_nodes_actors ON nodes(kind) WHERE kind IN ('Principal', 'UserNode', 'AgentNode');
CREATE INDEX IF NOT EXISTS idx_nodes_pro_import ON nodes(kind) WHERE kind IN ('SourceSpan', 'Packet', 'AtomicUnit');

-- ============================================================================
-- 9. Recreate all edge indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
CREATE INDEX IF NOT EXISTS idx_edges_created_by ON edges(created_by);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_to ON edges(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_edges_created ON edges(created_at);
CREATE INDEX IF NOT EXISTS idx_edges_data_tag ON edges(data_tag);
CREATE INDEX IF NOT EXISTS idx_edges_account_tag ON edges(account_id, data_tag);
CREATE INDEX IF NOT EXISTS idx_edges_spine ON edges(kind) WHERE kind IN ('MENTIONS', 'ABOUT', 'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC');
CREATE INDEX IF NOT EXISTS idx_edges_verified ON edges(kind) WHERE kind IN ('SOURCED_FROM', 'VERIFIED_BY');
CREATE INDEX IF NOT EXISTS idx_edges_agent ON edges(kind) WHERE kind IN ('DERIVED_FROM', 'CANDIDATE_DUP', 'CREATED_BY_AGENT', 'EVIDENCE_FOR');
CREATE INDEX IF NOT EXISTS idx_edges_workspace ON edges(kind) WHERE kind IN ('CREATED_BY', 'ATTACHED_TO', 'PINS_CONTEXT');
CREATE INDEX IF NOT EXISTS idx_edges_conversation ON edges(kind) WHERE kind IN ('INITIATED_BY', 'PARTICIPATED_IN');
CREATE INDEX IF NOT EXISTS idx_edges_run_attribution ON edges(kind) WHERE kind = 'PRODUCED_BY';
CREATE INDEX IF NOT EXISTS idx_edges_pro_import ON edges(kind) WHERE kind IN ('HAS_SPAN', 'OCCURS_IN_SPAN', 'COMPOSED_OF_ATOMIC');

-- ============================================================================
-- 10. Recreate FTS triggers
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
  INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_insert
AFTER INSERT ON nodes
WHEN new.kind = 'Message' AND new.canonical_content IS NOT NULL
BEGIN
  INSERT INTO messages_fts_duplicate(node_id, content, account_id)
  VALUES (new.id, new.canonical_content, new.account_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_update
AFTER UPDATE ON nodes
WHEN new.kind = 'Message'
  AND (old.canonical_content != new.canonical_content OR old.canonical_content IS NULL)
  AND new.canonical_content IS NOT NULL
BEGIN
  DELETE FROM messages_fts_duplicate WHERE node_id = old.id;
  INSERT INTO messages_fts_duplicate(node_id, content, account_id)
  VALUES (new.id, new.canonical_content, new.account_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_delete
AFTER DELETE ON nodes
WHEN old.kind = 'Message'
BEGIN
  DELETE FROM messages_fts_duplicate WHERE node_id = old.id;
END;

-- ============================================================================
-- 11. Rehydrate missing skinny nodes for existing payload rows
-- ============================================================================
-- If source_spans/phrases/packets/atomic_units rows exist without a
-- corresponding nodes row, insert a skinny graph identity node.

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT ss.id, 'SourceSpan', '{}', ss.account_id, ss.created_by, ss.created_at, ss.updated_at, COALESCE(ss.data_tag, 'real'), ss.span_hash, ss.normalized_text, 0, NULL
FROM source_spans ss
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = ss.id);

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT p.id, 'Phrase', '{}', p.account_id, p.created_by, p.created_at, p.updated_at, COALESCE(p.data_tag, 'real'), NULL, p.normalized_text, 0, NULL
FROM phrases p
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = p.id);

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT pk.id, 'Packet', '{}', pk.account_id, pk.created_by, pk.created_at, pk.updated_at, COALESCE(pk.data_tag, 'real'), pk.packet_hash, pk.normalized_text, 0, NULL
FROM packets pk
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = pk.id);

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT au.id, 'AtomicUnit', '{}', au.account_id, au.created_by, au.created_at, au.updated_at, COALESCE(au.data_tag, 'real'), au.unit_hash, au.normalized_value, 0, NULL
FROM atomic_units au
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = au.id);

-- ============================================================================
-- 12. Recreate source_spans with FK
-- ============================================================================

CREATE TABLE source_spans_new (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  message_id TEXT,
  conversation_id TEXT,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  start_char INTEGER NOT NULL,
  end_char INTEGER NOT NULL,
  boundary_kind TEXT NOT NULL DEFAULT 'sentence',
  span_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real',
  metadata TEXT,
  FOREIGN KEY (id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (source_id) REFERENCES nodes(id)
);

INSERT INTO source_spans_new SELECT * FROM source_spans;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM source_spans_new) != (SELECT COUNT(*) FROM source_spans)
  THEN RAISE(ABORT, 'Migration 040: source_spans row count mismatch')
END;

DROP TABLE source_spans;
ALTER TABLE source_spans_new RENAME TO source_spans;

CREATE INDEX IF NOT EXISTS idx_source_spans_account_source ON source_spans(account_id, source_id);
CREATE INDEX IF NOT EXISTS idx_source_spans_hash ON source_spans(account_id, span_hash);

-- ============================================================================
-- 13. Recreate phrases with FK
-- ============================================================================

CREATE TABLE phrases_new (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'n-gram',
  entity_type TEXT,
  frequency INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real',
  metadata TEXT,
  FOREIGN KEY (id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

INSERT INTO phrases_new SELECT * FROM phrases;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM phrases_new) != (SELECT COUNT(*) FROM phrases)
  THEN RAISE(ABORT, 'Migration 040: phrases row count mismatch')
END;

DROP TABLE phrases;
ALTER TABLE phrases_new RENAME TO phrases;

-- ============================================================================
-- 14. Recreate packets with FK
-- ============================================================================

CREATE TABLE packets_new (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  mass REAL NOT NULL DEFAULT 0,
  coverage REAL NOT NULL DEFAULT 0,
  idf REAL NOT NULL DEFAULT 0,
  entropy_factor REAL NOT NULL DEFAULT 0,
  packet_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real',
  metadata TEXT,
  FOREIGN KEY (id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

INSERT INTO packets_new SELECT * FROM packets;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM packets_new) != (SELECT COUNT(*) FROM packets)
  THEN RAISE(ABORT, 'Migration 040: packets row count mismatch')
END;

DROP TABLE packets;
ALTER TABLE packets_new RENAME TO packets;

-- ============================================================================
-- 15. Recreate atomic_units with FK
-- ============================================================================

CREATE TABLE atomic_units_new (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  unit_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real',
  metadata TEXT,
  FOREIGN KEY (id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

INSERT INTO atomic_units_new SELECT * FROM atomic_units;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM atomic_units_new) != (SELECT COUNT(*) FROM atomic_units)
  THEN RAISE(ABORT, 'Migration 040: atomic_units row count mismatch')
END;

DROP TABLE atomic_units;
ALTER TABLE atomic_units_new RENAME TO atomic_units;

-- ============================================================================
-- 16. Final FK validation — MUST abort if violations remain
-- ============================================================================
-- PRAGMA foreign_key_check only returns rows; it does not abort.
-- We use a temp table to capture violations and fail explicitly.

CREATE TEMP TABLE _fk_violations AS SELECT * FROM pragma_foreign_key_check;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM _fk_violations) > 0
  THEN RAISE(ABORT, 'Migration 040: foreign key violations remain after migration')
END;

DROP TABLE _fk_violations;
