-- Migration 020: Add indexes for job system performance
-- Purpose: Optimize job polling, filtering, and status queries
-- Impact: Reduces query time from O(n) to O(log n) for job lookups
--
-- Performance improvements:
-- - Worker pool polling (status='queued') - 10-100x faster with 1000+ jobs
-- - Admin job filtering (type + status) - 5-50x faster
-- - Account job list (account_id + status) - 10-100x faster
--
-- Related: Product Directive - "Enterprise-scale job system (100+ concurrent jobs)"

-- ============================================================================
-- Index 1: Job Status + Account (Worker Pool Polling)
-- ============================================================================
-- Used by: WorkerPool.pollForJobs() - finds 'queued' jobs for processing
-- Query pattern: SELECT * FROM jobs WHERE status = 'queued' AND account_id = ?
-- Benefit: Eliminates full table scan when polling for work
--
-- Without index: Scans ALL jobs in database (slow with 10k+ jobs)
-- With index: Jumps directly to queued jobs for account (fast regardless of total jobs)

CREATE INDEX IF NOT EXISTS idx_jobs_status_account
ON jobs(status, account_id);

-- ============================================================================
-- Index 2: Job Type + Status + Created (Admin Filtering & Sorting)
-- ============================================================================
-- Used by: Admin dashboard, job history, filtered job lists
-- Query pattern: SELECT * FROM jobs WHERE type = ? AND status = ? ORDER BY created_at DESC
-- Benefit: Fast filtering by job type and status with chronological sorting
--
-- Covers queries like:
-- - "Show me all failed import jobs"
-- - "Show me running delete jobs for this account"
-- - "Show me recent completed jobs"

CREATE INDEX IF NOT EXISTS idx_jobs_type_status_created
ON jobs(type, status, created_at DESC);

-- ============================================================================
-- Index 3: Job Account + Type + Status (Account-Scoped Queries)
-- ============================================================================
-- Used by: User job lists, account-specific job filtering
-- Query pattern: SELECT * FROM jobs WHERE account_id = ? AND type = ? AND status IN (...)
-- Benefit: Fast multi-tenant isolation + filtering
--
-- Critical for:
-- - Multi-tenant job isolation (prevent cross-account leakage)
-- - Account-specific job lists
-- - Per-account job summaries

CREATE INDEX IF NOT EXISTS idx_jobs_account_type_status
ON jobs(account_id, type, status);

-- ============================================================================
-- Index 4: Job Concurrency Group (Concurrency Control)
-- ============================================================================
-- Used by: StartJob use case - enforces concurrency limits per group
-- Query pattern: SELECT * FROM jobs WHERE concurrency_group = ? AND status = 'running'
-- Benefit: Fast lookup of running jobs in same concurrency group
--
-- Example: Only one delete job per account should run at a time
-- Without index: Scans all jobs to count running jobs in group
-- With index: Instant lookup of running jobs in specific group

CREATE INDEX IF NOT EXISTS idx_jobs_concurrency_group
ON jobs(concurrency_group)
WHERE concurrency_group IS NOT NULL; -- Partial index (only for jobs with concurrency groups)

-- ============================================================================
-- Index 5: Job Idempotency Key (Deduplication)
-- ============================================================================
-- Used by: EnqueueJob use case - prevents duplicate job creation
-- Query pattern: SELECT * FROM jobs WHERE idempotency_key = ?
-- Benefit: Instant duplicate detection (idempotent job enqueuing)
--
-- Use case: User clicks "Import" button twice quickly
-- Without index: Scans all jobs to find duplicate
-- With index: Instant duplicate detection, returns existing job

CREATE INDEX IF NOT EXISTS idx_jobs_idempotency_key
ON jobs(idempotency_key)
WHERE idempotency_key IS NOT NULL; -- Partial index (only for jobs with idempotency keys)

-- ============================================================================
-- Performance Notes
-- ============================================================================
-- Index selectivity (higher = better):
-- 1. idempotency_key: Very high (nearly unique)
-- 2. concurrency_group: High (few jobs per group)
-- 3. account_id + type + status: Medium-high
-- 4. status + account_id: Medium
-- 5. type + status + created_at: Medium-low
--
-- Index sizes (approximate, with 10,000 jobs):
-- - idx_jobs_status_account: ~200 KB
-- - idx_jobs_type_status_created: ~250 KB
-- - idx_jobs_account_type_status: ~300 KB
-- - idx_jobs_concurrency_group: ~50 KB (partial)
-- - idx_jobs_idempotency_key: ~100 KB (partial)
-- Total: ~900 KB (negligible compared to job data)
--
-- Query optimizer notes:
-- SQLite will automatically choose the best index for each query.
-- EXPLAIN QUERY PLAN can verify index usage.
-- Example:
--   EXPLAIN QUERY PLAN SELECT * FROM jobs WHERE status = 'queued';
--   -- Should show: SEARCH jobs USING INDEX idx_jobs_status_account
-- ============================================================================

-- Verification query (check index creation)
-- Run after migration:
-- SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jobs';
