-- Migration 003: Fix FTS5 schema mismatch
-- The nodes_fts table was configured with content=nodes, which causes FTS5
-- to try reading a 'content' column from the nodes table (which doesn't exist).
-- We need to recreate the FTS table as a standalone table populated only by triggers.

-- 1. Drop existing FTS table and triggers
DROP TRIGGER IF EXISTS nodes_fts_insert;
DROP TRIGGER IF EXISTS nodes_fts_update;
DROP TRIGGER IF EXISTS nodes_fts_delete;
DROP TABLE IF EXISTS nodes_fts;

-- 2. Create FTS table WITHOUT external content (standalone mode)
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  id UNINDEXED,
  content
  -- NO content=nodes parameter - this makes it standalone
  -- NO content_rowid parameter - we'll use id for matching instead
);

-- 3. Recreate triggers to keep FTS in sync
CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(id, content)
  VALUES (new.id, new.properties);
END;

CREATE TRIGGER nodes_fts_update AFTER UPDATE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
  INSERT INTO nodes_fts(id, content)
  VALUES (new.id, new.properties);
END;

CREATE TRIGGER nodes_fts_delete AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
END;

-- 4. Rebuild FTS index from existing nodes
INSERT INTO nodes_fts(id, content)
SELECT id, properties FROM nodes;
