-- Migration 020: Add metadata column to upload_sessions table
-- Purpose: Store import configuration for chunked uploads so it can be used after assembly
-- Author: AI Agent (Chunked Upload Integration - Phase 1)
-- Date: 2025-11-17

-- Add metadata column to upload_sessions
ALTER TABLE upload_sessions ADD COLUMN metadata TEXT;

-- Verify migration
-- Expected: upload_sessions table has metadata column
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='upload_sessions';
-- Should include: metadata TEXT
