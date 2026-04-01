import { describe, expect, it, beforeAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createImportRoutes } from '../import.routes';

describe('Import Routes', () => {
  let app: Express;
  let database: Database.Database;

  beforeAll(() => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE import_presets (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data_tag TEXT,
        UNIQUE(user_id, name)
      );

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        state_data TEXT NOT NULL
      );
    `);

    const authService = {
      verifyToken: async (token: string) => {
        if (token === 'valid_token') {
          return {
            userId: 'user_test_1',
            accountId: 'account_test_1',
            email: 'tester@example.com',
          };
        }
        throw new Error('Invalid token');
      },
    } as any;

    app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use((req, _res, next) => {
      (req as any).db = {
        getDatabase: () => database,
      };
      next();
    });
    app.use('/api/v1/import', createImportRoutes(authService));
  });

  it('requires authentication', async () => {
    await request(app).post('/api/v1/import/similarity-preview').send({ messages: [] }).expect(401);
  });

  it('returns deterministic preview summary for the same payload', async () => {
    const payload = {
      config: {
        extraction: { includeUser: true, includeAssistant: true },
        minMessageLength: 0,
        processingMode: 'automatic',
        branches: 'merged',
      },
      conversations: [
        {
          id: 'conv_1',
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'Build similarity graph and objective layer for imports.',
              timestamp: 1700000000000,
              index: 0,
            },
            {
              id: 'm2',
              role: 'assistant',
              content: 'Similarity edges should be weighted and deterministic.',
              timestamp: 1700000005000,
              index: 1,
            },
          ],
        },
        {
          id: 'conv_2',
          messages: [
            {
              id: 'm3',
              role: 'user',
              content: 'Prepare groceries list for dinner tonight.',
              timestamp: 1700000100000,
              index: 0,
            },
          ],
        },
      ],
    };

    const first = await request(app)
      .post('/api/v1/import/similarity-preview')
      .set('Authorization', 'Bearer valid_token')
      .send(payload)
      .expect(200);

    const second = await request(app)
      .post('/api/v1/import/similarity-preview')
      .set('Authorization', 'Bearer valid_token')
      .send(payload)
      .expect(200);

    expect(first.body.success).toBe(true);
    expect(second.body.success).toBe(true);

    // Ignore generatedAt timestamp and validate deterministic summary fields
    const firstSummary = { ...first.body.summary, generatedAt: 0 };
    const secondSummary = { ...second.body.summary, generatedAt: 0 };
    expect(firstSummary).toEqual(secondSummary);
    expect(first.body.summary.runtime.semanticStageEnabled).toBe(true);
    expect(first.body.summary.predicted.clusterCount).toBeGreaterThan(0);
    expect(first.body.summary.predicted.edgeCount).toBeGreaterThanOrEqual(0);
  });

  it('honors role filter and minimum message length', async () => {
    const payload = {
      config: {
        extraction: { includeUser: true, includeAssistant: false },
        minMessageLength: 25,
        processingMode: 'automatic',
        branches: 'merged',
      },
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'This is a sufficiently long user message for preview.',
        },
        { id: 'a1', role: 'assistant', content: 'Assistant response should be filtered out.' },
        { id: 'u2', role: 'user', content: 'short' },
      ],
    };

    const response = await request(app)
      .post('/api/v1/import/similarity-preview')
      .set('Authorization', 'Bearer valid_token')
      .send(payload)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.summary.input.messages).toBe(3);
    expect(response.body.summary.input.previewDocuments).toBe(1);
  });

  it('reflects semantic kill switch in preview runtime summary', async () => {
    const previous = process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE;
    process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE = '1';

    try {
      const response = await request(app)
        .post('/api/v1/import/similarity-preview')
        .set('Authorization', 'Bearer valid_token')
        .send({
          config: {
            extraction: { includeUser: true, includeAssistant: true },
            minMessageLength: 0,
            processingMode: 'automatic',
            branches: 'merged',
          },
          messages: [
            { id: 'm1', role: 'user', content: 'Alpha beta gamma delta epsilon.' },
            { id: 'm2', role: 'assistant', content: 'Alpha beta gamma with overlap.' },
          ],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.summary.runtime.semanticStageEnabled).toBe(false);
    } finally {
      if (typeof previous === 'undefined') {
        delete process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE;
      } else {
        process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE = previous;
      }
    }
  });

  it('supports import preset CRUD with per-user unique names', async () => {
    const createResponse = await request(app)
      .post('/api/v1/import/presets')
      .set('Authorization', 'Bearer valid_token')
      .send({
        name: 'My Preset',
        config: {
          extraction: { includeUser: true, includeAssistant: false },
          minMessageLength: 120,
          processingMode: 'automatic',
          branches: 'merged',
        },
      })
      .expect(201);

    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.preset.name).toBe('My Preset');
    expect(createResponse.body.preset.id).toBeTruthy();

    await request(app)
      .post('/api/v1/import/presets')
      .set('Authorization', 'Bearer valid_token')
      .send({
        name: 'My Preset',
        config: {},
      })
      .expect(409);

    const listed = await request(app)
      .get('/api/v1/import/presets')
      .set('Authorization', 'Bearer valid_token')
      .expect(200);

    expect(listed.body.success).toBe(true);
    expect(listed.body.presets.length).toBe(1);

    const presetId = listed.body.presets[0].id;
    await request(app)
      .put(`/api/v1/import/presets/${presetId}`)
      .set('Authorization', 'Bearer valid_token')
      .send({
        name: 'My Updated Preset',
        config: {
          extraction: { includeUser: true, includeAssistant: true },
          minMessageLength: 42,
          processingMode: 'hybrid',
          branches: 'separate',
        },
      })
      .expect(200);

    const updated = await request(app)
      .get('/api/v1/import/presets')
      .set('Authorization', 'Bearer valid_token')
      .expect(200);
    expect(updated.body.presets[0].name).toBe('My Updated Preset');
    expect(updated.body.presets[0].config.processingMode).toBe('hybrid');

    await request(app)
      .delete(`/api/v1/import/presets/${presetId}`)
      .set('Authorization', 'Bearer valid_token')
      .expect(200);

    const afterDelete = await request(app)
      .get('/api/v1/import/presets')
      .set('Authorization', 'Bearer valid_token')
      .expect(200);
    expect(afterDelete.body.presets).toEqual([]);
  });

  it('returns backend import stats series with bucketed aggregates', async () => {
    database.prepare('DELETE FROM jobs').run();
    const now = Date.now();

    const insertJob = database.prepare(
      `
      INSERT INTO jobs (id, account_id, type, created_at, state_data)
      VALUES (?, ?, ?, ?, ?)
    `
    );

    insertJob.run(
      'job_1',
      'account_test_1',
      'import',
      now - 2 * 60 * 60 * 1000,
      JSON.stringify({
        stats: {
          conversationsProcessed: 2,
          messagesProcessed: 8,
          sourcesCreated: 2,
          nodesCreated: 20,
          edgesCreated: 15,
        },
      })
    );
    insertJob.run(
      'job_2',
      'account_test_1',
      'import',
      now - 30 * 60 * 1000,
      JSON.stringify({
        stats: {
          conversationsProcessed: 1,
          messagesProcessed: 4,
          sourcesCreated: 1,
          nodesCreated: 10,
          edgesCreated: 7,
        },
      })
    );

    const response = await request(app)
      .get('/api/v1/import/stats/series?window=24h&buckets=12')
      .set('Authorization', 'Bearer valid_token')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.window).toBe('24h');
    expect(response.body.bucketCount).toBe(12);
    expect(response.body.series).toHaveLength(12);

    const totals = response.body.series.reduce(
      (acc: any, point: any) => {
        acc.imports += point.imports;
        acc.conversations += point.conversations;
        acc.messages += point.messages;
        return acc;
      },
      { imports: 0, conversations: 0, messages: 0 }
    );

    expect(totals.imports).toBe(2);
    expect(totals.conversations).toBe(3);
    expect(totals.messages).toBe(12);
  });
});
