import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createPrincipalsRoutes } from '../principals.routes';

type AccountClass = 'free' | 'professional' | 'business';

function createApp(accountClass: AccountClass) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const authService = {
    verifyToken: vi.fn().mockResolvedValue({
      userId: 'user_1',
      accountId: 'acc_1',
      email: 'user@example.com',
      permissionLevel: 'admin',
      accountType: 'admin',
      accountClass,
      rank: 4,
      sessionId: 'sess_1',
      allAccounts: ['acc_1'],
    }),
  } as any;

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.db = {
      getDatabase: () => db,
    };
    next();
  });
  app.use('/api/v1/principals', createPrincipalsRoutes({} as any, authService));

  return { app, db };
}

describe('Principals Routes entitlement checks', () => {
  const dbs: Database.Database[] = [];

  afterEach(() => {
    while (dbs.length > 0) {
      dbs.pop()!.close();
    }
  });

  it('blocks free accounts from creating agent principals', async () => {
    const { app, db } = createApp('free');
    dbs.push(db);

    const response = await request(app)
      .post('/api/v1/principals')
      .set('Authorization', 'Bearer test-token')
      .send({
        display_name: 'Chat Agent',
        principal_kind: 'agent',
      })
      .expect(403);

    expect(response.body.requiredFeature).toBe('agent_runtime');
    const count = db.prepare(`SELECT COUNT(*) as count FROM nodes`).get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('allows free accounts to create non-agent principals', async () => {
    const { app, db } = createApp('free');
    dbs.push(db);

    await request(app)
      .post('/api/v1/principals')
      .set('Authorization', 'Bearer test-token')
      .send({
        display_name: 'Human User',
        principal_kind: 'human',
      })
      .expect(201);

    const row = db.prepare(`SELECT properties FROM nodes LIMIT 1`).get() as { properties: string };
    expect(JSON.parse(row.properties).principal_kind).toBe('human');
  });

  it('allows professional accounts to create agent principals', async () => {
    const { app, db } = createApp('professional');
    dbs.push(db);

    await request(app)
      .post('/api/v1/principals')
      .set('Authorization', 'Bearer test-token')
      .send({
        display_name: 'Claude Agent',
        principal_kind: 'agent',
      })
      .expect(201);

    const row = db.prepare(`SELECT properties FROM nodes LIMIT 1`).get() as { properties: string };
    expect(JSON.parse(row.properties).principal_kind).toBe('agent');
  });
});
