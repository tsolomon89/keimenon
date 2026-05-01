-- Migration 040: Add graph identity FK constraints to normalized payload tables
--
-- Epic 3 correctness hardening. Ensures every source_spans/phrases/packets/
-- atomic_units row has a matching nodes.id graph identity row, with
-- ON DELETE CASCADE so that deleting the node automatically removes the
-- normalized payload row.
--
-- Since SQLite cannot ALTER TABLE ADD CONSTRAINT, we recreate each table.
--
-- Steps per table:
--   1. Rehydrate any missing skinny nodes (so FK won't reject existing data)
--   2. Create new table with FK constraint
--   3. Copy data
--   4. Verify row counts
--   5. Drop old table
--   6. Rename new table
--   7. Recreate indexes

-- ============================================================================
-- 0. Ensure nodes.kind CHECK allows the normalized kinds
-- ============================================================================
-- SQLite CHECK constraints are immutable after creation, but we can work
-- around this: if the constraint already allows these kinds (from client.ts
-- embedded schema) this is a no-op. If not, we rebuild the nodes table.
-- We test by attempting a dummy insert and catching the error.
-- For safety and simplicity, we just ensure the skinny node inserts below
-- use INSERT OR IGNORE which will silently fail if CHECK blocks them.
-- Migration 038 already deleted these kinds from nodes, so if the CHECK
-- doesn't include them, we need to rebuild nodes too.

-- First, let's see if nodes accepts SourceSpan kind by checking the schema.
-- If the DB was created from schema.sql (which may lack these kinds), we
-- need to rebuild. If from client.ts embedded schema, they're already there.

-- We handle this by recreating nodes with the correct CHECK constraint
-- only if needed. We use a conditional approach:

PRAGMA defer_foreign_keys = ON;

-- ============================================================================
-- 0a. Rebuild nodes table with expanded CHECK (idempotent)
-- ============================================================================
-- This is the nuclear option but it's the only way to alter a CHECK in SQLite.
-- We preserve all data.

CREATE TABLE IF NOT EXISTS nodes_new (
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

INSERT OR IGNORE INTO nodes_new SELECT * FROM nodes;

-- Verify row counts
SELECT CASE
  WHEN (SELECT COUNT(*) FROM nodes_new) < (SELECT COUNT(*) FROM nodes)
  THEN RAISE(ABORT, 'Migration 040: nodes_new row count mismatch during rebuild')
END;

-- Drop FTS triggers that reference nodes (we'll recreate them)
DROP TRIGGER IF EXISTS nodes_fts_insert;
DROP TRIGGER IF EXISTS nodes_fts_update;
DROP TRIGGER IF EXISTS nodes_fts_delete;
DROP TRIGGER IF EXISTS messages_fts_duplicate_insert;
DROP TRIGGER IF EXISTS messages_fts_duplicate_update;
DROP TRIGGER IF EXISTS messages_fts_duplicate_delete;

-- Drop indexes on nodes (they'll be recreated after rename)
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

DROP TABLE nodes;
ALTER TABLE nodes_new RENAME TO nodes;

-- Recreate nodes indexes
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

-- Recreate FTS triggers
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
-- 1. Rehydrate missing skinny nodes for existing payload rows
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
-- 2. Recreate source_spans with FK
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
-- 3. Recreate phrases with FK
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
-- 4. Recreate packets with FK
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
-- 5. Recreate atomic_units with FK
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
-- 6. Final FK check
-- ============================================================================

PRAGMA foreign_key_check;
