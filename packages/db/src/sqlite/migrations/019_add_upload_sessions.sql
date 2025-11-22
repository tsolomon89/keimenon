-- Migration 019: Add upload_sessions table for chunked file uploads
-- Purpose: Enable resumable chunked uploads with session tracking and progress monitoring
-- Author: AI Agent (Chunked Upload System)
-- Date: 2025-11-15

-- Create upload_sessions table
CREATE TABLE IF NOT EXISTS upload_sessions (
  -- Primary identification
  id TEXT PRIMARY KEY,                    -- ULID format (upl_xxxxxxxxxxxxxxxxxxxx)

  -- Tenancy & ownership
  account_id TEXT NOT NULL,               -- Multi-tenant isolation
  user_id TEXT NOT NULL,                  -- User who initiated upload
  job_id TEXT,                            -- Associated import job (nullable - set after assembly)

  -- File metadata
  file_name TEXT NOT NULL,                -- Original filename
  file_size INTEGER NOT NULL,             -- Total file size in bytes (up to 2GB)
  mime_type TEXT,                         -- MIME type (application/json, etc.)

  -- Chunking configuration
  chunk_size INTEGER NOT NULL DEFAULT 10485760,  -- 10MB chunks (local-optimized)
  total_chunks INTEGER NOT NULL,          -- Calculated: ceil(file_size / chunk_size)

  -- Progress tracking
  chunks_received TEXT NOT NULL DEFAULT '{}',  -- JSON: {"0": true, "1": true, ...}
  chunks_path TEXT NOT NULL,              -- Temp directory for chunk storage

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'uploading',  -- uploading | assembling | completed | failed | expired
  error_message TEXT,                     -- Error details if status=failed

  -- Timestamps
  created_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,            -- Updated on each chunk receipt
  expires_at INTEGER NOT NULL,            -- Auto-expire after 4 hours (14400000ms)
  completed_at INTEGER,                   -- When assembly completed

  -- Metadata
  is_local BOOLEAN DEFAULT 1,             -- Always true for local uploads
  data_tag TEXT DEFAULT 'real',           -- For test isolation
  metadata TEXT,                          -- Optional JSON metadata (e.g., import config)

  -- Foreign key constraints
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL  -- Nullable FK
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_upload_sessions_account ON upload_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_job ON upload_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_data_tag ON upload_sessions(data_tag);

-- Composite index for cleanup queries (expired sessions)
CREATE INDEX IF NOT EXISTS idx_upload_sessions_cleanup
  ON upload_sessions(status, expires_at)
  WHERE status IN ('uploading', 'assembling');

-- Verify migration
-- Expected: upload_sessions table created with all columns and indexes
-- SELECT name FROM sqlite_master WHERE type='table' AND name='upload_sessions';
-- Should return: upload_sessions
