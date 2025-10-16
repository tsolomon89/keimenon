-- SQLite Schema for Local-First Chat Corpus
-- Version: 1.0

-- Nodes table (all node types: UploadItem, Chat, MessageRef, Source, Group, CodeBlock, Folder)
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation', 'UserNode'
  )),
  properties TEXT NOT NULL,  -- JSON blob for flexible schema
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Edges table (all relationship types)
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
    'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
    'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
    'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
    'FOLDS_INTO_FOLDER', 'AFFINITY', 'DISCOURSE'
  )),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  properties TEXT,  -- JSON blob for edge metadata
  created_at INTEGER NOT NULL,
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);

CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_to ON edges(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_edges_created ON edges(created_at);

-- Full-text search support (for properties JSON)
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  id UNINDEXED,
  content,
  content=nodes,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, content)
  VALUES (new.rowid, new.id, new.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
  UPDATE nodes_fts SET content = new.properties
  WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.rowid;
END;

-- Metadata table for schema versioning
CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('version', '1.0');
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('created_at', datetime('now'));
