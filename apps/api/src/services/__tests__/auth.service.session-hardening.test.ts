import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { AuthService } from '../auth.service';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('AuthService session hardening', () => {
  let db: Database.Database;
  let authService: AuthService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        user_class TEXT NOT NULL,
        is_active INTEGER NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        account_type TEXT NOT NULL,
        account_class TEXT NOT NULL,
        email TEXT,
        name TEXT,
        owner_user_id TEXT,
        require_account_password INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE user_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        permission_level TEXT NOT NULL,
        role_rank INTEGER NOT NULL,
        role_overrides TEXT,
        status TEXT NOT NULL,
        joined_at INTEGER NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        token_hash TEXT UNIQUE,
        token_family_id TEXT,
        parent_session_id TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        operating_account_id TEXT,
        available_accounts TEXT,
        last_active INTEGER,
        revoked_at INTEGER,
        revoked_reason TEXT,
        ip_address TEXT,
        user_agent TEXT
      );
    `);

    const now = Date.now();
    db.prepare(
      `
      INSERT INTO users (id, email, name, user_class, is_active, password_hash, created_at, updated_at)
      VALUES ('user_1', 'user@example.com', 'User', 'person', 1, '$2a$12$Jf4nD9JZRLq2hHj6k4S2VOPi5hIB2w5R8uEAP06Xzj66x3gK8mN8u', ?, ?)
    `
    ).run(now, now);

    db.prepare(
      `
      INSERT INTO accounts (id, account_type, account_class, email, name, require_account_password, created_at, updated_at)
      VALUES ('acc_1', 'client', 'professional', 'user@example.com', 'Account', 0, ?, ?)
    `
    ).run(now, now);

    db.prepare(
      `
      INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at)
      VALUES ('ua_1', 'user_1', 'acc_1', 'admin', 4, 'active', ?)
    `
    ).run(now);

    authService = new AuthService({
      getDatabase: () => db,
    } as any);
  });

  afterEach(() => {
    delete process.env.AUTH_TEST_RELAX_SESSION_BINDING;
    db.close();
  });

  it('rotates refresh tokens and revokes previous session', async () => {
    const sessionId = 'sess_old';
    const issuedToken = await authService.generateToken({
      userId: 'user_1',
      accountId: 'acc_1',
      email: 'user@example.com',
      permissionLevel: 'admin',
      accountType: 'client',
      accountClass: 'professional',
      rank: 4,
      allAccounts: ['acc_1'],
      sessionId,
    });

    const now = Date.now();
    db.prepare(
      `
      INSERT INTO sessions (
        id, user_id, account_id, token, token_hash, token_family_id, parent_session_id,
        expires_at, created_at, operating_account_id, available_accounts, last_active
      )
      VALUES (?, 'user_1', 'acc_1', ?, ?, 'family_1', NULL, ?, ?, 'acc_1', '["acc_1"]', ?)
    `
    ).run(sessionId, hashToken(issuedToken), hashToken(issuedToken), now + 60_000, now, now);

    const refreshed = await authService.refreshToken(issuedToken);
    expect(refreshed?.token).toBeTruthy();
    expect(refreshed?.token).not.toBe(issuedToken);

    const oldSession = db
      .prepare('SELECT revoked_at, revoked_reason FROM sessions WHERE id = ?')
      .get(sessionId) as any;
    expect(oldSession.revoked_at).toBeTypeOf('number');
    expect(oldSession.revoked_reason).toBe('refresh_rotated');

    const newSession = db
      .prepare('SELECT parent_session_id, token_family_id FROM sessions WHERE token_hash = ?')
      .get(hashToken(refreshed!.token!)) as any;
    expect(newSession.parent_session_id).toBe(sessionId);
    expect(newSession.token_family_id).toBe('family_1');
  });

  it('enforces test-mode relaxation only when explicitly enabled', async () => {
    const token = await authService.generateToken({
      userId: 'user_1',
      accountId: 'acc_1',
      email: 'user@example.com',
      permissionLevel: 'admin',
      accountType: 'client',
      accountClass: 'professional',
      rank: 4,
      allAccounts: ['acc_1'],
      sessionId: 'sess_missing',
    });

    process.env.AUTH_TEST_RELAX_SESSION_BINDING = '0';
    const strictResult = await authService.verifyToken(token);
    expect(strictResult).toBeNull();

    delete process.env.AUTH_TEST_RELAX_SESSION_BINDING;
    const relaxedResult = await authService.verifyToken(token);
    expect(relaxedResult?.userId).toBe('user_1');
  });
});
