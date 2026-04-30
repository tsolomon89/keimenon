-- 038: Normalize high-volume node kinds into dedicated tables
--
-- This migration extracts SourceSpan, Phrase, Packet, and AtomicUnit nodes
-- out of the generic JSON-blob `nodes` table and into their own fully-normalized
-- relational tables. This reduces DB size significantly and improves query speed
-- by eliminating full-table scans and JSON deserialization on the hot path.

-- =============================================================================
-- 1. Create the dedicated tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS source_spans (
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
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (source_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_source_spans_account_source ON source_spans(account_id, source_id);
CREATE INDEX IF NOT EXISTS idx_source_spans_hash ON source_spans(account_id, span_hash);


CREATE TABLE IF NOT EXISTS phrases (
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
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);


CREATE TABLE IF NOT EXISTS packets (
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
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);


CREATE TABLE IF NOT EXISTS atomic_units (
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
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- =============================================================================
-- 2. Backfill existing data from the `nodes` table
-- =============================================================================

PRAGMA defer_foreign_keys = ON;

-- Backfill source_spans
INSERT OR IGNORE INTO source_spans (
  id, account_id, source_id, message_id, conversation_id, text, normalized_text,
  start_char, end_char, boundary_kind, span_hash, created_by, created_at, updated_at, data_tag, metadata
)
SELECT 
  id,
  account_id,
  json_extract(properties, '$.source_id'),
  json_extract(properties, '$.message_id'),
  json_extract(properties, '$.conversation_id'),
  json_extract(properties, '$.text'),
  json_extract(properties, '$.normalized_text'),
  CAST(json_extract(properties, '$.start_char') AS INTEGER),
  CAST(json_extract(properties, '$.end_char') AS INTEGER),
  COALESCE(json_extract(properties, '$.boundary_kind'), 'sentence'),
  json_extract(properties, '$.span_hash'),
  created_by,
  created_at,
  updated_at,
  data_tag,
  json_extract(properties, '$.metadata')
FROM nodes WHERE kind = 'SourceSpan';

-- Backfill phrases
INSERT OR IGNORE INTO phrases (
  id, account_id, text, normalized_text, type, entity_type, frequency, 
  created_by, created_at, updated_at, data_tag, metadata
)
SELECT
  id,
  account_id,
  json_extract(properties, '$.text'),
  json_extract(properties, '$.normalized_text'),
  COALESCE(json_extract(properties, '$.type'), 'n-gram'),
  json_extract(properties, '$.entity_type'),
  COALESCE(CAST(json_extract(properties, '$.frequency') AS INTEGER), 0),
  created_by,
  created_at,
  updated_at,
  data_tag,
  json_extract(properties, '$.metadata')
FROM nodes WHERE kind = 'Phrase';

-- Backfill packets
INSERT OR IGNORE INTO packets (
  id, account_id, text, normalized_text, occurrences, mass, coverage, idf, entropy_factor, packet_hash,
  created_by, created_at, updated_at, data_tag, metadata
)
SELECT
  id,
  account_id,
  json_extract(properties, '$.text'),
  json_extract(properties, '$.normalized_text'),
  COALESCE(CAST(json_extract(properties, '$.occurrences') AS INTEGER), 1),
  COALESCE(CAST(json_extract(properties, '$.mass') AS REAL), 0),
  COALESCE(CAST(json_extract(properties, '$.coverage') AS REAL), 0),
  COALESCE(CAST(json_extract(properties, '$.idf') AS REAL), 0),
  COALESCE(CAST(json_extract(properties, '$.entropy_factor') AS REAL), 0),
  json_extract(properties, '$.packet_hash'),
  created_by,
  created_at,
  updated_at,
  data_tag,
  json_extract(properties, '$.metadata')
FROM nodes WHERE kind = 'Packet';

-- Backfill atomic_units
INSERT OR IGNORE INTO atomic_units (
  id, account_id, unit_type, value, normalized_value, unit_hash,
  created_by, created_at, updated_at, data_tag, metadata
)
SELECT
  id,
  account_id,
  json_extract(properties, '$.unit_type'),
  json_extract(properties, '$.value'),
  json_extract(properties, '$.normalized_value'),
  json_extract(properties, '$.unit_hash'),
  created_by,
  created_at,
  updated_at,
  data_tag,
  json_extract(properties, '$.metadata')
FROM nodes WHERE kind = 'AtomicUnit';

-- =============================================================================
-- 3. Cleanup the tombstones and expression indexes
-- =============================================================================

-- Drop the expression indexes created in migration 037 for these specific kinds
-- since they now live in their own tables with real columns.
DROP INDEX IF EXISTS idx_nodes_expr_source_id;
DROP INDEX IF EXISTS idx_nodes_expr_hub_score;

-- Physically delete the nodes (bypassing FTS since these kinds aren't FTS indexed)
DELETE FROM nodes WHERE kind IN ('SourceSpan', 'Phrase', 'Packet', 'AtomicUnit');
