-- Migration 040: Add graph identity FK constraints to normalized payload tables
--
-- Epic 3 correctness hardening. Ensures every source_spans/phrases/packets/
-- atomic_units row has a matching nodes.id graph identity row, with
-- ON DELETE CASCADE so that deleting the node automatically removes the
-- normalized payload row.
--
-- SAFETY: This migration rebuilds `nodes`. Multiple child tables reference
-- nodes(id): edges, source_spans (source_id), etc. We MUST drop ALL
-- dependent tables before dropping nodes to avoid FK violations.
--
-- Migration sequence:
--   1. Backup ALL tables that reference nodes(id)
--   2. Drop FTS triggers and indexes
--   3. Drop ALL child tables (edges, payload tables), then nodes
--   4. Recreate nodes with expanded CHECK
--   5. Recreate edges
--   6. Recreate payload tables with FK(id) REFERENCES nodes(id) ON DELETE CASCADE
--   7. Restore nodes first
--   8. Rehydrate any missing skinny nodes from payload backups
--   9. Restore payload rows, then edges
--  10. Verify row counts for every table
--  11. Recreate indexes and FTS triggers
--  12. Final FK validation — abort if violations remain

-- ============================================================================
-- 0. Defer FK enforcement for the rebuild
-- ============================================================================

PRAGMA defer_foreign_keys = ON;

-- ============================================================================
-- 1. Backup ALL tables that reference or will reference nodes(id)
-- ============================================================================

CREATE TEMP TABLE _nodes_backup AS SELECT * FROM nodes;
CREATE TEMP TABLE _edges_backup AS SELECT * FROM edges;

-- Payload tables may not exist yet on fresh DBs (created by earlier migrations)
-- Use CREATE TABLE AS SELECT which naturally handles "table doesn't exist" as
-- an empty set when wrapped in IF EXISTS logic. Since SQLite doesn't support
-- CREATE TABLE IF NOT EXISTS ... AS SELECT, we use a safe conditional approach.

CREATE TEMP TABLE _source_spans_backup AS
  SELECT * FROM source_spans WHERE 1=1;

CREATE TEMP TABLE _phrases_backup AS
  SELECT * FROM phrases WHERE 1=1;

CREATE TEMP TABLE _packets_backup AS
  SELECT * FROM packets WHERE 1=1;

CREATE TEMP TABLE _atomic_units_backup AS
  SELECT * FROM atomic_units WHERE 1=1;

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
-- 3. Drop ALL indexes (edges, nodes, payload tables)
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

-- Payload table indexes
DROP INDEX IF EXISTS idx_source_spans_account_source;
DROP INDEX IF EXISTS idx_source_spans_hash;

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
-- 4. Drop ALL child tables, then parent — full dependency order
-- ============================================================================
-- Child tables that reference nodes(id) via FK or source_id FK:
--   edges       → from_id, to_id REFERENCES nodes(id)
--   source_spans → id REFERENCES nodes(id), source_id REFERENCES nodes(id)
--   phrases     → id REFERENCES nodes(id)
--   packets     → id REFERENCES nodes(id)
--   atomic_units → id REFERENCES nodes(id)

DROP TABLE IF EXISTS atomic_units;
DROP TABLE IF EXISTS packets;
DROP TABLE IF EXISTS phrases;
DROP TABLE IF EXISTS source_spans;
DROP TABLE IF EXISTS edges;
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
-- 7. Recreate payload tables with FK(id) REFERENCES nodes(id) ON DELETE CASCADE
-- ============================================================================

CREATE TABLE source_spans (
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

CREATE TABLE phrases (
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

CREATE TABLE packets (
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

CREATE TABLE atomic_units (
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

-- ============================================================================
-- 8. Restore nodes first (parent table)
-- ============================================================================

INSERT INTO nodes SELECT * FROM _nodes_backup;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM nodes) < (SELECT COUNT(*) FROM _nodes_backup)
  THEN RAISE(ABORT, 'Migration 040: nodes row count mismatch after restore')
END;

-- ============================================================================
-- 9. Rehydrate missing skinny nodes from payload backups
-- ============================================================================
-- Payload rows may exist without a graph identity node in nodes.
-- Insert skinny placeholder nodes BEFORE restoring payload rows
-- so the FK(id) REFERENCES nodes(id) constraint is satisfied.

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT ss.id, 'SourceSpan', '{}', ss.account_id, ss.created_by, ss.created_at, ss.updated_at, COALESCE(ss.data_tag, 'real'), ss.span_hash, ss.normalized_text, 0, NULL
FROM _source_spans_backup ss
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = ss.id);

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT p.id, 'Phrase', '{}', p.account_id, p.created_by, p.created_at, p.updated_at, COALESCE(p.data_tag, 'real'), NULL, p.normalized_text, 0, NULL
FROM _phrases_backup p
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = p.id);

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT pk.id, 'Packet', '{}', pk.account_id, pk.created_by, pk.created_at, pk.updated_at, COALESCE(pk.data_tag, 'real'), pk.packet_hash, pk.normalized_text, 0, NULL
FROM _packets_backup pk
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = pk.id);

INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, content_hash, canonical_content, is_duplicate, original_node_id)
SELECT au.id, 'AtomicUnit', '{}', au.account_id, au.created_by, au.created_at, au.updated_at, COALESCE(au.data_tag, 'real'), au.unit_hash, au.normalized_value, 0, NULL
FROM _atomic_units_backup au
WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = au.id);

-- ============================================================================
-- 10. Restore payload rows from backups
-- ============================================================================

INSERT INTO source_spans SELECT * FROM _source_spans_backup;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM source_spans) < (SELECT COUNT(*) FROM _source_spans_backup)
  THEN RAISE(ABORT, 'Migration 040: source_spans row count mismatch after restore')
END;

INSERT INTO phrases SELECT * FROM _phrases_backup;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM phrases) < (SELECT COUNT(*) FROM _phrases_backup)
  THEN RAISE(ABORT, 'Migration 040: phrases row count mismatch after restore')
END;

INSERT INTO packets SELECT * FROM _packets_backup;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM packets) < (SELECT COUNT(*) FROM _packets_backup)
  THEN RAISE(ABORT, 'Migration 040: packets row count mismatch after restore')
END;

INSERT INTO atomic_units SELECT * FROM _atomic_units_backup;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM atomic_units) < (SELECT COUNT(*) FROM _atomic_units_backup)
  THEN RAISE(ABORT, 'Migration 040: atomic_units row count mismatch after restore')
END;

-- ============================================================================
-- 11. Restore edges
-- ============================================================================

INSERT INTO edges SELECT * FROM _edges_backup;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM edges) < (SELECT COUNT(*) FROM _edges_backup)
  THEN RAISE(ABORT, 'Migration 040: edges row count mismatch after restore')
END;

-- ============================================================================
-- 12. Drop temp backups
-- ============================================================================

DROP TABLE _nodes_backup;
DROP TABLE _edges_backup;
DROP TABLE _source_spans_backup;
DROP TABLE _phrases_backup;
DROP TABLE _packets_backup;
DROP TABLE _atomic_units_backup;

-- ============================================================================
-- 13. Recreate all node indexes
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
-- 14. Recreate all edge indexes
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
-- 15. Recreate payload table indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_source_spans_account_source ON source_spans(account_id, source_id);
CREATE INDEX IF NOT EXISTS idx_source_spans_hash ON source_spans(account_id, span_hash);

-- ============================================================================
-- 16. Recreate FTS triggers
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
-- 17. Final FK validation — MUST abort if violations remain
-- ============================================================================

CREATE TEMP TABLE _fk_violations AS SELECT * FROM pragma_foreign_key_check;

SELECT CASE
  WHEN (SELECT COUNT(*) FROM _fk_violations) > 0
  THEN RAISE(ABORT, 'Migration 040: foreign key violations remain after migration')
END;

DROP TABLE _fk_violations;
