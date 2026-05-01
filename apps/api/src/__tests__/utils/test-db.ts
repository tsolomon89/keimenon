import Database from 'better-sqlite3';
import { DatabaseClient } from '@keimenon/db';

/**
 * Create an in-memory SQLite database for testing
 * Includes all tables from the main schema
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Create all tables
  db.exec(`
    -- Accounts table
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT NOT NULL CHECK(account_type IN ('admin', 'client')) DEFAULT 'client',
      account_class TEXT NOT NULL CHECK(account_class IN ('free', 'professional', 'business')) DEFAULT 'free',
      account_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      mode_service INTEGER DEFAULT 0
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      rank INTEGER NOT NULL DEFAULT 1 CHECK(rank BETWEEN 1 AND 4),
      permission_level TEXT NOT NULL DEFAULT 'junior',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- Account links table
    CREATE TABLE IF NOT EXISTS account_links (
      id TEXT PRIMARY KEY,
      admin_account_id TEXT NOT NULL,
      client_account_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL DEFAULT 'manages',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (admin_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (client_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(admin_account_id, client_account_id)
    );

    -- Nodes table
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- Edges table
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      data TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    -- Audit log table
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
    CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_account ON audit_log(account_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
  `);

  return db;
}

/**
 * Clear all data from test database
 */
export function clearTestDb(db: Database.Database) {
  db.exec(`
    DELETE FROM audit_log;
    DELETE FROM edges;
    DELETE FROM nodes;
    DELETE FROM account_links;
    DELETE FROM users;
    DELETE FROM accounts;
  `);
}

/**
 * Close test database connection
 */
export function closeTestDb(db: DatabaseClient) {
  db.close();
}

/**
 * Setup test database (alias for createTestDb)
 */
export function setupTestDatabase(): DatabaseClient {
  return createTestDb();
}

/**
 * Cleanup test database (alias for closeTestDb)
 */
export function cleanupTestDatabase(db: DatabaseClient) {
  closeTestDb(db);
}

/**
 * Create a bulk-insert-compatible test database.
 *
 * Loads the real schema.sql from packages/db (rather than duplicating it)
 * so the test DB has the same table shapes, FKs, and CHECK constraints
 * as production. Seeds required account and user rows.
 */
export function createBulkTestDb(): Database.Database {
  const path = require('path');
  const fs = require('fs');

  const schemaPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'db',
    'src',
    'sqlite',
    'schema.sql'
  );

  // Fallback: walk up from cwd() if __dirname-relative path doesn't exist
  let resolvedSchemaPath = schemaPath;
  if (!fs.existsSync(resolvedSchemaPath)) {
    const candidates = [
      path.resolve(process.cwd(), 'packages', 'db', 'src', 'sqlite', 'schema.sql'),
      path.resolve(process.cwd(), '..', 'packages', 'db', 'src', 'sqlite', 'schema.sql'),
      path.resolve(process.cwd(), '..', '..', 'packages', 'db', 'src', 'sqlite', 'schema.sql'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        resolvedSchemaPath = c;
        break;
      }
    }
  }

  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Load real schema
  const schemaSql = fs.readFileSync(resolvedSchemaPath, 'utf8');
  db.exec(schemaSql);

  // Seed required account & user rows (FK targets for nodes/edges)
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
     VALUES (?, 'client', 'free', 'test@test.com', 'Test Account', ?, ?)`
  ).run('acc_test', now, now);

  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at, primary_account_id)
     VALUES (?, 'testuser@test.com', 'hash', 'Test User', 'admin', 'person', 1, ?, ?, 'acc_test')`
  ).run('user_test', now, now);

  db.prepare(
    `INSERT OR IGNORE INTO user_accounts (id, user_id, account_id, permission_level, role_rank, joined_at, created_at, updated_at)
     VALUES (?, 'user_test', 'acc_test', 'admin', 1, ?, ?, ?)`
  ).run('ua_test', now, now, now);

  return db;
}

/**
 * Create a file-based bulk-insert-compatible test database.
 *
 * Same as createBulkTestDb() but writes to a temp file path so that
 * DbWorkerClient (which requires a file path, not :memory:) can connect.
 * Returns { db, dbPath }. Caller must close db and unlink dbPath.
 */
export function createBulkTestDbFile(): { db: Database.Database; dbPath: string } {
  const pathMod = require('path');
  const fsMod = require('fs');
  const os = require('os');

  const dbPath = pathMod.join(
    os.tmpdir(),
    `bulk-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`
  );

  const schemaPath = pathMod.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'db',
    'src',
    'sqlite',
    'schema.sql'
  );

  let resolvedSchemaPath = schemaPath;
  if (!fsMod.existsSync(resolvedSchemaPath)) {
    const candidates = [
      pathMod.resolve(process.cwd(), 'packages', 'db', 'src', 'sqlite', 'schema.sql'),
      pathMod.resolve(process.cwd(), '..', 'packages', 'db', 'src', 'sqlite', 'schema.sql'),
      pathMod.resolve(process.cwd(), '..', '..', 'packages', 'db', 'src', 'sqlite', 'schema.sql'),
    ];
    for (const c of candidates) {
      if (fsMod.existsSync(c)) {
        resolvedSchemaPath = c;
        break;
      }
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaSql = fsMod.readFileSync(resolvedSchemaPath, 'utf8');
  db.exec(schemaSql);

  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
     VALUES (?, 'client', 'free', 'test@test.com', 'Test Account', ?, ?)`
  ).run('acc_test', now, now);

  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at, primary_account_id)
     VALUES (?, 'testuser@test.com', 'hash', 'Test User', 'admin', 'person', 1, ?, ?, 'acc_test')`
  ).run('user_test', now, now);

  db.prepare(
    `INSERT OR IGNORE INTO user_accounts (id, user_id, account_id, permission_level, role_rank, joined_at, created_at, updated_at)
     VALUES (?, 'user_test', 'acc_test', 'admin', 1, ?, ?, ?)`
  ).run('ua_test', now, now, now);

  return { db, dbPath };
}
