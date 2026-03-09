import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createSystemRoutes } from '../system.routes';

vi.mock('../../middleware/auth.middleware', () => ({
  requireAuth: () => (req: any, _res: any, next: any) => {
    req.user = { accountId: 'acc_1' };
    next();
  },
}));

describe('System Routes', () => {
  let db: Database.Database;
  let app: express.Application;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    (global as any).dbClient = { db };

    app = express();
    app.use(express.json());
    app.use('/api/v1/system', createSystemRoutes({} as any));
  });

  afterEach(() => {
    db.close();
    delete (global as any).dbClient;
  });

  it('GET /reimport-status returns defaults when unset', async () => {
    const response = await request(app).get('/api/v1/system/reimport-status').expect(200);

    expect(response.body).toEqual({
      requiresReimport: false,
      version: null,
      lastResetAt: null,
      backupPath: null,
    });
  });

  it('GET /reimport-status returns persisted metadata', async () => {
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES (?, ?)`).run(
      'core_process_reimport_required',
      '1'
    );
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES (?, ?)`).run(
      'core_process_version',
      '3'
    );
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES (?, ?)`).run(
      'core_process_last_reset_at',
      '2026-03-08T00:00:00.000Z'
    );
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES (?, ?)`).run(
      'core_process_backup_path',
      'C:\\backup\\core-v3.db'
    );

    const response = await request(app).get('/api/v1/system/reimport-status').expect(200);

    expect(response.body.requiresReimport).toBe(true);
    expect(response.body.version).toBe('3');
    expect(response.body.lastResetAt).toBe('2026-03-08T00:00:00.000Z');
    expect(response.body.backupPath).toBe('C:\\backup\\core-v3.db');
  });

  it('POST /reimport-complete clears reimport-required flag', async () => {
    db.prepare(`INSERT INTO schema_metadata (key, value) VALUES (?, ?)`).run(
      'core_process_reimport_required',
      '1'
    );

    await request(app).post('/api/v1/system/reimport-complete').send({}).expect(200);

    const row = db
      .prepare('SELECT value FROM schema_metadata WHERE key = ?')
      .get('core_process_reimport_required') as { value: string } | undefined;
    expect(row?.value).toBe('0');
  });
});
