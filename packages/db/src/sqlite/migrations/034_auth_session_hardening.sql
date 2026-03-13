-- Auth/session hardening
-- - Move session and password-reset persistence to hashed token storage.
-- - Add token-family and revocation fields for refresh rotation semantics.

ALTER TABLE sessions ADD COLUMN token_hash TEXT;
ALTER TABLE sessions ADD COLUMN token_family_id TEXT;
ALTER TABLE sessions ADD COLUMN parent_session_id TEXT;
ALTER TABLE sessions ADD COLUMN revoked_at INTEGER;
ALTER TABLE sessions ADD COLUMN revoked_reason TEXT;

UPDATE sessions
SET token_hash = COALESCE(token_hash, token)
WHERE token_hash IS NULL;

UPDATE sessions
SET token_family_id = COALESCE(token_family_id, id)
WHERE token_family_id IS NULL OR token_family_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_family ON sessions(token_family_id);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions(revoked_at);

ALTER TABLE password_reset_tokens ADD COLUMN token_hash TEXT;

UPDATE password_reset_tokens
SET token_hash = COALESCE(token_hash, token)
WHERE token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
  ON password_reset_tokens(token_hash);
