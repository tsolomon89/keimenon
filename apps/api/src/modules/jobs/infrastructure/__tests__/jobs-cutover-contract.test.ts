import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createImportJobsRoutes } from '../import-jobs.routes';
import { createJobsRoutes } from '../jobs.routes';
import { createUploadRoutes } from '../../../../routes/uploads.routes';

describe('Jobs/API Cutover Contract', () => {
  let app: express.Application;
  let db: Database.Database;

  const authService = {
    verifyToken: async (token: string) => {
      if (token !== 'valid-token') {
        return null;
      }
      return {
        userId: 'user_1',
        accountId: 'acc_1',
        email: 'user@example.com',
        permissionLevel: 'admin',
        accountType: 'admin',
        accountClass: 'professional',
        rank: 4,
        sessionId: 'session_1',
      };
    },
  } as any;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL,
        state_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        idempotency_key TEXT,
        concurrency_group TEXT,
        data_tag TEXT DEFAULT 'real'
      );

      CREATE TABLE IF NOT EXISTS job_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        type TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).db = { db };
      next();
    });
    app.use('/api/v1/jobs', createImportJobsRoutes(authService, db));
    app.use('/api/v1/jobs', createJobsRoutes(authService, db));
    app.use('/api/v1/uploads', createUploadRoutes(authService));
  });

  afterAll(() => {
    db.close();
  });

  it('returns 404 for removed explicit import compatibility endpoint even without authentication', async () => {
    await request(app).post('/api/v1/jobs/import').expect(404);
  });

  it('returns 404 for removed authenticated multipart import calls', async () => {
    const response = await request(app)
      .post('/api/v1/jobs/import')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
  });

  it('returns 404 for removed generic POST /api/v1/jobs enqueue surface', async () => {
    const response = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', 'Bearer valid-token')
      .send({})
      .expect(404);

    expect(response.body.error).toContain('Endpoint removed');
  });

  it('returns 404 for removed GET /api/v1/jobs/summary surface', async () => {
    const response = await request(app)
      .get('/api/v1/jobs/summary')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);

    expect(response.body.error).toContain('Endpoint removed');
  });

  it('returns 404 for removed upload progress SSE endpoint', async () => {
    await request(app)
      .get('/api/v1/uploads/session_123/progress')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
  });

  it('returns 404 for removed legacy import route family', async () => {
    await request(app)
      .post('/api/v1/import/enhanced')
      .set('Authorization', 'Bearer valid-token')
      .send({})
      .expect(404);
  });
});
