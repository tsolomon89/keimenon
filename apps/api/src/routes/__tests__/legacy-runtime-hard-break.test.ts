import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';

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
});
