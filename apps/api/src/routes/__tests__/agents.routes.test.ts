import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import express from 'express';
import { createAgentsRoutes } from '../agents.routes';
import { AuthService } from '../../services/auth.service';

// Mock AuthService
const mockAuthService = {
  verifyToken: async () => ({
    userId: 'user1',
    accountId: 'acc1',
    email: 'test@example.com',
    permissionLevel: 'admin',
    accountType: 'admin',
    accountClass: 'business',
    rank: 1,
    sessionId: 'sess1',
    allAccounts: ['acc1'],
  }),
} as unknown as AuthService;

// Setup app
const app = express();
app.use(express.json());
app.use('/api/v1/agents', createAgentsRoutes(mockAuthService));

describe('Agents API', () => {
  it('should run gatherer agent', async () => {
    const response = await request(app)
      .post('/api/v1/agents/gatherer')
      .set('Authorization', 'Bearer mock-token')
      .send({
        intent: 'test gather',
        seed_sources: [{ id: 'seed1', url: 'http://example.com' }],
      });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
    assert.ok(response.body.data.sources_pending);
  });

  it('should run autogrouper agent', async () => {
    const response = await request(app)
      .post('/api/v1/agents/autogrouper')
      .set('Authorization', 'Bearer mock-token')
      .send({
        sources: [{ id: 's1', url: 'http://example.com' }],
      });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
    assert.ok(response.body.data.groups);
  });

  it('should run verifier agent', async () => {
    const response = await request(app)
      .post('/api/v1/agents/verifier')
      .set('Authorization', 'Bearer mock-token')
      .send({
        verifier_plan: { plan_id: 'p1', checks: ['c1'] },
        claim_ids: ['cl1'],
      });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.data.verifier_run.status, 'pass');
  });
});
