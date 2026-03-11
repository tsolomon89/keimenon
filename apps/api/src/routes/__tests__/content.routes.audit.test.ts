import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';

const { getContentByPathMock } = vi.hoisted(() => ({
  getContentByPathMock: vi.fn(async () => 'immutable raw message body'),
}));

vi.mock('../../services/local-document-store', () => ({
  getLocalDocumentStore: () => ({
    parseStorageLocation: () => '/tmp/local-content.txt',
    getContentByPath: getContentByPathMock,
    getContent: vi.fn(async () => null),
    getStats: vi.fn(async () => ({ files: 1, bytes: 32 })),
  }),
}));

import contentRoutes from '../content';

describe('Content Routes - Raw Access Audit', () => {
  let app: express.Application;
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        permission_level TEXT,
        user_class TEXT,
        is_active INTEGER,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT NOT NULL,
        actor_account_id TEXT NOT NULL,
        target_account_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        mode TEXT NOT NULL,
        success INTEGER NOT NULL,
        reason TEXT,
        ip_address TEXT,
        user_agent TEXT,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    db.prepare('INSERT INTO accounts (id) VALUES (?)').run('acc_1');
    db.prepare(
      `INSERT INTO users (
        id, email, name, permission_level, user_class, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('user_1', 'user@test.dev', 'User One', 'admin', 'person', 1, Date.now(), Date.now());

    app = express();
    app.use((req, _res, next) => {
      (req as any).user = {
        userId: 'user_1',
        accountId: 'acc_1',
        accountType: 'admin',
      };
      (req as any).db = {
        getDatabase: () => db,
        getNode: async (id: string) => ({
          id,
          kind: 'Message',
          account_id: 'acc_1',
          content_location: 'content://message/raw',
          role: 'user',
          timestamp: 1700000000000,
          char_count: 24,
        }),
      };
      next();
    });
    app.use('/api/v1/content', contentRoutes);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it('writes a raw_content_access audit record when message content is retrieved', async () => {
    const response = await request(app).get('/api/v1/content/message/msg_1').expect(200);

    expect(response.body.id).toBe('msg_1');
    expect(response.body.content).toBe('immutable raw message body');

    const auditRow = db
      .prepare(
        `SELECT action, resource_type, resource_id, metadata
         FROM audit_log
         WHERE resource_type = 'raw_content_access'
         ORDER BY timestamp DESC
         LIMIT 1`
      )
      .get() as
      | {
          action: string;
          resource_type: string;
          resource_id: string;
          metadata: string | null;
        }
      | undefined;

    expect(auditRow).toBeDefined();
    expect(auditRow?.action).toBe('read');
    expect(auditRow?.resource_type).toBe('raw_content_access');
    expect(auditRow?.resource_id).toBe('msg_1');

    const metadata = auditRow?.metadata ? JSON.parse(auditRow.metadata) : {};
    expect(metadata.endpoint).toBe('message');
  });
});
