-- Migration 039: Bulk Insert Quarantine
-- Added for Epic 3: Bulk Insert Pipeline to support stage-aware retry and quarantine.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS bulk_insert_quarantine (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  import_id TEXT,
  row_kind TEXT NOT NULL CHECK(row_kind IN ('node', 'edge', 'source_span', 'phrase', 'packet', 'atomic_unit')),
  row_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  error_message TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_quarantine_account ON bulk_insert_quarantine(account_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_batch ON bulk_insert_quarantine(batch_id);

COMMIT;
