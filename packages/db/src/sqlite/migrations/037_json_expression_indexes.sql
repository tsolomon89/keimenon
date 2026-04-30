-- 037: Expression indexes for frequently-queried JSON property paths.
--
-- Problem: Multiple hot paths in the import, authority scoring, and semantic
-- indexing pipelines filter on json_extract(properties, ...) inside loops.
-- Without indexes, every such query performs a full table scan + JSON parse
-- on every row. At 100K+ nodes this causes multi-minute event-loop freezes.
--
-- Solution: SQLite expression indexes (supported since 3.9.0) let the query
-- planner use B-tree lookups on pre-computed json_extract values. Existing
-- queries benefit automatically — no code changes required.
--
-- Trade-off: Each index adds modest write overhead (~5-10% per INSERT/UPDATE
-- on the indexed table). This is acceptable because reads in tight loops
-- vastly outnumber writes.

-- ============================================================================
-- 1. nodes: topic_status (used in authority scoring loops, topic lifecycle)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nodes_expr_topic_status
  ON nodes(account_id, json_extract(properties, '$.topic_status'))
  WHERE kind = 'Topic';

-- ============================================================================
-- 2. nodes: source_id on SourceSpan (used in span existence checks)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nodes_expr_source_id
  ON nodes(account_id, json_extract(properties, '$.source_id'))
  WHERE kind = 'SourceSpan';

-- ============================================================================
-- 3. nodes: hub_score on Phrase (used in countHighValueMentions loop)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nodes_expr_hub_score
  ON nodes(account_id, CAST(json_extract(properties, '$.metadata.hub_score') AS REAL))
  WHERE kind = 'Phrase';

-- ============================================================================
-- 4. nodes: title on Source (used in computeHeadingBoost LIKE scan)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nodes_expr_title_lower
  ON nodes(account_id, LOWER(json_extract(properties, '$.title')))
  WHERE kind = 'Source';

-- ============================================================================
-- 5. nodes: principal_kind on Principal (used in principal listing filters)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nodes_expr_principal_kind
  ON nodes(account_id, json_extract(properties, '$.principal_kind'))
  WHERE kind = 'Principal';

-- ============================================================================
-- 6. nodes: source_role (used in workspace route filters)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nodes_expr_source_role
  ON nodes(account_id, json_extract(properties, '$.source_role'))
  WHERE kind IN ('Source', 'SourceDoc');

-- ============================================================================
-- 7. nodes: import metadata (used in post-import source lookups)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_nodes_expr_import_id
  ON nodes(account_id, json_extract(properties, '$.metadata.import_id'))
  WHERE kind = 'Source';

CREATE INDEX IF NOT EXISTS idx_nodes_expr_import_batch
  ON nodes(account_id, json_extract(properties, '$.metadata.import_batch'))
  WHERE kind = 'Source';
