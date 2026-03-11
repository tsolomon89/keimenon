import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';

const verifyTopicMock = vi.fn(async () => ({
  sources: [],
  claims: [],
}));

vi.mock('../../services/verification-service', () => ({
  VerificationService: {
    getInstance: () => ({
      isSearchConfigured: () => false,
      verifyTopic: verifyTopicMock,
    }),
  },
}));

import { createVerificationRoutes } from '../verification.routes';

describe('Verification Routes - Egress Audit', () => {
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

    const authService = {
      verifyToken: async (token: string) => {
        if (token !== 'valid-token') {
          throw new Error('invalid token');
        }
        return {
          userId: 'user_1',
          accountId: 'acc_1',
          email: 'user@test.dev',
          permissionLevel: 'admin',
          accountType: 'admin',
          accountClass: 'professional',
          rank: 4,
          sessionId: 'session_1',
        };
      },
    } as any;

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).db = {
        getDatabase: () => db,
      };
      next();
    });
    app.use('/api/v1/verification', createVerificationRoutes(authService));
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it('records verification_egress audit event for verify-topic', async () => {
    const response = await request(app)
      .post('/api/v1/verification/verify-topic')
      .set('Authorization', 'Bearer valid-token')
      .send({
        topic: {
          id: 'topic_1',
          name: 'Deterministic imports',
          description: 'Verification audit test',
          keywords: ['imports'],
        },
      })
      .expect(200);

    expect(response.body.success).toBe(true);

    const row = db
      .prepare(
        `SELECT action, resource_type, resource_id, metadata
         FROM audit_log
         WHERE resource_type = 'verification_egress'
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

    expect(row).toBeDefined();
    expect(row?.action).toBe('read');
    expect(row?.resource_id).toBe('topic_1');

    const metadata = row?.metadata ? JSON.parse(row.metadata) : {};
    expect(metadata.route).toBe('verify-topic');
    expect(metadata.egressPolicy).toBe('claims_excerpts_only');
  });
});
