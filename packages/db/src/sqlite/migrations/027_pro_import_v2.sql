-- Migration 027: Pro Import v2 graph kinds
-- Adds explicit SourceSpan / Packet / AtomicUnit node kinds
-- and HAS_SPAN / OCCURS_IN_SPAN / COMPOSED_OF_ATOMIC edge kinds.
--
-- SQLite cannot alter CHECK constraints in place, so nodes/edges are rebuilt.

PRAGMA foreign_keys = OFF;

CREATE TABLE nodes_backup_027 AS SELECT * FROM nodes;
CREATE TABLE edges_backup_027 AS SELECT * FROM edges;

DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;

CREATE TABLE IF NOT EXISTS nodes (
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

CREATE TABLE IF NOT EXISTS edges (
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

INSERT INTO nodes (
  id, kind, properties, account_id, created_by, created_at, updated_at,
  data_tag, content_hash, canonical_content, is_duplicate, original_node_id
)
SELECT
  id, kind, properties, account_id, created_by, created_at, updated_at,
  data_tag, content_hash, canonical_content, is_duplicate, original_node_id
FROM nodes_backup_027;

INSERT INTO edges (
  id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
)
SELECT
  id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
FROM edges_backup_027;

DROP TABLE nodes_backup_027;
DROP TABLE edges_backup_027;

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
CREATE INDEX IF NOT EXISTS idx_nodes_agent ON nodes(kind) WHERE kind IN ('AgentNode', 'CanonicalDoc', 'DuplicateCluster', 'Evidence');
CREATE INDEX IF NOT EXISTS idx_nodes_principal ON nodes(kind) WHERE kind = 'Principal';
CREATE INDEX IF NOT EXISTS idx_nodes_conversation ON nodes(kind) WHERE kind = 'ConversationThread';
CREATE INDEX IF NOT EXISTS idx_nodes_actors ON nodes(kind) WHERE kind IN ('Principal', 'UserNode', 'AgentNode');
CREATE INDEX IF NOT EXISTS idx_nodes_pro_import ON nodes(kind) WHERE kind IN ('SourceSpan', 'Packet', 'AtomicUnit');

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

PRAGMA foreign_keys = ON;
