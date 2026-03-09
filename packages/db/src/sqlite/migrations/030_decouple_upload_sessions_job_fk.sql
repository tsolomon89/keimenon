-- Migration 030: Decouple upload_sessions.job_id from jobs foreign key
-- Purpose: Jobs now persist in a dedicated jobs database in some runtimes (including test isolation),
-- so upload_sessions must store job_id as a plain reference without same-DB FK enforcement.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS upload_sessions_v030 (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  job_id TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  chunk_size INTEGER NOT NULL DEFAULT 10485760,
  total_chunks INTEGER NOT NULL,
  chunks_received TEXT NOT NULL DEFAULT '[]',
  chunks_path TEXT NOT NULL,
  assembled_path TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading', 'assembling', 'completed', 'failed', 'expired', 'cancelled')),
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  is_local BOOLEAN DEFAULT 1,
  data_tag TEXT DEFAULT 'real',
  metadata TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO upload_sessions_v030 (
  id,
  account_id,
  user_id,
  job_id,
  file_name,
  file_size,
  mime_type,
  chunk_size,
  total_chunks,
  chunks_received,
  chunks_path,
  assembled_path,
  status,
  error_message,
  created_at,
  updated_at,
  expires_at,
  completed_at,
  is_local,
  data_tag,
  metadata
)
SELECT
  id,
  account_id,
  user_id,
  job_id,
  file_name,
  file_size,
  mime_type,
  chunk_size,
  total_chunks,
  chunks_received,
  chunks_path,
  NULL AS assembled_path,
  status,
  error_message,
  created_at,
  updated_at,
  expires_at,
  completed_at,
  is_local,
  data_tag,
  metadata
FROM upload_sessions;

DROP TABLE upload_sessions;
ALTER TABLE upload_sessions_v030 RENAME TO upload_sessions;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_account ON upload_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_job ON upload_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_data_tag ON upload_sessions(data_tag);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_cleanup
  ON upload_sessions(status, expires_at)
  WHERE status IN ('uploading', 'assembling');

PRAGMA foreign_keys = ON;
