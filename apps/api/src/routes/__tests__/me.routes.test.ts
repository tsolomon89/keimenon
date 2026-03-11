import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMeRoutes } from '../me.routes';

type AccountClass = 'free' | 'professional' | 'business';

function buildApp(accountClass: AccountClass) {
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
  app.use('/api/v1/me', createMeRoutes(authService));
  return app;
}

describe('Me routes features manifest', () => {
  it('returns Free manifest with objective layer enabled and agent runtime disabled', async () => {
    const app = buildApp('free');

    const response = await request(app)
      .get('/api/v1/me/features')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body.plan).toBe('free');
    expect(response.body.features.objective_layer).toBe(true);
    expect(response.body.features.agent_runtime).toBe(false);
  });

  it('maps professional account class to pro plan', async () => {
    const app = buildApp('professional');

    const response = await request(app)
      .get('/api/v1/me/features')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body.plan).toBe('pro');
    expect(response.body.features.objective_layer).toBe(true);
    expect(response.body.features.agent_runtime).toBe(true);
  });
});
