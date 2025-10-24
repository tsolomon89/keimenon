-- Migration 008: Unified Background Jobs System
-- Creates tables for the unified job orchestration system
-- Related: Product Directive - Jobs as first-class citizens
--
-- Tables:
-- - jobs: Main job records with state machine status
-- - job_events: Append-only event log for audit trail
-- - job_items: Individual items within a job (for batch processing)
-- - job_idempotency: Idempotency key tracking for duplicate prevention
--
-- See: apps/api/src/modules/jobs/domain/Job.ts

-- ============================================================================
-- Jobs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('import', 'delete', 'export', 'analyze')),
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,

  -- Job configuration (JSON)
  config TEXT NOT NULL,

  -- State machine status
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'blocked')),

  -- State data (JSON containing timestamps, error details, etc.)
  state_data TEXT NOT NULL,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Idempotency and concurrency
  idempotency_key TEXT UNIQUE,
  concurrency_group TEXT,

  -- Data tagging (test vs production data)
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),

  -- Foreign keys
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- Job Events Table (Event Sourcing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,

  -- Event type
  type TEXT NOT NULL CHECK(type IN (
    'job.queued', 'job.started', 'job.progress',
    'job.item.started', 'job.item.completed', 'job.item.failed',
    'job.succeeded', 'job.failed', 'job.canceled', 'job.blocked'
  )),

  -- Event data (JSON)
  data TEXT NOT NULL,

  -- Sequencing
  sequence_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,

  -- Account isolation
  account_id TEXT NOT NULL,

  -- Unique constraint: one sequence number per job
  UNIQUE(job_id, sequence_number),

  -- Foreign keys
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- ============================================================================
-- Job Items Table (for batch processing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,

  -- Item identification
  item_type TEXT NOT NULL, -- e.g., 'file', 'conversation', 'node'
  item_data TEXT NOT NULL, -- JSON with item-specific data

  -- Item status
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

  -- Processing details
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT, -- JSON with error details if failed

  -- Ordering
  sequence_number INTEGER NOT NULL,

  -- Account isolation
  account_id TEXT NOT NULL,

  -- Unique constraint: one sequence number per job
  UNIQUE(job_id, sequence_number),

  -- Foreign keys
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- ============================================================================
-- Job Idempotency Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,

  -- Foreign keys
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Jobs table indexes
CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_account_status ON jobs(account_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_concurrency_group ON jobs(concurrency_group) WHERE concurrency_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_data_tag ON jobs(data_tag);

-- Job events indexes
CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_account ON job_events(account_id);
CREATE INDEX IF NOT EXISTS idx_job_events_timestamp ON job_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_job_events_type ON job_events(type);
CREATE INDEX IF NOT EXISTS idx_job_events_job_sequence ON job_events(job_id, sequence_number);

-- Job items indexes
CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_account ON job_items(account_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);
CREATE INDEX IF NOT EXISTS idx_job_items_job_status ON job_items(job_id, status);

-- Job idempotency indexes
CREATE INDEX IF NOT EXISTS idx_job_idempotency_account ON job_idempotency(account_id);
CREATE INDEX IF NOT EXISTS idx_job_idempotency_job ON job_idempotency(job_id);

-- ============================================================================
-- Triggers for Automatic Timestamps
-- ============================================================================

-- Update updated_at on job changes
CREATE TRIGGER IF NOT EXISTS trg_jobs_updated_at
AFTER UPDATE ON jobs
BEGIN
  UPDATE jobs SET updated_at = (strftime('%s', 'now') * 1000)
  WHERE id = NEW.id;
END;

-- ============================================================================
-- Concurrency Control Views
-- ============================================================================

-- View: Active jobs by concurrency group
CREATE VIEW IF NOT EXISTS active_jobs_by_group AS
SELECT
  concurrency_group,
  COUNT(*) as active_count,
  GROUP_CONCAT(id) as job_ids
FROM jobs
WHERE status IN ('queued', 'running', 'blocked')
  AND concurrency_group IS NOT NULL
GROUP BY concurrency_group;

-- View: Job progress summary
CREATE VIEW IF NOT EXISTS job_progress_summary AS
SELECT
  j.id,
  j.type,
  j.status,
  j.account_id,
  j.created_at,
  COUNT(ji.id) as total_items,
  SUM(CASE WHEN ji.status = 'completed' THEN 1 ELSE 0 END) as completed_items,
  SUM(CASE WHEN ji.status = 'failed' THEN 1 ELSE 0 END) as failed_items,
  SUM(CASE WHEN ji.status = 'processing' THEN 1 ELSE 0 END) as processing_items
FROM jobs j
LEFT JOIN job_items ji ON j.id = ji.job_id
GROUP BY j.id;

-- ============================================================================
-- Comments
-- ============================================================================
-- This migration creates the complete infrastructure for the unified job system
-- All tables include account_id for multi-tenant isolation
-- Event log is append-only for full audit trail
-- Concurrency groups enable exclusive locks for operations like deletes
-- Idempotency keys prevent duplicate job creation
