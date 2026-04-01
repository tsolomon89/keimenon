import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createConversationsRoutes } from '../conversations.routes';
import { buildDeterministicPrincipalId } from '../../services/graph-hierarchy.service';

let activeDb: Database.Database;

vi.mock('../../utils/get-db-client', () => ({
  getDbClient: vi.fn(async () => ({
    getDatabase: () => activeDb,
  })),
}));

vi.mock('../../middleware/auth.middleware', () => ({
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
}));

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT NOT NULL,
      account_class TEXT NOT NULL,
      email TEXT,
      name TEXT NOT NULL,
      owner_user_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT
    );

    CREATE TABLE user_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      permission_level TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE edges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      properties TEXT,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const now = Date.now();
  db.prepare(
    `
      INSERT INTO accounts (id, account_type, account_class, email, name, owner_user_id, created_at, updated_at)
      VALUES (?, 'client', 'professional', 'owner@example.com', 'Acme Account', ?, ?, ?)
    `
  ).run('acc_1', 'user_1', now, now);
  db.prepare(`INSERT INTO users (id, email, name) VALUES (?, ?, ?)`).run(
    'user_1',
    'owner@example.com',
    'Owner One'
  );
  db.prepare(
    `
      INSERT INTO user_accounts (id, user_id, account_id, permission_level, status)
      VALUES (?, ?, ?, 'admin', 'active')
    `
  ).run('ua_1', 'user_1', 'acc_1');

  return db;
}

function createApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = {
      userId: req.header('x-test-user-id') || 'user_1',
      accountId: req.header('x-test-account-id') || 'acc_1',
      accountClass: req.header('x-test-account-class') || 'professional',
    };
    next();
  });
  app.use('/api/v1/conversations', createConversationsRoutes({} as any, {} as any));
  return app;
}

describe('Conversations Routes principal/context contract', () => {
  let app: express.Application;

  beforeEach(() => {
    activeDb = createTestDb();
    app = createApp();
  });

  afterEach(() => {
    activeDb.close();
    vi.clearAllMocks();
  });

  it('defaults human_principal_id to deterministic account-scoped principal and materializes hierarchy links', async () => {
    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .send({
        title: 'Planning Thread',
      })
      .expect(201);

    const expectedPrincipalId = buildDeterministicPrincipalId('acc_1', 'user_1');
    expect(response.body.conversation.human_principal_id).toBe(expectedPrincipalId);

    const principalRow = activeDb
      .prepare(`SELECT id FROM nodes WHERE id = ? AND kind = 'Principal'`)
      .get(expectedPrincipalId) as { id?: string } | undefined;
    expect(principalRow?.id).toBe(expectedPrincipalId);

    const accountContainsEdge = activeDb
      .prepare(
        `
          SELECT id FROM edges
          WHERE kind = 'CONTAINS' AND from_id = ? AND to_id = ?
        `
      )
      .get('account_node_acc_1', expectedPrincipalId) as { id?: string } | undefined;
    expect(accountContainsEdge?.id).toBeTruthy();
  });

  it('rejects agent principal usage when runtime entitlement is absent', async () => {
    const now = Date.now();
    activeDb
      .prepare(
        `
          INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
          VALUES (?, 'Principal', ?, 'acc_1', 'user_1', ?, ?)
        `
      )
      .run(
        'principal_agent_1',
        JSON.stringify({
          display_name: 'ChatGPT',
          principal_kind: 'agent',
          capabilities: {
            can_upload: true,
            can_run_tools: true,
            can_import_web: true,
            can_own_account: false,
            can_approve_runs: false,
          },
        }),
        now,
        now
      );

    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .set('x-test-account-class', 'free')
      .send({
        title: 'Free tier thread',
        agent_principal_id: 'principal_agent_1',
      })
      .expect(403);

    expect(response.body.requiredFeature).toBe('agent_runtime');
  });

  it('rejects context ids that are outside scoped account graph kinds', async () => {
    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .send({
        title: 'Scoped thread',
        context_spec: {
          source_ids: ['missing_source'],
          group_ids: [],
          include_pinned: true,
          expansion_rule: 'none',
        },
      })
      .expect(400);

    expect(response.body.error).toContain('Invalid source_ids references');
  });
});
