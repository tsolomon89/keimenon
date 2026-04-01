import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../app';
import { createAuthRoutes } from '../auth.routes';

describe('Legacy runtime hard-break endpoints', () => {
  it('returns 404 for removed verification endpoints', async () => {
    const { app } = createApp();

    const response = await request(app).get('/api/v1/verification/status').expect(404);

    expect(response.body.error.code).toBe(404);
  });

  it('returns 404 for removed AI endpoints', async () => {
    const { app } = createApp();

    const response = await request(app).post('/api/v1/ai/analyze-source').send({}).expect(404);

    expect(response.body.error.code).toBe(404);
  });

  it('returns 404 for removed debug password reset endpoint', async () => {
    const authApp = express();
    authApp.use(express.json());
    authApp.use(
      '/api/v1/auth',
      createAuthRoutes({
        requestPasswordReset: async () => null,
        resetPasswordWithToken: async () => null,
      } as any)
    );

    const response = await request(authApp)
      .post('/api/v1/auth/reset-password-debug')
      .send({ email: 'user@example.com', newPassword: 'DebugOnly123!' })
      .expect(404);

    expect(response.status).toBe(404);
  });
});
