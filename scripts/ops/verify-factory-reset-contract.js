#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function fail(message, detail = '') {
  console.error(`[factory-reset-contract] FAIL ${message}`);
  if (detail) {
    console.error(detail);
  }
  process.exit(1);
}

function isMissingOrEmptyDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return true;
  }
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return false;
  }
  return fs.readdirSync(targetPath).length === 0;
}

function seedContractFixture(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT,
      account_class TEXT,
      email TEXT,
      name TEXT,
      owner_user_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      password_hash TEXT,
      name TEXT,
      permission_level TEXT,
      user_class TEXT,
      is_active INTEGER,
      primary_account_id TEXT,
      last_login_account_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS user_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      account_id TEXT,
      permission_level TEXT,
      role_rank INTEGER,
      status TEXT,
      joined_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS upload_sessions (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS job_events (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS job_items (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS job_change_pages (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS password_reset_tokens (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS settings_changes (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS settings_config (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS account_links (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS policy_profiles (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const now = Date.now();
  const adminAccountId = 'admin-account-1';
  const adminUserId = 'admin-user-1';
  const memberAccountId = 'member-account-1';
  const memberUserId = 'member-user-1';

  db.prepare(
    `
      INSERT INTO accounts (
        id, account_type, account_class, email, name, owner_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    adminAccountId,
    'admin',
    'business',
    'admin@keimenon.com',
    'Admin Account',
    adminUserId,
    now,
    now
  );
  db.prepare(
    `
      INSERT INTO accounts (
        id, account_type, account_class, email, name, owner_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    memberAccountId,
    'client',
    'free',
    'member@keimenon.com',
    'Member Account',
    memberUserId,
    now,
    now
  );

  db.prepare(
    `
      INSERT INTO users (
        id, email, password_hash, name, permission_level, user_class, is_active,
        primary_account_id, last_login_account_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    adminUserId,
    'admin@admin.com',
    'admin-hash-kept',
    'Admin',
    'admin',
    'person',
    1,
    adminAccountId,
    adminAccountId,
    now,
    now
  );
  db.prepare(
    `
      INSERT INTO users (
        id, email, password_hash, name, permission_level, user_class, is_active,
        primary_account_id, last_login_account_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    memberUserId,
    'member@member.com',
    'member-hash',
    'Member',
    'user',
    'person',
    1,
    memberAccountId,
    memberAccountId,
    now,
    now
  );

  db.prepare(
    `
      INSERT INTO user_accounts (
        id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run('ua-admin', adminUserId, adminAccountId, 'admin', 4, 'active', now, now, now);
  db.prepare(
    `
      INSERT INTO user_accounts (
        id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run('ua-member', memberUserId, memberAccountId, 'owner', 3, 'active', now, now, now);

  for (const [table, id] of [
    ['jobs', 'job-1'],
    ['nodes', 'node-1'],
    ['edges', 'edge-1'],
    ['sessions', 'session-1'],
    ['upload_sessions', 'upload-1'],
    ['job_events', 'event-1'],
    ['job_items', 'item-1'],
    ['job_change_pages', 'change-1'],
    ['password_reset_tokens', 'prt-1'],
    ['audit_log', 'audit-1'],
    ['login_attempts', 'login-1'],
    ['settings_changes', 'settings-change-1'],
    ['settings_config', 'settings-config-1'],
    ['account_links', 'link-1'],
    ['policy_profiles', 'policy-1'],
  ]) {
    db.prepare(`INSERT INTO ${table} (id) VALUES (?)`).run(id);
  }
}

function runFactoryReset(dbPath, localDocsPath, storagePath, tempRoot) {
  const command =
    'node node_modules/tsx/dist/cli.mjs apps/api/src/scripts/factory-reset.ts --mode=full-fresh';
  const result = spawnSync(process.execPath, ['scripts/run-with-project-node.js', command], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SQLITE_PATH: dbPath,
      LOCAL_DOCS_PATH: localDocsPath,
      STORAGE_PATH: storagePath,
      TEMP: tempRoot,
      TMP: tempRoot,
      TMPDIR: tempRoot,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (typeof result.status !== 'number' || result.status !== 0) {
    fail('factory-reset command failed', `${result.stdout || ''}\n${result.stderr || ''}`);
  }
}

function assertResetResults(dbPath, localDocsPath, storagePath) {
  const db = new Database(dbPath);
  try {
    const adminUser = db
      .prepare(`SELECT email, password_hash FROM users WHERE email = 'admin@admin.com'`)
      .get();
    if (!adminUser) {
      fail('admin@admin.com is missing after reset');
    }
    if (adminUser.password_hash !== 'admin-hash-kept') {
      fail('admin@admin.com password hash changed unexpectedly');
    }

    const nonAdminUsers = db
      .prepare(`SELECT COUNT(*) AS count FROM users WHERE email != 'admin@admin.com'`)
      .get().count;
    const nonAdminAccounts = db
      .prepare(`SELECT COUNT(*) AS count FROM accounts WHERE account_type != 'admin'`)
      .get().count;
    if (nonAdminUsers !== 0 || nonAdminAccounts !== 0) {
      fail(
        `non-admin principals remain after reset (users=${nonAdminUsers}, accounts=${nonAdminAccounts})`
      );
    }

    for (const tableName of ['nodes', 'edges', 'jobs', 'sessions', 'upload_sessions']) {
      const count = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
      if (count !== 0) {
        fail(`table ${tableName} still has residue (${count})`);
      }
    }

    const resetMarker = db
      .prepare(`SELECT value FROM schema_metadata WHERE key = 'last_factory_reset_ms'`)
      .get();
    if (!resetMarker?.value) {
      fail('schema_metadata.last_factory_reset_ms was not set');
    }
  } finally {
    db.close();
  }

  for (const targetPath of [
    path.join(localDocsPath, 'documents'),
    path.join(localDocsPath, 'metadata'),
    path.join(localDocsPath, 'agent-artifacts'),
    path.join(localDocsPath, 'uploads'),
    path.join(localDocsPath, 'temp'),
    path.resolve(storagePath),
  ]) {
    if (!isMissingOrEmptyDirectory(targetPath)) {
      fail(`runtime directory not purged: ${targetPath}`);
    }
  }
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'keimenon-factory-reset-contract-'));
  const localDocsPath = path.join(tempRoot, 'local-docs');
  const storagePath = path.join(localDocsPath, 'storage');
  const dbPath = path.join(localDocsPath, 'canvas.db');

  await fsp.mkdir(path.join(localDocsPath, 'documents'), { recursive: true });
  await fsp.mkdir(path.join(localDocsPath, 'metadata'), { recursive: true });
  await fsp.mkdir(path.join(localDocsPath, 'agent-artifacts'), { recursive: true });
  await fsp.mkdir(path.join(localDocsPath, 'uploads'), { recursive: true });
  await fsp.mkdir(path.join(localDocsPath, 'temp'), { recursive: true });
  await fsp.mkdir(path.join(storagePath, 'uploads'), { recursive: true });

  await fsp.writeFile(path.join(localDocsPath, 'documents', 'source.md'), 'content');
  await fsp.writeFile(path.join(localDocsPath, 'metadata', 'source.meta.json'), '{}');
  await fsp.writeFile(path.join(localDocsPath, 'agent-artifacts', 'artifact.bin'), 'artifact');
  await fsp.writeFile(path.join(localDocsPath, 'uploads', 'upload.bin'), 'upload');
  await fsp.writeFile(path.join(localDocsPath, 'temp', 'temp.txt'), 'temp');
  await fsp.writeFile(path.join(storagePath, 'uploads', 'upload.bin'), 'upload');

  const db = new Database(dbPath);
  try {
    seedContractFixture(db);
  } finally {
    db.close();
  }

  runFactoryReset(dbPath, localDocsPath, storagePath, tempRoot);
  assertResetResults(dbPath, localDocsPath, storagePath);

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log('[factory-reset-contract] PASS');
}

main().catch((error) => fail(error.message));
