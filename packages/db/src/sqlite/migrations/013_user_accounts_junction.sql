-- Migration 013: Create user_accounts junction table
-- Purpose: Enable many-to-many relationships between users and accounts
-- Users can now belong to multiple accounts with different roles per account

-- ============================================================================
-- PART 1: Create junction table for user-account memberships
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,

  -- Role within THIS account (user can have different roles in different accounts)
  permission_level TEXT NOT NULL CHECK(permission_level IN ('junior', 'senior', 'leader', 'admin')),
  role_rank INTEGER NOT NULL DEFAULT 1,  -- 1=junior, 2=senior, 3=leader, 4=admin
  role_overrides TEXT,  -- JSON: account-specific capability overrides

  -- Membership metadata
  invited_by TEXT,  -- User who invited this member
  status TEXT CHECK(status IN ('pending', 'active', 'suspended', 'left')) DEFAULT 'active',
  invited_at INTEGER,
  joined_at INTEGER NOT NULL,
  last_accessed INTEGER,  -- Track when user last worked in this account

  -- Audit trail
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Constraints
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id),
  UNIQUE(user_id, account_id)  -- User can join each account once
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_accounts_user ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_account ON user_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_status ON user_accounts(status);
CREATE INDEX IF NOT EXISTS idx_user_accounts_role ON user_accounts(account_id, permission_level);

-- ============================================================================
-- PART 2: Create invitations table for account invites
-- ============================================================================

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  invited_email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK(permission_level IN ('junior', 'senior', 'leader', 'admin')),
  invitation_code TEXT NOT NULL UNIQUE,  -- Secure token for acceptance
  message TEXT,  -- Optional personal message
  status TEXT CHECK(status IN ('pending', 'accepted', 'declined', 'expired')) DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_invitations_account ON invitations(account_id);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(invitation_code);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- ============================================================================
-- PART 3: Create locks table for optimistic locking
-- ============================================================================

CREATE TABLE IF NOT EXISTS locks (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('node', 'edge')),
  resource_id TEXT NOT NULL,
  locked_by TEXT NOT NULL,  -- user_id
  locked_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lock_type TEXT CHECK(lock_type IN ('read', 'write')) DEFAULT 'write',

  FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_locks_resource ON locks(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_locks_user ON locks(locked_by);
CREATE INDEX IF NOT EXISTS idx_locks_expires ON locks(expires_at);

-- ============================================================================
-- PART 4: Enhance accounts table
-- ============================================================================

-- Add optional per-account password and settings
ALTER TABLE accounts ADD COLUMN account_password_hash TEXT;
ALTER TABLE accounts ADD COLUMN require_account_password INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN allow_email_invites INTEGER DEFAULT 1;
ALTER TABLE accounts ADD COLUMN max_members INTEGER;
ALTER TABLE accounts ADD COLUMN visibility TEXT CHECK(visibility IN ('private', 'invite-only', 'public')) DEFAULT 'invite-only';
ALTER TABLE accounts ADD COLUMN join_code TEXT;  -- UNIQUE constraint added via index below
ALTER TABLE accounts ADD COLUMN owner_user_id TEXT;
ALTER TABLE accounts ADD COLUMN created_from_template TEXT;

-- Create unique index for join_code (alternative to UNIQUE constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_join_code ON accounts(join_code) WHERE join_code IS NOT NULL;

-- ============================================================================
-- PART 5: Enhance sessions table for account switching
-- ============================================================================

ALTER TABLE sessions ADD COLUMN operating_account_id TEXT;  -- Current working account
ALTER TABLE sessions ADD COLUMN available_accounts TEXT;  -- JSON array of accessible account IDs
ALTER TABLE sessions ADD COLUMN last_account_switch INTEGER;
ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN last_active INTEGER;

CREATE INDEX IF NOT EXISTS idx_sessions_operating ON sessions(operating_account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(last_active);

-- ============================================================================
-- PART 6: Enhance users table for M:N model
-- ============================================================================

-- Rename old account_id to deprecated_account_id (backward compatibility)
ALTER TABLE users RENAME COLUMN account_id TO deprecated_account_id;

-- Add new user-level fields
ALTER TABLE users ADD COLUMN primary_account_id TEXT;  -- Default/home account for UX
ALTER TABLE users ADD COLUMN last_login_account_id TEXT;  -- Restore last-used account
ALTER TABLE users ADD COLUMN global_preferences TEXT;  -- JSON: user preferences across all accounts
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- ============================================================================
-- PART 7: Migrate existing users to user_accounts junction table
-- ============================================================================

INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, joined_at, created_at, updated_at, status)
SELECT
  'ua_' || u.id AS id,
  u.id AS user_id,
  u.deprecated_account_id AS account_id,
  COALESCE(u.permission_level, 'junior') AS permission_level,
  CASE COALESCE(u.permission_level, 'junior')
    WHEN 'junior' THEN 1
    WHEN 'senior' THEN 2
    WHEN 'leader' THEN 3
    WHEN 'admin' THEN 4
    ELSE 1
  END AS role_rank,
  u.created_at AS joined_at,
  u.created_at AS created_at,
  u.updated_at AS updated_at,
  'active' AS status
FROM users u
WHERE u.deprecated_account_id IS NOT NULL;

-- Set primary_account_id from deprecated_account_id
UPDATE users SET primary_account_id = deprecated_account_id WHERE deprecated_account_id IS NOT NULL;
UPDATE users SET last_login_account_id = deprecated_account_id WHERE deprecated_account_id IS NOT NULL;

-- Set account owner_user_id (find first admin user for each account)
UPDATE accounts
SET owner_user_id = (
  SELECT u.id
  FROM users u
  WHERE u.deprecated_account_id = accounts.id
    AND u.permission_level = 'admin'
  LIMIT 1
);

-- ============================================================================
-- PART 8: Update existing sessions for account context
-- ============================================================================

UPDATE sessions
SET operating_account_id = (
  SELECT deprecated_account_id
  FROM users
  WHERE users.id = sessions.user_id
);

UPDATE sessions
SET available_accounts = json_array(operating_account_id)
WHERE operating_account_id IS NOT NULL;

UPDATE sessions
SET last_active = CAST(strftime('%s', 'now') * 1000 AS INTEGER);

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================

-- Verify migration counts
-- SELECT 'user_accounts created' AS check, COUNT(*) AS count FROM user_accounts;
-- SELECT 'users migrated' AS check, COUNT(*) AS count FROM users WHERE deprecated_account_id IS NOT NULL;
-- SELECT 'accounts with owners' AS check, COUNT(*) AS count FROM accounts WHERE owner_user_id IS NOT NULL;
-- SELECT 'sessions updated' AS check, COUNT(*) AS count FROM sessions WHERE operating_account_id IS NOT NULL;
