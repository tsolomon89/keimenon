-- =============================================================================
-- AUTH TABLES
-- =============================================================================

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK(account_type IN ('admin', 'client')),
  account_class TEXT NOT NULL CHECK(account_class IN ('free', 'professional', 'business')),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  account_password_hash TEXT,
  require_account_password INTEGER DEFAULT 0,
  allow_email_invites INTEGER DEFAULT 1,
  max_members INTEGER,
  visibility TEXT CHECK(visibility IN ('private', 'invite-only', 'public')) DEFAULT 'invite-only',
  join_code TEXT,
  owner_user_id TEXT,
  created_from_template TEXT
);

-- Users table (M:N with accounts via user_accounts junction)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  name TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK(permission_level IN ('junior', 'senior', 'leader', 'admin')),
  user_class TEXT NOT NULL CHECK(user_class IN ('person', 'agent')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  primary_account_id TEXT,
  last_login_account_id TEXT,
  global_preferences TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0
);

-- User-Account M:N Junction Table
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK(permission_level IN ('junior', 'senior', 'leader', 'admin')),
  role_rank INTEGER NOT NULL DEFAULT 1,
  role_overrides TEXT,
  invited_by TEXT,
  status TEXT CHECK(status IN ('pending', 'active', 'suspended', 'left')) DEFAULT 'active',
  invited_at INTEGER,
  joined_at INTEGER NOT NULL,
  last_accessed INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id),
  UNIQUE(user_id, account_id)
);

-- Account links table (admin CRM relationships)
CREATE TABLE IF NOT EXISTS account_links (
  id TEXT PRIMARY KEY,
  admin_account_id TEXT NOT NULL,
  client_account_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'manages',
  linked_at INTEGER NOT NULL,
  linked_by TEXT,
  notes TEXT,
  FOREIGN KEY (admin_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (client_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(admin_account_id, client_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_links_admin ON account_links(admin_account_id);
CREATE INDEX IF NOT EXISTS idx_account_links_client ON account_links(client_account_id);

-- Admin principal safeguards
CREATE TRIGGER IF NOT EXISTS trg_protect_admin_account_delete
BEFORE DELETE ON accounts
FOR EACH ROW
WHEN old.account_type = 'admin'
BEGIN
  SELECT RAISE(ABORT, 'Protected admin account cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_admin_account_demote
BEFORE UPDATE OF account_type ON accounts
FOR EACH ROW
WHEN old.account_type = 'admin' AND new.account_type <> 'admin'
BEGIN
  SELECT RAISE(ABORT, 'Protected admin account cannot be demoted');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_admin_user_delete
BEFORE DELETE ON users
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM user_accounts ua
  JOIN accounts a ON a.id = ua.account_id
  WHERE ua.user_id = old.id
    AND a.account_type = 'admin'
)
BEGIN
  SELECT RAISE(ABORT, 'Protected admin user cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_admin_membership_delete
BEFORE DELETE ON user_accounts
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM accounts a
  WHERE a.id = old.account_id
    AND a.account_type = 'admin'
)
BEGIN
  SELECT RAISE(ABORT, 'Protected admin membership cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_admin_membership_reassign
BEFORE UPDATE OF user_id, account_id ON user_accounts
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM accounts a
  WHERE a.id = old.account_id
    AND a.account_type = 'admin'
)
BEGIN
  SELECT RAISE(ABORT, 'Protected admin membership cannot be reassigned');
END;

-- Sessions table (CRITICAL: includes data_tag for test isolation)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  operating_account_id TEXT,
  available_accounts TEXT,
  last_account_switch INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  last_active INTEGER,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Login attempts table (for account lockout tracking)
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  attempted_at INTEGER NOT NULL,
  user_agent TEXT,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual'))
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_account_id TEXT NOT NULL,
  target_account_id TEXT,
  action TEXT NOT NULL CHECK(action IN ('read', 'create', 'update', 'delete', 'reset')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  mode TEXT NOT NULL CHECK(mode IN ('native', 'crm', 'nested')),
  success INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Password reset tokens table (for secure password reset flow)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Settings tables
CREATE TABLE IF NOT EXISTS settings_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  control_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('defaults', 'org', 'workspace', 'role', 'user', 'view', 'component')),
  scope_id TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  UNIQUE(control_id, scope, scope_id)
);

CREATE TABLE IF NOT EXISTS settings_changes (
  id TEXT PRIMARY KEY,
  control_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  reason TEXT,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual'))
);

-- =============================================================================
-- GRAPH TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation', 'UserNode', 'AccountNode', 'Board',
    'SourceDoc', 'Lexeme', 'Phrase', 'Topic', 'VerifiedSource', 'VerifiedClaim', 'AgentNode',
    'CanonicalDoc', 'DuplicateCluster', 'Evidence', 'Principal', 'ConversationThread',
    'SourceSpan', 'Packet', 'AtomicUnit'
  )),
  properties TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  content_hash TEXT,
  canonical_content TEXT,
  is_duplicate INTEGER DEFAULT 0,
  original_node_id TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
    'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
    'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
    'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
    'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE', 'OWNER_OF',
    'EXACT_DUP', 'NEAR_DUP', 'SPAN_CONTAINS', 'CLUSTER_MEMBER', 'MENTIONS', 'ABOUT',
    'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC', 'SOURCED_FROM', 'DERIVED_FROM', 'CANDIDATE_DUP',
    'CREATED_BY_AGENT', 'EVIDENCE_FOR', 'CREATED_BY', 'ATTACHED_TO', 'PINS_CONTEXT',
    'INITIATED_BY', 'PARTICIPATED_IN', 'PRODUCED_BY',
    'HAS_SPAN', 'OCCURS_IN_SPAN', 'COMPOSED_OF_ATOMIC'
  )),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  properties TEXT,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS policy_profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  can_upload INTEGER NOT NULL DEFAULT 1,
  can_run_tools INTEGER NOT NULL DEFAULT 0,
  can_import_web INTEGER NOT NULL DEFAULT 0,
  can_own_account INTEGER NOT NULL DEFAULT 0,
  can_approve_runs INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, name)
);

-- =============================================================================
-- JOBS TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('import', 'delete', 'export', 'analyze')),
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  config TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'blocked')),
  state_data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  idempotency_key TEXT UNIQUE,
  concurrency_group TEXT,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'job.queued', 'job.started', 'job.progress',
    'job.item.started', 'job.item.completed', 'job.item.failed',
    'job.succeeded', 'job.failed', 'job.canceled', 'job.blocked'
  )),
  data TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  UNIQUE(job_id, sequence_number),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_data TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  sequence_number INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

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

-- Upload sessions table (chunked file upload with resumability)
CREATE TABLE IF NOT EXISTS upload_sessions (
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

CREATE INDEX IF NOT EXISTS idx_upload_sessions_account ON upload_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_job ON upload_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_data_tag ON upload_sessions(data_tag);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_cleanup ON upload_sessions(status, expires_at) WHERE status IN ('uploading', 'assembling');

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Auth Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_class ON accounts(account_class);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_user ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_account ON user_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_status ON user_accounts(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_data_tag ON sessions(data_tag);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_ip ON login_attempts(email, ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_data_tag ON login_attempts(data_tag);

-- Audit Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_account ON audit_log(actor_account_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_account ON audit_log(target_account_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_type ON audit_log(resource_type);

-- Settings Indexes
CREATE INDEX IF NOT EXISTS idx_settings_config_control ON settings_config(control_id);
CREATE INDEX IF NOT EXISTS idx_settings_config_scope ON settings_config(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_settings_config_data_tag ON settings_config(data_tag);
CREATE INDEX IF NOT EXISTS idx_settings_changes_control ON settings_changes(control_id);
CREATE INDEX IF NOT EXISTS idx_settings_changes_time ON settings_changes(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_changes_data_tag ON settings_changes(data_tag);

-- Graph Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
CREATE INDEX IF NOT EXISTS idx_nodes_created_by ON nodes(created_by);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_account_tag ON nodes(account_id, data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
CREATE INDEX IF NOT EXISTS idx_nodes_account_hash ON nodes(account_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
CREATE INDEX IF NOT EXISTS idx_edges_created_by ON edges(created_by);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_to ON edges(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_edges_created ON edges(created_at);
CREATE INDEX IF NOT EXISTS idx_edges_data_tag ON edges(data_tag);
CREATE INDEX IF NOT EXISTS idx_edges_account_tag ON edges(account_id, data_tag);
CREATE INDEX IF NOT EXISTS idx_policy_profiles_account ON policy_profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_nodes_spine ON nodes(kind) WHERE kind IN ('Lexeme', 'Phrase', 'Topic');
CREATE INDEX IF NOT EXISTS idx_nodes_verified ON nodes(kind) WHERE kind IN ('VerifiedSource', 'VerifiedClaim');
CREATE INDEX IF NOT EXISTS idx_nodes_objective_claim_status
ON nodes(kind, json_extract(properties, '$.status'))
WHERE kind = 'ObjectiveClaim';
CREATE INDEX IF NOT EXISTS idx_nodes_agent ON nodes(kind) WHERE kind IN ('AgentNode', 'CanonicalDoc', 'DuplicateCluster', 'Evidence');
CREATE INDEX IF NOT EXISTS idx_nodes_principal ON nodes(kind) WHERE kind = 'Principal';
CREATE INDEX IF NOT EXISTS idx_nodes_conversation ON nodes(kind) WHERE kind = 'ConversationThread';
CREATE INDEX IF NOT EXISTS idx_nodes_actors ON nodes(kind) WHERE kind IN ('Principal', 'UserNode', 'AgentNode');
CREATE INDEX IF NOT EXISTS idx_nodes_pro_import ON nodes(kind) WHERE kind IN ('SourceSpan', 'Packet', 'AtomicUnit');
CREATE INDEX IF NOT EXISTS idx_edges_spine ON edges(kind) WHERE kind IN ('MENTIONS', 'ABOUT', 'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC');
CREATE INDEX IF NOT EXISTS idx_edges_verified ON edges(kind) WHERE kind IN ('SOURCED_FROM', 'VERIFIED_BY');
CREATE INDEX IF NOT EXISTS idx_edges_agent ON edges(kind) WHERE kind IN ('DERIVED_FROM', 'CANDIDATE_DUP', 'CREATED_BY_AGENT', 'EVIDENCE_FOR');
CREATE INDEX IF NOT EXISTS idx_edges_workspace ON edges(kind) WHERE kind IN ('CREATED_BY', 'ATTACHED_TO', 'PINS_CONTEXT');
CREATE INDEX IF NOT EXISTS idx_edges_conversation ON edges(kind) WHERE kind IN ('INITIATED_BY', 'PARTICIPATED_IN');
CREATE INDEX IF NOT EXISTS idx_edges_run_attribution ON edges(kind) WHERE kind = 'PRODUCED_BY';
CREATE INDEX IF NOT EXISTS idx_edges_pro_import ON edges(kind) WHERE kind IN ('HAS_SPAN', 'OCCURS_IN_SPAN', 'COMPOSED_OF_ATOMIC');

-- Job Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_data_tag ON jobs(data_tag);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_timestamp ON job_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_job_events_data_tag ON job_events(data_tag);
CREATE INDEX IF NOT EXISTS idx_job_change_pages_job ON job_change_pages(job_id);
CREATE INDEX IF NOT EXISTS idx_job_change_pages_account ON job_change_pages(account_id);
CREATE INDEX IF NOT EXISTS idx_job_change_pages_type ON job_change_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_job_items_job ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);
CREATE INDEX IF NOT EXISTS idx_job_items_data_tag ON job_items(data_tag);

-- =============================================================================
-- FULL-TEXT SEARCH
-- =============================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(id UNINDEXED, content);

CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
  INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE id = old.id;
END;

-- FTS5 Duplicate Detection (Added in Migration 022)
-- Purpose: Fast similarity search for near-duplicate message detection
-- Strategy: Trigram tokenization for fuzzy matching (typo tolerance)
-- Performance: O(log n) candidate search vs O(n²) brute force
-- Usage: See apps/api/src/services/duplicate-detection-fts5.ts
--
-- Note: This table is automatically populated via triggers on nodes table.
--       Only Message nodes with canonical_content are indexed.
--       Trigrams enable fuzzy matching: "hello" → ["hel", "ell", "llo"]
--
-- See: Migration 022 for full implementation details and performance notes
-- See: DUPLICATE_DETECTION_BASELINE_METRICS.md for performance benchmarks
--
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts_duplicate USING fts5(
  node_id UNINDEXED,          -- Message node reference (not FTS indexed)
  content,                     -- Canonical message content (FTS indexed with trigrams)
  account_id UNINDEXED,        -- Multi-tenant isolation (filter in application layer)
  tokenize = 'trigram'         -- Trigram tokenizer for fuzzy/typo-tolerant matching
);

CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_insert
AFTER INSERT ON nodes
WHEN new.kind = 'Message' AND new.canonical_content IS NOT NULL
BEGIN
  INSERT INTO messages_fts_duplicate(node_id, content, account_id)
  VALUES (new.id, new.canonical_content, new.account_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_update
AFTER UPDATE ON nodes
WHEN new.kind = 'Message'
  AND (old.canonical_content != new.canonical_content OR old.canonical_content IS NULL)
  AND new.canonical_content IS NOT NULL
BEGIN
  DELETE FROM messages_fts_duplicate WHERE node_id = old.id;
  INSERT INTO messages_fts_duplicate(node_id, content, account_id)
  VALUES (new.id, new.canonical_content, new.account_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_delete
AFTER DELETE ON nodes
WHEN old.kind = 'Message'
BEGIN
  DELETE FROM messages_fts_duplicate WHERE node_id = old.id;
END;

-- =============================================================================
-- METADATA
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('version', '3.0');
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('created_at', datetime('now'));
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('updated_at', datetime('now'));
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('features', 'clean_m2n_schema,audit_log,settings,jobs');
