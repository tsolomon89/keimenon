import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerCache,
  deregisterCache,
  flushAllCaches,
  ClearableCache,
} from '../../utils/cache-registry';
import { AuthService } from '../auth.service';
import Database from 'better-sqlite3';
import { SQLiteClient } from '@keimenon/db';

describe('Global Cache Registry and Auth Flushing', () => {
  let mockCache: ClearableCache;

  beforeEach(() => {
    mockCache = {
      clear: vi.fn(),
    };
    registerCache(mockCache);
  });

  afterEach(() => {
    deregisterCache(mockCache);
    vi.restoreAllMocks();
  });

  it('flushes all registered caches when flushAllCaches() is called', () => {
    flushAllCaches();
    expect(mockCache.clear).toHaveBeenCalledTimes(1);
  });

  it('does not call clear on deregistered caches', () => {
    deregisterCache(mockCache);
    flushAllCaches();
    expect(mockCache.clear).not.toHaveBeenCalled();
  });

  describe('AuthService integration', () => {
    let db: Database.Database;
    let authService: AuthService;

    beforeEach(() => {
      db = new Database(':memory:');

      // Create tables required for minimal selectAccount/logout/register execution
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT,
          user_class TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          primary_account_id TEXT,
          last_login_account_id TEXT,
          google_id TEXT UNIQUE
        );

        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          account_type TEXT NOT NULL,
          account_class TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          owner_user_id TEXT,
          require_account_password INTEGER DEFAULT 0,
          account_password_hash TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_accounts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          permission_level TEXT NOT NULL,
          role_rank INTEGER NOT NULL,
          role_overrides TEXT,
          status TEXT DEFAULT 'active',
          joined_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          token_hash TEXT NOT NULL UNIQUE,
          token_family_id TEXT NOT NULL,
          parent_session_id TEXT,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          revoked_at INTEGER,
          revoked_reason TEXT,
          operating_account_id TEXT,
          available_accounts TEXT,
          last_account_switch INTEGER,
          ip_address TEXT,
          user_agent TEXT,
          last_active INTEGER,
          data_tag TEXT DEFAULT 'real'
        );

        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          properties TEXT NOT NULL,
          account_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          data_tag TEXT DEFAULT 'real'
        );

        CREATE TABLE IF NOT EXISTS edges (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          from_id TEXT NOT NULL,
          to_id TEXT NOT NULL,
          properties TEXT NOT NULL,
          account_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          data_tag TEXT DEFAULT 'real'
        );
      `);

      const dbClient = {
        getDatabase: () => db,
      } as unknown as SQLiteClient;

      authService = new AuthService(dbClient);
    });

    afterEach(() => {
      db.close();
    });

    it('triggers global cache flushing during selectAccount()', async () => {
      // Seed user, account, and membership
      const userId = 'u-1';
      const accountId = 'a-1';
      const now = Date.now();

      db.prepare(
        `
        INSERT INTO users (id, email, name, user_class, is_active, created_at, updated_at)
        VALUES (?, 'user@example.com', 'Test User', 'person', 1, ?, ?)
      `
      ).run(userId, now, now);

      db.prepare(
        `
        INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
        VALUES (?, 'client', 'free', 'acct@example.com', 'Test Account', ?, ?)
      `
      ).run(accountId, now, now);

      db.prepare(
        `
        INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at)
        VALUES ('mem-1', ?, ?, 'admin', 4, 'active', ?, ?, ?)
      `
      ).run(userId, accountId, now, now, now);

      // Verify mock cache hasn't been called yet
      vi.clearAllMocks();

      // Trigger selectAccount
      await authService.selectAccount(userId, accountId, undefined, '127.0.0.1', 'test-agent', db);

      // Assert flush was triggered
      expect(mockCache.clear).toHaveBeenCalledTimes(1);
    });

    it('triggers global cache flushing during logout()', async () => {
      // Seed a session
      const token = 'test-token';
      const now = Date.now();

      db.prepare(
        `
        INSERT INTO sessions (id, user_id, account_id, token, token_hash, token_family_id, expires_at, created_at, data_tag)
        VALUES ('sess-1', 'u-1', 'a-1', ?, ?, 'fam-1', ?, ?, 'test')
      `
      ).run(token, token, now + 100000, now);

      // Verify mock cache hasn't been called yet
      vi.clearAllMocks();

      await authService.logout(token, '127.0.0.1', 'test-agent', db);

      // Assert flush was triggered
      expect(mockCache.clear).toHaveBeenCalledTimes(1);
    });
  });
});
