-- Jobs Database Schema (Test Mode Only)
-- Contains ONLY job-related tables for E2E test isolation
--
-- Architecture:
--   Test Mode:
--     - Data DB (worker-0.db): nodes, edges, users, etc. (has SAVEPOINT transactions)
--     - Jobs DB (worker-0-jobs.db): jobs, job_events, job_items (NO savepoints)
--   Production:
--     - Single DB (canvas.db): all tables including jobs
--
-- This separation avoids SQLite database locking issues when creating jobs
-- inside SAVEPOINT transactions during E2E tests.

-- Jobs table: Background job state and configuration
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  config TEXT NOT NULL,
  status TEXT NOT NULL,
  state_data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  idempotency_key TEXT,
  concurrency_group TEXT,
  data_tag TEXT DEFAULT 'real'
);

-- Job events table: Event sourcing log for job state transitions
CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Job items table: Individual items processed within a job (e.g., files in import job)
CREATE TABLE IF NOT EXISTS job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_data TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  error_message TEXT,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_timestamp ON job_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);
