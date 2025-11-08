-- Migration 018: Add data_tag to all tables for test data isolation
-- Purpose: Enable comprehensive test data cleanup by marking test records with data_tag='test'
-- Author: AI Agent
-- Date: 2025-11-01

-- Add data_tag column to sessions table
ALTER TABLE sessions ADD COLUMN data_tag TEXT DEFAULT 'real';
CREATE INDEX IF NOT EXISTS idx_sessions_data_tag ON sessions(data_tag);

-- Add data_tag column to login_attempts table
ALTER TABLE login_attempts ADD COLUMN data_tag TEXT DEFAULT 'real';
CREATE INDEX IF NOT EXISTS idx_login_attempts_data_tag ON login_attempts(data_tag);

-- Add data_tag column to job_events table
ALTER TABLE job_events ADD COLUMN data_tag TEXT DEFAULT 'real';
CREATE INDEX IF NOT EXISTS idx_job_events_data_tag ON job_events(data_tag);

-- Add data_tag column to job_items table
ALTER TABLE job_items ADD COLUMN data_tag TEXT DEFAULT 'real';
CREATE INDEX IF NOT EXISTS idx_job_items_data_tag ON job_items(data_tag);

-- Add data_tag column to settings_config table
ALTER TABLE settings_config ADD COLUMN data_tag TEXT DEFAULT 'real';
CREATE INDEX IF NOT EXISTS idx_settings_config_data_tag ON settings_config(data_tag);

-- Add data_tag column to settings_changes table
ALTER TABLE settings_changes ADD COLUMN data_tag TEXT DEFAULT 'real';
CREATE INDEX IF NOT EXISTS idx_settings_changes_data_tag ON settings_changes(data_tag);

-- Add data_tag column to audit_log table (optional - audits are typically preserved)
-- Uncomment if you want to clean up test audit logs
-- ALTER TABLE audit_log ADD COLUMN data_tag TEXT DEFAULT 'real';
-- CREATE INDEX IF NOT EXISTS idx_audit_log_data_tag ON audit_log(data_tag);

-- Update all existing rows to have data_tag='real' (explicit, even though DEFAULT handles it)
-- This ensures consistency for any rows created before migration
UPDATE sessions SET data_tag = 'real' WHERE data_tag IS NULL;
UPDATE login_attempts SET data_tag = 'real' WHERE data_tag IS NULL;
UPDATE job_events SET data_tag = 'real' WHERE data_tag IS NULL;
UPDATE job_items SET data_tag = 'real' WHERE data_tag IS NULL;
UPDATE settings_config SET data_tag = 'real' WHERE data_tag IS NULL;
UPDATE settings_changes SET data_tag = 'real' WHERE data_tag IS NULL;

-- Verify migration
-- Expected: All tables now have data_tag column with 'real' as default
-- SELECT name FROM pragma_table_info('sessions') WHERE name = 'data_tag';
-- Should return: data_tag
