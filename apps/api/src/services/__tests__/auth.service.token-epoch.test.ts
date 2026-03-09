import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import { AuthService } from '../auth.service';

describe('AuthService token epoch invalidation', () => {
  let db: Database.Database;
  let authService: AuthService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);

    authService = new AuthService({
      getDatabase: () => db,
    } as any);
  });

  afterEach(() => {
    db.close();
  });

  it('rejects tokens issued before auth_token_epoch_ms', async () => {
    const token = await authService.generateToken({
      userId: 'user-1',
      accountId: 'account-1',
    });

    const decoded = jwt.decode(token) as { iat?: number } | null;
    expect(decoded?.iat).toBeTypeOf('number');

    const epochMs = decoded!.iat! * 1000 + 1000;
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES ('auth_token_epoch_ms', ?)`).run(
      String(epochMs)
    );

    const verified = await authService.verifyToken(token);
    expect(verified).toBeNull();
  });

  it('accepts tokens issued after epoch even without session row', async () => {
    const token = await authService.generateToken({
      userId: 'user-2',
      accountId: 'account-2',
    });

    const decoded = jwt.decode(token) as { iat?: number } | null;
    expect(decoded?.iat).toBeTypeOf('number');

    const epochMs = decoded!.iat! * 1000 - 1000;
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES ('auth_token_epoch_ms', ?)`).run(
      String(epochMs)
    );

    const verified = await authService.verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('user-2');
    expect(verified?.accountId).toBe('account-2');
  });

  it('uses last_factory_reset ISO timestamp as fallback epoch', async () => {
    const token = await authService.generateToken({
      userId: 'user-3',
      accountId: 'account-3',
    });

    const decoded = jwt.decode(token) as { iat?: number } | null;
    expect(decoded?.iat).toBeTypeOf('number');

    const resetIso = new Date(decoded!.iat! * 1000 + 1000).toISOString();
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES ('last_factory_reset', ?)`).run(
      resetIso
    );

    const verified = await authService.verifyToken(token);
    expect(verified).toBeNull();
  });
});
