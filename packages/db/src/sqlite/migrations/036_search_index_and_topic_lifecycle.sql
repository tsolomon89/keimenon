-- 036: Search index tables and topic lifecycle backfill.
-- Creates the inverted index postings table, document stats table, and index run log.
-- Backfills existing Topic nodes with topic_status = 'promoted'.

-- ============================================================================
-- 1. Inverted index postings (derived from SourceSpan tokens)
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_postings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  term TEXT NOT NULL,
  span_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  term_count INTEGER NOT NULL DEFAULT 1,
  positions TEXT,  -- JSON array of character offsets, e.g. [12, 45, 102]
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_search_postings_account_term
  ON search_postings(account_id, term);
CREATE INDEX IF NOT EXISTS idx_search_postings_account_span
  ON search_postings(account_id, span_id);
CREATE INDEX IF NOT EXISTS idx_search_postings_account_source
  ON search_postings(account_id, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_postings_unique
  ON search_postings(account_id, term, span_id);

-- ============================================================================
-- 2. Document stats (per-span term/char counts for BM25 length normalization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_doc_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  total_terms INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_doc_stats_account_span
  ON search_doc_stats(account_id, span_id);
CREATE INDEX IF NOT EXISTS idx_search_doc_stats_account_source
  ON search_doc_stats(account_id, source_id);
CREATE INDEX IF NOT EXISTS idx_search_doc_stats_content_hash
  ON search_doc_stats(account_id, content_hash);

-- ============================================================================
-- 3. Index run log (tracks rebuild/incremental runs for diagnostics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_index_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  run_type TEXT NOT NULL DEFAULT 'full',  -- 'full' or 'incremental'
  source_count INTEGER NOT NULL DEFAULT 0,
  span_count INTEGER NOT NULL DEFAULT 0,
  posting_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_search_index_runs_account
  ON search_index_runs(account_id, created_at DESC);

-- ============================================================================
-- 4. Topic lifecycle backfill
-- ============================================================================
-- Existing Topic nodes that do not have topic_status should be backfilled as promoted.
-- We update the properties JSON to include the required fields.

UPDATE nodes
SET properties = json_set(
  properties,
  '$.topic_status', 'promoted',
  '$.visible_by_default', json('true'),
  '$.traversal_eligible', json('true'),
  '$.metadata.migrated_from_legacy_visibility', json('true'),
  '$.metadata.graph_scope', 'knowledge'
),
updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE kind = 'Topic'
  AND (
    json_extract(properties, '$.topic_status') IS NULL
    OR json_extract(properties, '$.topic_status') = ''
  );
