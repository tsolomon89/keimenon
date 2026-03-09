import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { AnyNode, AnyEdge } from '@keimenon/types';
import { contentHashForNodeType, canonicalizeForNodeType } from '@keimenon/parsers';
import { MigrationRunner } from './MigrationRunner';
import {
  ImportSchemaCompatibilityResult,
  assertImportSchemaCompatibility,
} from './import-schema-compatibility';

/**
 * Safe JSON parse with error handling (bug fix #17)
 * Returns null and logs error if parsing fails instead of throwing
 */
function safeJsonParse<T>(json: string, context?: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error(`[SQLiteClient] Failed to parse JSON${context ? ` (${context})` : ''}:`, error);
    return null;
  }
}

let hasLoggedRuntimePolicy = false;

export interface SQLiteConfig {
  databasePath: string;
  readonly?: boolean;
  verbose?: boolean;
  ignoreGlobalContext?: boolean; // If true, getDatabase() returns this.db even if global.dbClient is set
}

// Embedded SQL schema - Clean M:N architecture from day 1
const SQLITE_SCHEMA = `
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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
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
`;

/**
 * SQLite client for local-first graph storage
 * Provides the canonical database client API for runtime operations
 *
 * SINGLE WRITER PATTERN:
 * - Direct writes are restricted to workers via DatabaseWriteQueue
 * - Routes and controllers should be read-only
 * - Use allowDirectWrites flag ONLY for workers and migrations
 */
export class SQLiteClient {
  private db: Database.Database | null = null;
  private config: SQLiteConfig;
  private allowDirectWrites: boolean = false;
  private schemaInitialized: boolean = false;

  constructor(config: SQLiteConfig) {
    this.config = config;
  }

  /**
   * Enable direct writes (for workers and migrations only)
   * @internal
   */
  enableDirectWrites(): void {
    this.allowDirectWrites = true;
  }

  /**
   * Disable direct writes (default for route handlers)
   * @internal
   */
  disableDirectWrites(): void {
    this.allowDirectWrites = false;
  }

  /**
   * Assert that direct writes are allowed
   * @throws Error if direct writes are disabled
   * @internal
   */
  private assertWriteAllowed(operation: string): void {
    if (!this.allowDirectWrites) {
      throw new Error(
        `Direct database write denied: ${operation}. ` +
          'Use DatabaseWriteQueue for writes. Direct writes are only allowed in workers. ' +
          'If you are implementing a worker, call db.enableDirectWrites() first.'
      );
    }
  }

  /**
   * Connect and initialize database
   */
  async connect(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.databasePath);
      await fs.mkdir(dir, { recursive: true });

      // Open database
      this.db = new Database(this.config.databasePath, {
        readonly: this.config.readonly || false,
        verbose: this.config.verbose ? console.log : undefined,
      });

      // Enable WAL mode for better concurrency (allows concurrent reads during writes)
      this.db.pragma('journal_mode = WAL');

      // Reduce fsync frequency for better write performance (NORMAL is safe with WAL)
      this.db.pragma('synchronous = NORMAL');

      // Set busy timeout to 30 seconds (prevent SQLITE_BUSY on heavy 1GB+ ops)
      this.db.pragma('busy_timeout = 30000');

      // Increase cache size to 64MB (default is ~2MB, this reduces disk I/O)
      this.db.pragma('cache_size = -64000'); // Negative value = KB

      // Enable foreign key enforcement for multi-tenant integrity.
      this.db.pragma('foreign_keys = ON');

      if (!hasLoggedRuntimePolicy) {
        hasLoggedRuntimePolicy = true;
        const journalMode = this.db.pragma('journal_mode', { simple: true });
        const synchronous = this.db.pragma('synchronous', { simple: true });
        const busyTimeout = this.db.pragma('busy_timeout', { simple: true });
        const foreignKeys = this.db.pragma('foreign_keys', { simple: true });
        console.log(
          `[SQLiteClient] Runtime policy: journal_mode=${journalMode}, synchronous=${synchronous}, busy_timeout=${busyTimeout}, foreign_keys=${foreignKeys}`
        );
      }

      // Initialize schema
      await this.initializeSchema();

      console.log(`✅ Connected to SQLite at: ${this.config.databasePath}`);
    } catch (error) {
      console.error('❌ Failed to connect to SQLite:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (this.schemaInitialized) {
      return;
    }

    try {
      const userTableCountBeforeInit = this.getUserTableCount();
      const isFreshDatabase = userTableCountBeforeInit === 0;

      this.repairLegacyCoreTablesForSchemaBootstrap();
      this.db.exec(SQLITE_SCHEMA);
      this.repairLegacyJobTables();
      await this.runMigrations(isFreshDatabase);
      this.assertImportSchemaCompatibility();
      this.schemaInitialized = true;
      console.log('✅ SQLite schema initialized');
    } catch (error) {
      console.error('❌ Failed to initialize schema:', error);
      throw error;
    }
  }

  /**
   * Run SQL migrations.
   * For fresh databases bootstrapped from the embedded schema, mark all
   * migrations as applied instead of replaying them.
   */
  private async runMigrations(isFreshDatabase: boolean): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const migrationRunner = new MigrationRunner(this.db);
    if (isFreshDatabase) {
      await migrationRunner.markAllAvailableMigrationsApplied();
      console.log('[SQLiteClient] Fresh database detected; marked SQL migrations as applied');
      return;
    }

    const hasAppliedMigrations = migrationRunner.hasAppliedMigrations();
    if (!hasAppliedMigrations && this.isLegacyDatabaseWithoutMigrationHistory()) {
      console.warn(
        '[SQLiteClient] Legacy database without migration history detected; baselining migrations through 025 and applying 026+ only'
      );
      await migrationRunner.markMigrationsAppliedThrough('025');
    } else if (this.shouldBaselineLegacyMigrations(migrationRunner)) {
      console.warn(
        '[SQLiteClient] Legacy database with partial migration history detected; baselining missing migrations through 025'
      );
      await migrationRunner.markMigrationsAppliedThrough('025');
    }

    await migrationRunner.runPendingMigrations();
  }

  assertImportSchemaCompatibility(): ImportSchemaCompatibilityResult {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    return assertImportSchemaCompatibility(this.db);
  }

  private getUserTableCount(): number {
    if (!this.db) {
      return 0;
    }

    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'`
      )
      .get() as { count?: number } | undefined;

    return row?.count ?? 0;
  }

  private tableExists(tableName: string): boolean {
    if (!this.db) {
      return false;
    }

    const row = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(tableName) as { name?: string } | undefined;

    return !!row?.name;
  }

  private tableHasColumn(tableName: string, columnName: string): boolean {
    if (!this.db || !this.tableExists(tableName)) {
      return false;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;

    return columns.some((column) => column.name === columnName);
  }

  private ensureColumn(tableName: string, columnName: string, columnSql: string): void {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (!this.tableExists(tableName) || this.tableHasColumn(tableName, columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }

  /**
   * Bring known legacy tables up to the minimum shape required for executing
   * the embedded schema bootstrap safely.
   */
  private repairLegacyCoreTablesForSchemaBootstrap(): void {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (this.tableExists('nodes')) {
      this.ensureColumn('nodes', 'content_hash', 'content_hash TEXT');
      this.ensureColumn('nodes', 'canonical_content', 'canonical_content TEXT');
      this.ensureColumn('nodes', 'is_duplicate', 'is_duplicate INTEGER DEFAULT 0');
      this.ensureColumn('nodes', 'original_node_id', 'original_node_id TEXT');
    }
  }

  /**
   * Repair known legacy job table drift before replaying SQL migrations.
   *
   * Some older desktop DBs have `job_items` without `account_id`. Migration 008
   * creates indexes/views that assume this column exists.
   */
  private repairLegacyJobTables(): void {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (this.tableExists('job_items') && !this.tableHasColumn('job_items', 'account_id')) {
      console.warn(
        '[SQLiteClient] Repairing legacy job_items schema: adding missing account_id column'
      );

      this.db.exec(`ALTER TABLE job_items ADD COLUMN account_id TEXT`);

      if (this.tableExists('jobs') && this.tableHasColumn('jobs', 'account_id')) {
        this.db.exec(`
          UPDATE job_items
          SET account_id = (
            SELECT jobs.account_id
            FROM jobs
            WHERE jobs.id = job_items.job_id
          )
          WHERE account_id IS NULL OR account_id = ''
        `);
      }
    }
  }

  private isLegacyDatabaseWithoutMigrationHistory(): boolean {
    if (!this.db) {
      return false;
    }

    // Heuristic: DB is non-empty and already has modern account-scoped core tables,
    // but no migration records. Replaying all historical SQL migrations is unsafe.
    return (
      this.tableExists('jobs') &&
      this.tableHasColumn('jobs', 'account_id') &&
      this.tableExists('nodes') &&
      this.tableHasColumn('nodes', 'account_id')
    );
  }

  private shouldBaselineLegacyMigrations(migrationRunner: MigrationRunner): boolean {
    const applied = migrationRunner.getMigrationStatus().applied;
    if (applied.length === 0) {
      return false;
    }

    const maxAppliedVersion = applied.reduce((max, migration) => {
      const value = Number.parseInt(migration.version, 10);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);

    if (maxAppliedVersion >= 26) {
      return false;
    }

    return (
      this.tableExists('jobs') &&
      this.tableHasColumn('jobs', 'account_id') &&
      this.tableExists('nodes') &&
      this.tableHasColumn('nodes', 'account_id') &&
      this.tableExists('users') &&
      !this.tableHasColumn('users', 'deprecated_account_id')
    );
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.db) {
      // CRITICAL FIX: Force synchronous WAL checkpoint before close
      // This prevents race conditions where file deletion happens before checkpoint completes
      // TRUNCATE mode blocks until checkpoint finishes, ensuring .db-wal and .db-shm are released
      // See: docs/historical_development/e2e-test-fixes-oct-2025/fix-wal-checkpoint.md
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
        console.log('✅ WAL checkpoint completed before close');
      } catch (error: any) {
        // Log warning but don't fail - close should proceed even if checkpoint fails
        console.warn('⚠️  WAL checkpoint warning:', error.message);
      }

      this.db.close();
      this.db = null;
      this.schemaInitialized = false;
      console.log('👋 Disconnected from SQLite');
    }
  }

  /**
   * Close database (alias for disconnect)
   */
  async close(): Promise<void> {
    return this.disconnect();
  }

  /**
   * Get database instance
   */
  getDatabase(): Database.Database {
    // For test isolation: prefer global.dbClient if it's been swapped by middleware
    // This allows tests to use worker-specific databases without changing service code
    // UNLESS the client was configured to ignore the global context (e.g. for Jobs DB)
    if (
      !this.config.ignoreGlobalContext &&
      global.dbClient &&
      global.dbClient !== this &&
      global.dbClient.db
    ) {
      return global.dbClient.db;
    }

    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  /**
   * Create a node with content-addressable storage
   * Uses INSERT OR REPLACE to handle re-imports gracefully (updates existing nodes)
   *
   * Features:
   * - Generates content hash for automatic deduplication
   * - Detects and marks duplicate content
   * - References original node for duplicates
   * - Stores canonical form for verification
   *
   * @see docs/architecture/ARCHITECTURE_CONTRACT.md
   * @see docs/architecture/CANONICALIZATION.md
   */
  async createNode(node: AnyNode): Promise<void> {
    this.assertWriteAllowed('createNode');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    const nodeData: any = node;

    // Generate content hash and canonical form
    const contentHash = contentHashForNodeType(node.kind, node);
    const canonicalContent = canonicalizeForNodeType(node.kind, node);

    // Check for existing node with same content hash in this account
    const existingNode = await this.findNodeByContentHash(contentHash, nodeData.account_id);
    const isDuplicate = !!existingNode;
    const originalNodeId = isDuplicate ? existingNode.id : null;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (
        id, kind, properties, account_id, created_by, created_at, updated_at, data_tag,
        content_hash, canonical_content, is_duplicate, original_node_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      node.id,
      node.kind,
      JSON.stringify(node),
      nodeData.account_id,
      nodeData.created_by,
      node.created_at,
      node.updated_at,
      nodeData.data_tag || 'real',
      contentHash,
      canonicalContent,
      isDuplicate ? 1 : 0,
      originalNodeId
    );
  }

  /**
   * Create multiple nodes in a transaction with content-addressable storage
   * Uses INSERT OR REPLACE to handle re-imports gracefully (updates existing nodes)
   *
   * Features:
   * - Batch processing for efficient content hashing
   * - Detects duplicates within batch and against database
   * - Transactional safety - all or nothing
   * - Optimized for bulk imports
   *
   * @see docs/architecture/ARCHITECTURE_CONTRACT.md
   */
  async createNodes(nodes: AnyNode[]): Promise<void> {
    this.assertWriteAllowed('createNodes');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (nodes.length === 0) {
      return;
    }

    // Pre-compute content hashes and canonical forms for all nodes
    interface NodeWithHash {
      node: AnyNode;
      contentHash: string;
      canonicalContent: string;
    }

    const nodesWithHashes: NodeWithHash[] = nodes.map((node) => ({
      node,
      contentHash: contentHashForNodeType(node.kind, node),
      canonicalContent: canonicalizeForNodeType(node.kind, node),
    }));

    // Get account_id from first node (assume all nodes in batch are for same account)
    const accountId = (nodes[0] as any).account_id;

    // Build deduplication map: content_hash -> original node_id
    // First, check database for existing nodes with these hashes
    const hashes = nodesWithHashes.map((n) => n.contentHash);
    const existingMap = await this.findDuplicatesByContentHash(hashes, accountId);

    // Also detect duplicates within the batch itself
    const batchSeenHashes = new Map<string, string>(); // content_hash -> first node_id in batch

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (
        id, kind, properties, account_id, created_by, created_at, updated_at, data_tag,
        content_hash, canonical_content, is_duplicate, original_node_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((nodesWithHashes: NodeWithHash[]) => {
      for (const { node, contentHash, canonicalContent } of nodesWithHashes) {
        const nodeData: any = node;

        // Determine if this is a duplicate
        let isDuplicate = false;
        let originalNodeId: string | null = null;

        // Check database first
        if (existingMap.has(contentHash)) {
          isDuplicate = true;
          originalNodeId = existingMap.get(contentHash)!;
        }
        // Check within batch
        else if (batchSeenHashes.has(contentHash)) {
          isDuplicate = true;
          originalNodeId = batchSeenHashes.get(contentHash)!;
        }
        // This is the first occurrence
        else {
          batchSeenHashes.set(contentHash, node.id);
        }

        insert.run(
          node.id,
          node.kind,
          JSON.stringify(node),
          nodeData.account_id,
          nodeData.created_by,
          node.created_at,
          node.updated_at,
          nodeData.data_tag || 'real',
          contentHash,
          canonicalContent,
          isDuplicate ? 1 : 0,
          originalNodeId
        );
      }
    });

    transaction(nodesWithHashes);
  }

  /**
   * Get a node by ID
   */
  async getNode(id: string): Promise<AnyNode | null> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    // Parse the entire node from properties JSON column
    // The database stores the complete node structure as JSON
    const parsedNode = safeJsonParse<Record<string, unknown>>(row.properties, `node ${id}`);
    if (!parsedNode) {
      console.error(`[SQLiteClient] Corrupted node data for id ${id}`);
      return null;
    }

    // Return the parsed node with database-level fields overridden for consistency
    // Type assertion via unknown is needed because parsedNode is Record<string, unknown>
    // and we need to merge it with authoritative database values
    return {
      ...parsedNode,
      // Override with authoritative database values
      id: row.id,
      kind: row.kind,
      account_id: row.account_id,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data_tag: row.data_tag,
    } as unknown as AnyNode;
  }

  /**
   * Get nodes by kind with optional pagination
   * @param kind - Node kind to filter by
   * @param options - Pagination options (limit, offset, accountId for multi-tenant filtering)
   */
  async getNodesByKind(
    kind: string,
    options?: { limit?: number; offset?: number; accountId?: string }
  ): Promise<AnyNode[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const limit = options?.limit ?? 1000; // Default limit to prevent loading 100k+ nodes
    const offset = options?.offset ?? 0;

    let query: string;
    let params: any[];

    if (options?.accountId) {
      // Multi-tenant filtered query with pagination
      query = `
        SELECT properties FROM nodes
        WHERE kind = ? AND account_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [kind, options.accountId, limit, offset];
    } else {
      // Unfiltered query with pagination
      query = `
        SELECT properties FROM nodes
        WHERE kind = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [kind, limit, offset];
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    // Safe parse with filtering of corrupted entries (bug fix #17)
    return rows
      .map((row) => safeJsonParse<AnyNode>(row.properties, `node in getNodesByKind(${kind})`))
      .filter((node): node is AnyNode => node !== null);
  }

  /**
   * Count nodes by kind (for pagination metadata)
   */
  async countNodesByKind(kind: string, accountId?: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    let query: string;
    let params: any[];

    if (accountId) {
      query = 'SELECT COUNT(*) as count FROM nodes WHERE kind = ? AND account_id = ?';
      params = [kind, accountId];
    } else {
      query = 'SELECT COUNT(*) as count FROM nodes WHERE kind = ?';
      params = [kind];
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Update a node
   */
  async updateNode(id: string, node: Partial<AnyNode>): Promise<void> {
    this.assertWriteAllowed('updateNode');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Get existing node
    const existing = await this.getNode(id);
    if (!existing) {
      throw new Error(`Node ${id} not found`);
    }

    // Merge with updates
    const updated = { ...existing, ...node, updated_at: Date.now() };

    const stmt = this.db.prepare(`
      UPDATE nodes
      SET properties = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(updated), updated.updated_at, id);
  }

  /**
   * Delete a node
   */
  async deleteNode(id: string): Promise<void> {
    this.assertWriteAllowed('deleteNode');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('DELETE FROM nodes WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Create an edge
   * Uses INSERT OR REPLACE to handle re-imports gracefully (updates existing edges)
   */
  async createEdge(edge: AnyEdge): Promise<void> {
    this.assertWriteAllowed('createEdge');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    const edgeData: any = edge;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      edge.id,
      edge.kind,
      edge.from,
      edge.to,
      JSON.stringify(edge),
      edgeData.account_id,
      edgeData.created_by,
      edge.created_at,
      edgeData.data_tag || 'real'
    );
  }

  /**
   * Create multiple edges in a transaction
   * Uses INSERT OR REPLACE to handle re-imports gracefully (updates existing edges)
   */
  async createEdges(edges: AnyEdge[]): Promise<void> {
    this.assertWriteAllowed('createEdges');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((edges: AnyEdge[]) => {
      for (const edge of edges) {
        const edgeData: any = edge;
        insert.run(
          edge.id,
          edge.kind,
          edge.from,
          edge.to,
          JSON.stringify(edge),
          edgeData.account_id,
          edgeData.created_by,
          edge.created_at,
          edgeData.data_tag || 'real'
        );
      }
    });

    transaction(edges);
  }

  /**
   * Get edges for a node
   */
  async getNodeEdges(
    nodeId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<AnyEdge[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    let query = '';
    if (direction === 'outgoing') {
      query = 'SELECT properties FROM edges WHERE from_id = ?';
    } else if (direction === 'incoming') {
      query = 'SELECT properties FROM edges WHERE to_id = ?';
    } else {
      query = 'SELECT properties FROM edges WHERE from_id = ? OR to_id = ?';
    }

    const stmt = this.db.prepare(query);
    const rows =
      direction === 'both' ? (stmt.all(nodeId, nodeId) as any[]) : (stmt.all(nodeId) as any[]);

    // Safe parse with filtering of corrupted entries (bug fix #17)
    return rows
      .map((row) => safeJsonParse<AnyEdge>(row.properties, `edge for node ${nodeId}`))
      .filter((edge): edge is AnyEdge => edge !== null);
  }

  /**
   * Get edges by kind
   */
  async getEdgesByKind(kind: string): Promise<AnyEdge[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('SELECT properties FROM edges WHERE kind = ?');
    const rows = stmt.all(kind) as any[];

    // Safe parse with filtering of corrupted entries (bug fix #17)
    return rows
      .map((row) => safeJsonParse<AnyEdge>(row.properties, `edge of kind ${kind}`))
      .filter((edge): edge is AnyEdge => edge !== null);
  }

  /**
   * Delete an edge
   */
  async deleteEdge(id: string): Promise<void> {
    this.assertWriteAllowed('deleteEdge');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('DELETE FROM edges WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Execute raw SQL query
   *
   * @deprecated This method allows arbitrary SQL execution and should be avoided.
   * Use specific methods like getNode(), getNodesByKind(), etc. instead.
   * If you must use this, ensure queries are parameterized and include account_id filters.
   *
   * Security note: Only SELECT queries are allowed. Write operations will throw.
   */
  async execute(query: string, params: any = {}): Promise<any> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const trimmedQuery = query.trim().toUpperCase();

    // Security fix (bug #7): Restrict to SELECT queries only
    // Write operations should use dedicated methods with proper validation
    if (!trimmedQuery.startsWith('SELECT') && !trimmedQuery.startsWith('WITH')) {
      throw new Error(
        'execute() only allows SELECT queries for safety. ' +
          'Use dedicated methods (createNode, updateNode, etc.) for write operations.'
      );
    }

    const stmt = this.db.prepare(query);
    return { records: stmt.all(params) };
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    nodes: number;
    edges: number;
    nodesByKind: Record<string, number>;
    edgesByKind: Record<string, number>;
  }> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const nodeCount = this.db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any;
    const edgeCount = this.db.prepare('SELECT COUNT(*) as count FROM edges').get() as any;

    const nodesByKind = this.db
      .prepare('SELECT kind, COUNT(*) as count FROM nodes GROUP BY kind')
      .all() as any[];

    const edgesByKind = this.db
      .prepare('SELECT kind, COUNT(*) as count FROM edges GROUP BY kind')
      .all() as any[];

    return {
      nodes: nodeCount.count,
      edges: edgeCount.count,
      nodesByKind: Object.fromEntries(nodesByKind.map((row) => [row.kind, row.count])),
      edgesByKind: Object.fromEntries(edgesByKind.map((row) => [row.kind, row.count])),
    };
  }

  /**
   * Full-text search on node properties
   *
   * Security: Now requires accountId for multi-tenant isolation (bug fix #8)
   *
   * @param query - FTS5 search query
   * @param accountId - Required account ID for tenant isolation
   * @param limit - Maximum results (default 50)
   */
  async search(query: string, accountId: string, limit: number = 50): Promise<AnyNode[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (!accountId) {
      throw new Error('accountId is required for search (multi-tenant isolation)');
    }

    // Security fix: Add account_id filter to prevent cross-tenant data leakage
    const stmt = this.db.prepare(`
      SELECT n.properties
      FROM nodes n
      JOIN nodes_fts fts ON n.rowid = fts.rowid
      WHERE fts MATCH ? AND n.account_id = ?
      LIMIT ?
    `);

    const rows = stmt.all(query, accountId, limit) as any[];

    // Safe parse with filtering of corrupted entries (bug fix #17)
    return rows
      .map((row) => safeJsonParse<AnyNode>(row.properties, 'search result'))
      .filter((node): node is AnyNode => node !== null);
  }

  /**
   * Delete nodes by data_tag
   * Useful for cleaning up test data
   */
  async deleteNodesByTag(dataTag: 'test' | 'automated' | 'manual' | 'real'): Promise<number> {
    this.assertWriteAllowed('deleteNodesByTag');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('DELETE FROM nodes WHERE data_tag = ?');
    const result = stmt.run(dataTag);
    return result.changes;
  }

  /**
   * Get statistics by data_tag
   */
  async getStatsByTag(): Promise<Record<string, { nodes: number; edges: number }>> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const nodesByTag = this.db
      .prepare('SELECT data_tag, COUNT(*) as count FROM nodes GROUP BY data_tag')
      .all() as any[];

    const edgesByTag = this.db
      .prepare('SELECT data_tag, COUNT(*) as count FROM edges GROUP BY data_tag')
      .all() as any[];

    const stats: Record<string, { nodes: number; edges: number }> = {};

    // Initialize with all possible tags
    ['test', 'real', 'automated', 'manual'].forEach((tag) => {
      stats[tag] = { nodes: 0, edges: 0 };
    });

    // Fill in actual counts
    nodesByTag.forEach((row) => {
      if (stats[row.data_tag]) {
        stats[row.data_tag].nodes = row.count;
      }
    });

    edgesByTag.forEach((row) => {
      if (stats[row.data_tag]) {
        stats[row.data_tag].edges = row.count;
      }
    });

    return stats;
  }

  /**
   * Update data_tag for nodes
   */
  async updateNodeTag(
    nodeIds: string[],
    dataTag: 'test' | 'automated' | 'manual' | 'real'
  ): Promise<number> {
    this.assertWriteAllowed('updateNodeTag');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('UPDATE nodes SET data_tag = ? WHERE id = ?');
    const transaction = this.db.transaction((ids: string[], tag: string) => {
      let updated = 0;
      for (const id of ids) {
        const result = stmt.run(tag, id);
        updated += result.changes;
      }
      return updated;
    });

    return transaction(nodeIds, dataTag);
  }

  // =========================================================================
  // CONTENT ADDRESSING METHODS
  // Implements content-addressable storage with automatic deduplication
  // @see packages/parsers/src/services/content-addressing.ts
  // @see docs/architecture/ARCHITECTURE_CONTRACT.md
  // =========================================================================

  /**
   * Find a node by content hash within an account
   *
   * Uses content_hash index for O(1) lookup performance.
   * Returns the first (oldest) node with matching content hash.
   *
   * @param contentHash - SHA-256 hash of canonical content
   * @param accountId - Account ID for scoped lookup
   * @returns Node with matching content hash, or null
   */
  async findNodeByContentHash(contentHash: string, accountId: string): Promise<AnyNode | null> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare(`
      SELECT properties FROM nodes
      WHERE content_hash = ? AND account_id = ?
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const row = stmt.get(contentHash, accountId) as any;
    return row
      ? safeJsonParse<AnyNode>(row.properties, `findNodeByContentHash(${contentHash})`)
      : null;
  }

  /**
   * Batch check for duplicate content hashes
   *
   * Efficiently checks multiple content hashes in a single query.
   * Returns a map of content_hash -> earliest node_id for each hash found.
   *
   * Optimized for bulk import operations where we need to check many hashes at once.
   *
   * @param contentHashes - Array of content hashes to check
   * @param accountId - Account ID for scoped lookup
   * @returns Map of content hash to existing node ID (earliest by created_at)
   */
  async findDuplicatesByContentHash(
    contentHashes: string[],
    accountId: string
  ): Promise<Map<string, string>> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (contentHashes.length === 0) {
      return new Map();
    }

    // Build IN clause with placeholders
    const placeholders = contentHashes.map(() => '?').join(',');

    const stmt = this.db.prepare(`
      SELECT content_hash, id, created_at FROM nodes
      WHERE content_hash IN (${placeholders})
        AND account_id = ?
      ORDER BY content_hash, created_at ASC
    `);

    const rows = stmt.all(...contentHashes, accountId) as any[];

    // Build map of content_hash -> earliest node_id
    const resultMap = new Map<string, string>();
    for (const row of rows) {
      if (!resultMap.has(row.content_hash)) {
        resultMap.set(row.content_hash, row.id);
      }
    }

    return resultMap;
  }

  /**
   * Find a spine node (Lexeme, Phrase, Topic) by kind and normalized text
   *
   * Uses JSON extraction to search within the properties column.
   * For Lexeme: matches by lemma
   * For Phrase: matches by normalized_text
   * For Topic: matches by name
   *
   * @param accountId - Account ID for scoped lookup
   * @param kind - Node kind ('Lexeme' | 'Phrase' | 'Topic')
   * @param normalizedText - The text to search for (case-insensitive)
   * @returns The first matching node or null
   */
  async findSpineNodeByText(
    accountId: string,
    kind: 'Lexeme' | 'Phrase' | 'Topic',
    normalizedText: string
  ): Promise<AnyNode | null> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Different JSON paths for different node kinds
    const jsonPath =
      kind === 'Lexeme' ? '$.lemma' : kind === 'Topic' ? '$.name' : '$.normalized_text';

    const stmt = this.db.prepare(`
      SELECT properties FROM nodes
      WHERE account_id = ?
        AND kind = ?
        AND LOWER(json_extract(properties, ?)) = LOWER(?)
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const row = stmt.get(accountId, kind, jsonPath, normalizedText) as any;
    return row
      ? safeJsonParse<AnyNode>(row.properties, `findSpineNodeByText(${kind}, ${normalizedText})`)
      : null;
  }

  /**
   * Batch lookup for spine nodes by kind and normalized texts
   *
   * Efficiently finds existing spine nodes for multiple texts in a single query.
   * Returns a Map of normalizedText -> existingNode for each found.
   *
   * Optimized for bulk import operations where we need to check many texts at once.
   *
   * @param accountId - Account ID for scoped lookup
   * @param kind - Node kind ('Lexeme' | 'Phrase' | 'Topic')
   * @param normalizedTexts - Array of texts to search for
   * @returns Map of normalizedText -> existing node
   */
  async findSpineNodesByTexts(
    accountId: string,
    kind: 'Lexeme' | 'Phrase' | 'Topic',
    normalizedTexts: string[]
  ): Promise<Map<string, AnyNode>> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (normalizedTexts.length === 0) {
      return new Map();
    }

    // Different JSON paths for different node kinds
    const jsonPath =
      kind === 'Lexeme' ? '$.lemma' : kind === 'Topic' ? '$.name' : '$.normalized_text';

    // Build IN clause with placeholders for the normalized texts
    const placeholders = normalizedTexts.map(() => '?').join(',');
    const lowercaseTexts = normalizedTexts.map((t) => t.toLowerCase());

    const stmt = this.db.prepare(`
      SELECT properties, LOWER(json_extract(properties, ?)) as lookup_key FROM nodes
      WHERE account_id = ?
        AND kind = ?
        AND LOWER(json_extract(properties, ?)) IN (${placeholders})
      ORDER BY created_at ASC
    `);

    const rows = stmt.all(jsonPath, accountId, kind, jsonPath, ...lowercaseTexts) as any[];

    // Build map of normalizedText -> earliest node
    const resultMap = new Map<string, AnyNode>();
    for (const row of rows) {
      const lookupKey = row.lookup_key as string;
      if (!resultMap.has(lookupKey)) {
        const parsed = safeJsonParse<AnyNode>(row.properties, `findSpineNodesByTexts(${kind})`);
        if (parsed) {
          resultMap.set(lookupKey, parsed);
        }
      }
    }

    return resultMap;
  }

  /**
   * Find all duplicate groups in an account
   *
   * Returns content hashes that have multiple nodes (duplicates).
   * Used by the merge endpoint to identify which content hashes need merging.
   *
   * @param accountId - Account ID
   * @returns Array of {contentHash, count} for hashes with count > 1
   */
  async findAllDuplicateGroupsByAccount(accountId: string): Promise<
    Array<{
      contentHash: string;
      count: number;
    }>
  > {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare(`
      SELECT
        content_hash as contentHash,
        COUNT(*) as count
      FROM nodes
      WHERE account_id = ? AND content_hash IS NOT NULL
      GROUP BY content_hash
      HAVING count > 1
      ORDER BY count DESC
    `);

    const rows = stmt.all(accountId) as any[];
    return rows;
  }

  /**
   * Merge duplicate nodes by content hash (NEW OVERLOAD for API)
   *
   * Finds all nodes with the given content hash in an account,
   * picks the canonical node (earliest created), and merges duplicates into it.
   *
   * Process:
   * 1. Query all nodes with this content hash
   * 2. Pick canonical (earliest created_at)
   * 3. Update all edges to point to canonical
   * 4. Delete duplicate nodes
   * 5. Return statistics
   *
   * All operations performed in a transaction for consistency.
   *
   * @param contentHash - Content hash to merge
   * @param accountId - Account ID for isolation
   * @returns Statistics about the merge operation
   */
  async mergeDuplicateNodes(
    contentHash: string,
    accountId: string
  ): Promise<{ edgesRelinked: number; duplicatesRemoved: number }>;

  /**
   * Merge duplicate nodes by node IDs (LEGACY)
   *
   * @param canonicalNodeId - ID of node to keep
   * @param duplicateNodeIds - IDs of nodes to merge
   * @returns Number of nodes merged
   */
  async mergeDuplicateNodes(canonicalNodeId: string, duplicateNodeIds: string[]): Promise<number>;

  /**
   * Implementation of mergeDuplicateNodes (handles both overloads)
   */
  async mergeDuplicateNodes(
    arg1: string,
    arg2: string | string[]
  ): Promise<{ edgesRelinked: number; duplicatesRemoved: number } | number> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // NEW OVERLOAD: mergeDuplicateNodes(contentHash, accountId)
    if (typeof arg2 === 'string') {
      const contentHash = arg1;
      const accountId = arg2;

      // Find all nodes with this content hash in this account
      const nodes = this.db
        .prepare(
          `
        SELECT id, created_at FROM nodes
        WHERE content_hash = ? AND account_id = ?
        ORDER BY created_at ASC, id ASC
      `
        )
        .all(contentHash, accountId) as any[];

      if (nodes.length <= 1) {
        return { edgesRelinked: 0, duplicatesRemoved: 0 };
      }

      // Canonical = earliest node
      const canonicalId = nodes[0].id;
      const duplicateIds = nodes.slice(1).map((n: any) => n.id);

      // Store db reference for transaction closure
      const db = this.db;

      // Perform merge in transaction
      const result = db.transaction(() => {
        let edgesRelinked = 0;

        // Update edges where duplicate is the source
        const updateFrom = db.prepare(`UPDATE edges SET from_id = ? WHERE from_id = ?`);
        // Update edges where duplicate is the target
        const updateTo = db.prepare(`UPDATE edges SET to_id = ? WHERE to_id = ?`);

        for (const dupId of duplicateIds) {
          const fromChanges = updateFrom.run(canonicalId, dupId).changes;
          const toChanges = updateTo.run(canonicalId, dupId).changes;
          edgesRelinked += fromChanges + toChanges;
        }

        // Delete duplicate nodes
        const deletePlaceholders = duplicateIds.map(() => '?').join(',');
        const deleteStmt = db.prepare(`DELETE FROM nodes WHERE id IN (${deletePlaceholders})`);
        deleteStmt.run(...duplicateIds);

        // Log merge operation if deduplication_log table exists
        try {
          const logStmt = db.prepare(`
            INSERT INTO deduplication_log (
              account_id, operation_type, content_hash,
              canonical_node_id, duplicate_node_ids,
              edges_merged, space_saved_bytes,
              performed_by, performed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          // Estimate space saved (rough estimate based on canonical content)
          const canonicalNode = db
            .prepare(`SELECT LENGTH(canonical_content) as size FROM nodes WHERE id = ?`)
            .get(canonicalId) as any;
          const spaceSaved = (canonicalNode?.size || 1000) * duplicateIds.length;

          logStmt.run(
            accountId,
            'merge',
            contentHash,
            canonicalId,
            JSON.stringify(duplicateIds),
            edgesRelinked,
            spaceSaved,
            'system', // Bug #31: Consider passing userId as parameter for better audit trail
            Date.now()
          );
        } catch (error: any) {
          // Bug fix #30: Log warning instead of silent failure
          // Table may not exist in older schemas - that's expected
          if (!error.message?.includes('no such table')) {
            console.warn('[SQLiteClient] Failed to log deduplication merge:', error.message);
          }
        }

        return { edgesRelinked, duplicatesRemoved: duplicateIds.length };
      })();

      return result;
    }

    // LEGACY OVERLOAD: mergeDuplicateNodes(canonicalNodeId, duplicateNodeIds[])
    else {
      const canonicalNodeId = arg1;
      const duplicateNodeIds = arg2 as string[];

      if (duplicateNodeIds.length === 0) {
        return 0;
      }

      // Bug fix #29: Batch verification to avoid N+1 queries
      // First, get canonical node
      const verifyCanonicalStmt = this.db.prepare(
        `SELECT id, content_hash, account_id FROM nodes WHERE id = ?`
      );
      const canonicalNode = verifyCanonicalStmt.get(canonicalNodeId) as any;
      if (!canonicalNode) {
        throw new Error(`Canonical node ${canonicalNodeId} not found`);
      }

      // Then verify all duplicate nodes in a single batch query
      const allIdsToVerify = [...duplicateNodeIds];
      const placeholders = allIdsToVerify.map(() => '?').join(',');
      const batchVerifyStmt = this.db.prepare(
        `SELECT id, content_hash FROM nodes WHERE id IN (${placeholders})`
      );
      const foundNodes = batchVerifyStmt.all(...allIdsToVerify) as {
        id: string;
        content_hash: string;
      }[];
      const foundNodeMap = new Map(foundNodes.map((n) => [n.id, n]));

      // Verify all duplicates exist and have matching content hash
      for (const dupId of duplicateNodeIds) {
        const dupNode = foundNodeMap.get(dupId);
        if (!dupNode) {
          throw new Error(`Duplicate node ${dupId} not found`);
        }
        if (dupNode.content_hash !== canonicalNode.content_hash) {
          throw new Error(`Node ${dupId} does not have same content hash as canonical node`);
        }
      }

      // Store db reference for transaction closure
      const db = this.db;
      const canonNode = canonicalNode;

      // Perform merge in transaction
      const transaction = db.transaction((canonicalId: string, dupIds: string[]) => {
        const placeholders = dupIds.map(() => '?').join(',');

        // Update edges where duplicate is the source
        const updateFromStmt = db.prepare(
          `UPDATE edges SET from_id = ? WHERE from_id IN (${placeholders})`
        );
        updateFromStmt.run(canonicalId, ...dupIds);

        // Update edges where duplicate is the target
        const updateToStmt = db.prepare(
          `UPDATE edges SET to_id = ? WHERE to_id IN (${placeholders})`
        );
        updateToStmt.run(canonicalId, ...dupIds);

        // Delete duplicate nodes
        const deleteStmt = db.prepare(`DELETE FROM nodes WHERE id IN (${placeholders})`);
        deleteStmt.run(...dupIds);

        // Log merge operation if deduplication_log table exists
        try {
          const logStmt = db.prepare(`
            INSERT INTO deduplication_log (
              account_id, operation_type, content_hash,
              canonical_node_id, duplicate_node_ids,
              edges_merged, space_saved_bytes,
              performed_by, performed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          // Count edges merged
          const edgesCountStmt = db.prepare(
            `SELECT COUNT(*) as count FROM edges WHERE from_id = ? OR to_id = ?`
          );
          const edgeCount = (edgesCountStmt.get(canonicalId, canonicalId) as any).count;

          // Estimate space saved (assuming average node size)
          const spaceSaved = dupIds.length * 1000; // Rough estimate

          logStmt.run(
            canonNode.account_id,
            'merge',
            canonNode.content_hash,
            canonicalId,
            JSON.stringify(dupIds),
            edgeCount,
            spaceSaved,
            'system', // Bug #31: Consider passing userId as parameter for better audit trail
            Date.now()
          );
        } catch (error: any) {
          // Bug fix #30: Log warning instead of silent failure
          // Table may not exist in older schemas - that's expected
          if (!error.message?.includes('no such table')) {
            console.warn('[SQLiteClient] Failed to log deduplication merge:', error.message);
          }
        }
      });

      transaction(canonicalNodeId, duplicateNodeIds);

      return duplicateNodeIds.length;
    }
  }

  /**
   * Get deduplication statistics for an account
   *
   * Analyzes nodes to calculate deduplication effectiveness.
   * Returns metrics about unique content vs duplicates and estimated space savings.
   *
   * @param accountId - Account ID
   * @returns Statistics about duplicates and space savings
   */
  async getDeduplicationStats(accountId: string): Promise<{
    total_nodes: number;
    unique_content: number;
    duplicate_count: number;
    space_saved_bytes: number;
  }> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Get basic counts
    const statsStmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_nodes,
        COUNT(DISTINCT content_hash) as unique_content,
        SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicate_count
      FROM nodes
      WHERE account_id = ? AND content_hash IS NOT NULL
    `);

    const stats = statsStmt.get(accountId) as any;

    // Calculate space savings by finding duplicate content
    const savingsStmt = this.db.prepare(`
      SELECT
        content_hash,
        COUNT(*) as occurrences,
        LENGTH(canonical_content) as content_size
      FROM nodes
      WHERE account_id = ? AND content_hash IS NOT NULL
      GROUP BY content_hash
      HAVING occurrences > 1
    `);

    const duplicateGroups = savingsStmt.all(accountId) as any[];

    // Calculate total space saved (all but one copy of each duplicate)
    let spaceSaved = 0;
    for (const group of duplicateGroups) {
      spaceSaved += group.content_size * (group.occurrences - 1);
    }

    return {
      total_nodes: stats.total_nodes || 0,
      unique_content: stats.unique_content || 0,
      duplicate_count: stats.duplicate_count || 0,
      space_saved_bytes: spaceSaved,
    };
  }

  // =========================================================================
  // BATCH SETTINGS QUERY
  // Single query to fetch all settings with scope inheritance
  // Replaces O(n*7) query pattern with O(1) query
  // =========================================================================

  /**
   * Get all settings for a user with scope inheritance in a single query
   *
   * Instead of querying 7 scopes per setting (350+ queries), this method:
   * 1. Fetches all settings for the user/account in ONE query
   * 2. Returns them ordered by scope priority (most specific wins)
   * 3. Caller processes in-memory to determine effective values
   *
   * Scope priority (1 = highest): component > view > user > role > workspace > org > defaults
   *
   * @param accountId - Account ID for workspace/role scopes
   * @param userId - User ID for user/view/component scopes
   * @returns Array of settings with scope info, ordered by control_id then priority
   */
  getAllSettingsForUser(
    accountId: string,
    userId: string
  ): Array<{ control_id: string; value: string; scope: string; priority: number }> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Single query fetches all relevant settings with priority ordering
    // scope_id can be: userId (for user/view/component), accountId (for workspace/role), or 'global' (for org/defaults)
    const stmt = this.db.prepare(`
      SELECT
        control_id,
        value,
        scope,
        CASE scope
          WHEN 'component' THEN 1
          WHEN 'view' THEN 2
          WHEN 'user' THEN 3
          WHEN 'role' THEN 4
          WHEN 'workspace' THEN 5
          WHEN 'org' THEN 6
          WHEN 'defaults' THEN 7
        END as priority
      FROM settings_config
      WHERE scope_id IN (?, ?, 'global')
      ORDER BY control_id, priority ASC
    `);

    return stmt.all(userId, accountId) as Array<{
      control_id: string;
      value: string;
      scope: string;
      priority: number;
    }>;
  }

  // =========================================================================
  // BATCH DELETE METHODS
  // Used by CompensateJob for rollback of failed imports
  // =========================================================================

  /**
   * Delete multiple nodes by ID in a single transaction
   *
   * Used for rollback of failed imports. Deletes in batches to prevent
   * memory issues with large IN clauses.
   *
   * @param nodeIds - Array of node IDs to delete
   * @param accountId - Account ID for multi-tenant isolation
   * @returns Number of nodes actually deleted
   */
  batchDeleteNodes(nodeIds: string[], accountId: string): number {
    this.assertWriteAllowed('batchDeleteNodes');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (nodeIds.length === 0) {
      return 0;
    }

    const BATCH_SIZE = 500;
    let totalDeleted = 0;

    // Process in batches to avoid SQLite variable limit
    const transaction = this.db.transaction(() => {
      for (let i = 0; i < nodeIds.length; i += BATCH_SIZE) {
        const batch = nodeIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');

        const stmt = this.db!.prepare(
          `DELETE FROM nodes WHERE id IN (${placeholders}) AND account_id = ?`
        );
        const result = stmt.run(...batch, accountId);
        totalDeleted += result.changes;
      }
    });

    transaction();
    return totalDeleted;
  }

  /**
   * Delete multiple edges by ID in a single transaction
   *
   * Used for rollback of failed imports. Must be called BEFORE batchDeleteNodes
   * to avoid foreign key constraint violations.
   *
   * @param edgeIds - Array of edge IDs to delete
   * @param accountId - Account ID for multi-tenant isolation
   * @returns Number of edges actually deleted
   */
  batchDeleteEdges(edgeIds: string[], accountId: string): number {
    this.assertWriteAllowed('batchDeleteEdges');

    if (!this.db) {
      throw new Error('Database not connected');
    }

    if (edgeIds.length === 0) {
      return 0;
    }

    const BATCH_SIZE = 500;
    let totalDeleted = 0;

    // Process in batches to avoid SQLite variable limit
    const transaction = this.db.transaction(() => {
      for (let i = 0; i < edgeIds.length; i += BATCH_SIZE) {
        const batch = edgeIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');

        const stmt = this.db!.prepare(
          `DELETE FROM edges WHERE id IN (${placeholders}) AND account_id = ?`
        );
        const result = stmt.run(...batch, accountId);
        totalDeleted += result.changes;
      }
    });

    transaction();
    return totalDeleted;
  }

  /**
   * Backfill content hashes for existing nodes
   *
   * Processes existing nodes in batches to add content hashing.
   * This is used for migration 017 to add content addressing to existing data.
   *
   * Process:
   * 1. Finds nodes without content_hash
   * 2. Calculates hash and canonical form for each
   * 3. Detects duplicates
   * 4. Updates database in transaction
   * 5. Records progress
   *
   * @param batchSize - Number of nodes to process per batch
   * @returns Total number of nodes processed
   */
  async backfillContentHashes(batchSize: number = 1000): Promise<number> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    let totalProcessed = 0;
    let batchNumber = 0;

    while (true) {
      batchNumber++;
      const startTime = Date.now();

      // Get nodes without content_hash
      const selectStmt = this.db.prepare(`
        SELECT id, kind, properties, account_id
        FROM nodes
        WHERE content_hash IS NULL
        LIMIT ?
      `);

      const nodesToProcess = selectStmt.all(batchSize) as any[];

      if (nodesToProcess.length === 0) {
        break; // No more nodes to process
      }

      // Process batch in transaction
      const updateStmt = this.db.prepare(`
        UPDATE nodes
        SET content_hash = ?,
            canonical_content = ?,
            is_duplicate = ?,
            original_node_id = ?
        WHERE id = ?
      `);

      const transaction = this.db.transaction((nodes: any[]) => {
        // First pass: calculate hashes
        const nodesWithHashes = nodes.map((node) => {
          const parsedNode = JSON.parse(node.properties);
          return {
            id: node.id,
            kind: node.kind,
            account_id: node.account_id,
            content_hash: contentHashForNodeType(node.kind, parsedNode),
            canonical_content: canonicalizeForNodeType(node.kind, parsedNode),
          };
        });

        // Second pass: detect duplicates
        const accountHashes = new Map<string, string[]>();

        for (const node of nodesWithHashes) {
          const key = `${node.account_id}:${node.content_hash}`;
          if (!accountHashes.has(key)) {
            accountHashes.set(key, []);
          }
          accountHashes.get(key)!.push(node.id);
        }

        // Third pass: update nodes
        for (const node of nodesWithHashes) {
          const key = `${node.account_id}:${node.content_hash}`;
          const nodesWithSameHash = accountHashes.get(key)!;

          // First node with this hash is canonical
          const isDuplicate = nodesWithSameHash[0] !== node.id;
          const originalNodeId = isDuplicate ? nodesWithSameHash[0] : null;

          updateStmt.run(
            node.content_hash,
            node.canonical_content,
            isDuplicate ? 1 : 0,
            originalNodeId,
            node.id
          );
        }
      });

      transaction(nodesToProcess);

      // Record progress if migration_017_progress table exists
      try {
        const progressStmt = this.db.prepare(`
          INSERT INTO migration_017_progress (
            batch_number, nodes_processed, nodes_hashed,
            duplicates_found, started_at, completed_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const duplicatesInBatch = nodesToProcess.filter((n) => {
          // Count how many were marked as duplicates
          const checkStmt = this.db!.prepare('SELECT is_duplicate FROM nodes WHERE id = ?');
          const result = checkStmt.get(n.id) as any;
          return result?.is_duplicate === 1;
        }).length;

        progressStmt.run(
          batchNumber,
          nodesToProcess.length,
          nodesToProcess.length,
          duplicatesInBatch,
          startTime,
          Date.now(),
          'completed'
        );
      } catch {
        // Progress table may not exist, that's OK
      }

      totalProcessed += nodesToProcess.length;

      // If we got fewer nodes than batch size, we're done
      if (nodesToProcess.length < batchSize) {
        break;
      }
    }

    return totalProcessed;
  }
}
