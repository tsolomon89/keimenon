-- Dedupe evidence role-tracking support.
-- Persists per-candidate role counts used for evidence scoring/backfills.

CREATE TABLE IF NOT EXISTS dedupe_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  primary_node_id TEXT NOT NULL,
  duplicate_node_id TEXT NOT NULL,
  similarity REAL NOT NULL,
  role_user_count INTEGER NOT NULL DEFAULT 0,
  role_assistant_count INTEGER NOT NULL DEFAULT 0,
  role_system_count INTEGER NOT NULL DEFAULT 0,
  role_unknown_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dedupe_evidence_account ON dedupe_evidence(account_id);
CREATE INDEX IF NOT EXISTS idx_dedupe_evidence_primary ON dedupe_evidence(primary_node_id);
CREATE INDEX IF NOT EXISTS idx_dedupe_evidence_duplicate ON dedupe_evidence(duplicate_node_id);
CREATE INDEX IF NOT EXISTS idx_dedupe_evidence_similarity ON dedupe_evidence(similarity DESC);

UPDATE dedupe_evidence
SET
  role_user_count = COALESCE(role_user_count, 0),
  role_assistant_count = COALESCE(role_assistant_count, 0),
  role_system_count = COALESCE(role_system_count, 0),
  role_unknown_count = COALESCE(role_unknown_count, 0),
  updated_at = CASE WHEN updated_at IS NULL THEN CAST(strftime('%s', 'now') AS INTEGER) * 1000 ELSE updated_at END;
