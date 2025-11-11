import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { AnyNode, AnyEdge } from '@canvas-memory/types';
import { contentHashForNodeType, canonicalizeForNodeType } from '@canvas-memory/parsers';

export interface SQLiteConfig {
  databasePath: string;
  readonly?: boolean;
  verbose?: boolean;
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

-- Sessions table
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
  user_agent TEXT
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

-- Settings tables
CREATE TABLE IF NOT EXISTS settings_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  control_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('defaults', 'org', 'workspace', 'role', 'user', 'view', 'component')),
  scope_id TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
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
  reason TEXT
);

-- =============================================================================
-- GRAPH TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation', 'UserNode', 'AccountNode', 'Board'
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
    'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE', 'OWNER_OF'
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
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

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
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_ip ON login_attempts(email, ip_address);

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
CREATE INDEX IF NOT EXISTS idx_settings_changes_control ON settings_changes(control_id);
CREATE INDEX IF NOT EXISTS idx_settings_changes_time ON settings_changes(changed_at DESC);

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

-- Job Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_timestamp ON job_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_job_items_job ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);

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
 * Provides same API as Neo4jClient for easy swapping
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

      // Set busy timeout to 5 seconds (prevents SQLITE_BUSY errors on concurrent access)
      this.db.pragma('busy_timeout = 5000');

      // Increase cache size to 64MB (default is ~2MB, this reduces disk I/O)
      this.db.pragma('cache_size = -64000'); // Negative value = KB

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

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

    try {
      // Use embedded schema - no file I/O required!
      this.db.exec(SQLITE_SCHEMA);

      // Run migrations for existing databases
      await this.runMigrations();

      console.log('✅ SQLite schema initialized');
    } catch (error) {
      console.error('❌ Failed to initialize schema:', error);
      throw error;
    }
  }

  /**
   * Run database migrations for existing databases
   * Adds missing columns that were added after initial schema
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Migration 1: Add deduplication columns to nodes table
    // Check if content_hash column exists
    const tableInfo = this.db.prepare('PRAGMA table_info(nodes)').all() as any[];
    const hasContentHash = tableInfo.some((col: any) => col.name === 'content_hash');

    if (!hasContentHash) {
      console.log('🔄 Running migration: Adding deduplication columns to nodes table');

      try {
        this.db.exec(`
          ALTER TABLE nodes ADD COLUMN content_hash TEXT;
          ALTER TABLE nodes ADD COLUMN canonical_content TEXT;
          ALTER TABLE nodes ADD COLUMN is_duplicate INTEGER DEFAULT 0;
          ALTER TABLE nodes ADD COLUMN original_node_id TEXT;
        `);

        // Create indexes for the new columns
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
          CREATE INDEX IF NOT EXISTS idx_nodes_account_hash ON nodes(account_id, content_hash);
        `);

        console.log('✅ Migration complete: Deduplication columns added');
      } catch (error) {
        console.error('❌ Migration failed:', error);
        // Don't throw - allow database to continue working without deduplication
      }
    }
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
    if (global.dbClient && global.dbClient !== this && global.dbClient.db) {
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
    const parsedNode = JSON.parse(row.properties);

    // Return the parsed node with database-level fields overridden for consistency
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
    } as AnyNode;
  }

  /**
   * Get nodes by kind
   */
  async getNodesByKind(kind: string): Promise<AnyNode[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('SELECT properties FROM nodes WHERE kind = ?');
    const rows = stmt.all(kind) as any[];

    return rows.map((row) => JSON.parse(row.properties) as AnyNode);
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

    return rows.map((row) => JSON.parse(row.properties) as AnyEdge);
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

    return rows.map((row) => JSON.parse(row.properties) as AnyEdge);
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
   */
  async execute(query: string, params: any = {}): Promise<any> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Simple query execution (no Cypher translation for now)
    const stmt = this.db.prepare(query);

    // Check if query is SELECT
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      return { records: stmt.all(params) };
    } else {
      return { records: [stmt.run(params)] };
    }
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
   */
  async search(query: string, limit: number = 50): Promise<AnyNode[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare(`
      SELECT n.properties
      FROM nodes n
      JOIN nodes_fts fts ON n.rowid = fts.rowid
      WHERE fts MATCH ?
      LIMIT ?
    `);

    const rows = stmt.all(query, limit) as any[];
    return rows.map((row) => JSON.parse(row.properties) as AnyNode);
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
    return row ? JSON.parse(row.properties) : null;
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
            'system', // TODO(enhancement): Get actual user ID from context parameter
            Date.now()
          );
        } catch {
          // Log table may not exist, that's OK
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

      // Verify all nodes have same content_hash
      const verifyStmt = this.db.prepare(
        `SELECT id, content_hash, account_id FROM nodes WHERE id = ?`
      );

      const canonicalNode = verifyStmt.get(canonicalNodeId) as any;
      if (!canonicalNode) {
        throw new Error(`Canonical node ${canonicalNodeId} not found`);
      }

      for (const dupId of duplicateNodeIds) {
        const dupNode = verifyStmt.get(dupId) as any;
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
            'system', // TODO(enhancement): Get actual user ID from context parameter
            Date.now()
          );
        } catch {
          // Log table may not exist, that's OK
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
