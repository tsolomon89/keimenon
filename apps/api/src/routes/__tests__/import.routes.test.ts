import { describe, expect, it, beforeAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { createImportRoutes } from '../import.routes';

describe('Import Routes', () => {
  let app: Express;

  beforeAll(() => {
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
});
