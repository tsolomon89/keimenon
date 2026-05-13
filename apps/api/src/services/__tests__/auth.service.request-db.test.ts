import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AuthService } from '../auth.service';

describe('AuthService Request-Scoped DB Isolation', () => {
  let globalDb: Database.Database;
  let requestDb: Database.Database;
  let authService: AuthService;

  function initSchema(db: Database.Database) {
    db.exec(`
      CREATE TABLE schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, user_class TEXT NOT NULL, is_active INTEGER NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, account_type TEXT NOT NULL, account_class TEXT NOT NULL, email TEXT, name TEXT, owner_user_id TEXT, require_account_password INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE user_accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, permission_level TEXT NOT NULL, role_rank INTEGER NOT NULL, role_overrides TEXT, status TEXT NOT NULL, joined_at INTEGER NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, token_hash TEXT UNIQUE, token_family_id TEXT, parent_session_id TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, operating_account_id TEXT, available_accounts TEXT, last_active INTEGER, revoked_at INTEGER, revoked_reason TEXT, ip_address TEXT, user_agent TEXT);
      CREATE TABLE auth_audit_log (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, user_id TEXT, account_id TEXT, email TEXT, ip_address TEXT, user_agent TEXT, status TEXT NOT NULL, reason TEXT, metadata TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE failed_logins (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, attempt_type TEXT NOT NULL, ip_address TEXT, user_agent TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE login_attempts (id TEXT PRIMARY KEY, email TEXT NOT NULL, success INTEGER NOT NULL, ip_address TEXT, user_agent TEXT, failure_reason TEXT, attempted_at INTEGER NOT NULL);
      CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, properties TEXT NOT NULL, account_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE edges (id TEXT PRIMARY KEY, kind TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL, properties TEXT, account_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
  }

  beforeEach(() => {
    globalDb = new Database(':memory:');
    requestDb = new Database(':memory:');

    initSchema(globalDb);
    initSchema(requestDb);

    authService = new AuthService({
      getDatabase: () => globalDb,
    } as any);
  });

  afterEach(() => {
    globalDb.close();
    requestDb.close();
  });

  it('login() utilizes the provided requestDb instead of globalDb', async () => {
    const now = Date.now();
    requestDb
      .prepare(
        `INSERT INTO users (id, email, name, user_class, is_active, password_hash, created_at, updated_at) VALUES ('user_req', 'req@example.com', 'Req User', 'person', 1, 'hash', ?, ?)`
      )
      .run(now, now);

    // Using requestDb -> Reaches password check (invalid password)
    await expect(
      authService.login('req@example.com', 'password', '127.0.0.1', 'test', requestDb)
    ).rejects.toThrow('Invalid password');
    // Using globalDb -> Fails earlier with User not found
    await expect(
      authService.login('req@example.com', 'password', '127.0.0.1', 'test')
    ).rejects.toThrow('User not found');
  });

  it('selectAccount() utilizes the provided requestDb instead of globalDb', async () => {
    const now = Date.now();
    requestDb
      .prepare(
        `INSERT INTO users (id, email, name, user_class, is_active, password_hash, created_at, updated_at) VALUES ('user_req', 'req@example.com', 'Req User', 'person', 1, 'hash', ?, ?)`
      )
      .run(now, now);
    requestDb
      .prepare(
        `INSERT INTO accounts (id, account_type, account_class, email, name, require_account_password, created_at, updated_at) VALUES ('acc_req', 'client', 'professional', 'req@example.com', 'Req Account', 0, ?, ?)`
      )
      .run(now, now);
    requestDb
      .prepare(
        `INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at) VALUES ('ua_req', 'user_req', 'acc_req', 'admin', 4, 'active', ?)`
      )
      .run(now);

    vi.spyOn(authService as any, 'createSession').mockResolvedValue('new_token');

    // Test with requestDb
    const result = await authService.selectAccount(
      'user_req',
      'acc_req',
      undefined,
      '127.0.0.1',
      'test',
      requestDb
    );
    expect(result.token).toBe('new_token');

    // Test with globalDb (it will fail to find user_req)
    await expect(
      authService.selectAccount('user_req', 'acc_req', undefined, '127.0.0.1', 'test')
    ).rejects.toThrow('User not found');
  });

  it('switchAccount() utilizes the provided requestDb instead of globalDb', async () => {
    const now = Date.now();
    requestDb
      .prepare(
        `INSERT INTO users (id, email, name, user_class, is_active, password_hash, created_at, updated_at) VALUES ('user_req', 'req@example.com', 'Req User', 'person', 1, 'hash', ?, ?)`
      )
      .run(now, now);
    requestDb
      .prepare(
        `INSERT INTO accounts (id, account_type, account_class, email, name, require_account_password, created_at, updated_at) VALUES ('acc_req', 'client', 'professional', 'req@example.com', 'Req Account', 0, ?, ?)`
      )
      .run(now, now);
    requestDb
      .prepare(
        `INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at) VALUES ('ua_req', 'user_req', 'acc_req', 'admin', 4, 'active', ?)`
      )
      .run(now);

    vi.spyOn(authService as any, 'createSession').mockResolvedValue('new_token');

    // switchAccount params: userId, newAccountId, accountPassword?, fromAccountId?, ipAddress?, userAgent?, databaseInstance?
    const result = await authService.switchAccount(
      'user_req',
      'acc_req',
      undefined,
      undefined,
      '127.0.0.1',
      'test',
      requestDb
    );
    expect(result.token).toBe('new_token');

    await expect(
      authService.switchAccount('user_req', 'acc_req', undefined, undefined, '127.0.0.1', 'test')
    ).rejects.toThrow('User not found');
  });
});
