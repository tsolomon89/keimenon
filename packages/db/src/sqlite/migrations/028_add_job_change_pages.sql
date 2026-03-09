-- Migration 028: Add paged change tracker storage for large job state payloads
-- Date: 2026-03-05
-- Purpose:
--   - Prevent unbounded growth of jobs.state_data.changeTracker arrays
--   - Store large created/deleted ID lists in paged side-table

CREATE TABLE IF NOT EXISTS job_change_pages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK(page_type IN ('nodesCreated', 'edgesCreated', 'nodesDeleted', 'edgesDeleted')),
  page_index INTEGER NOT NULL,
  ids_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(job_id, page_type, page_index),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_change_pages_job ON job_change_pages(job_id);
CREATE INDEX IF NOT EXISTS idx_job_change_pages_account ON job_change_pages(account_id);
CREATE INDEX IF NOT EXISTS idx_job_change_pages_type ON job_change_pages(page_type);
