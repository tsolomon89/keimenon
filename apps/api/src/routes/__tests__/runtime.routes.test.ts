import request from 'supertest';
import express, { Express } from 'express';
import { createRuntimeRoutes } from '../runtime.routes';
import { gemmaProvider } from '../../services/agent/gemma-local-provider';

jest.mock('../../services/agent/gemma-local-provider');

describe('Runtime Routes', () => {
  let app: Express;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  const setupApp = (accountClass: string) => {
    app = express();
    app.use(express.json());

    // Mock auth middleware for tests
    app.use((req, res, next) => {
      (req as any).user = {
        id: 'test-user',
        accountClass,
      };
      next();
    });

    app.use('/api/v1/runtime', createRuntimeRoutes());
  };

  it('GET /api/v1/runtime/gemma/status returns 403 when agent runtime is not enabled (free tier)', async () => {
    setupApp('free');

    const res = await request(app).get('/api/v1/runtime/gemma/status');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Agent runtime is not enabled for this account tier');
    expect(res.body.configured).toBe(false);
  });

  it('GET /api/v1/runtime/gemma/status returns structured status and does not expose secrets when entitled', async () => {
    setupApp('professional'); // Professional has agent_runtime enabled

    // Mock checkStatus
    const mockStatus = {
      configured: true,
      status: 'online' as const,
      modelAvailable: true,
      runtimeKind: 'openai-compatible',
      modelName: 'gemma-4-e4b-it',
    };

    (gemmaProvider.checkStatus as jest.Mock).mockResolvedValue(mockStatus);

    const res = await request(app).get('/api/v1/runtime/gemma/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockStatus);

    // Verify secrets are not exposed (e.g. no base URLs or api keys returned in status body)
    expect(res.body.baseUrl).toBeUndefined();
    expect(res.body.apiKey).toBeUndefined();
  });

  it('GET /api/v1/runtime/gemma/status handles unconfigured state', async () => {
    setupApp('business'); // Business has agent_runtime enabled

    // Mock checkStatus
    const mockStatus = {
      configured: false,
      status: 'unavailable' as const,
      error_code: 'GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED',
      error: 'Gemma local base URL is not configured.',
    };

    (gemmaProvider.checkStatus as jest.Mock).mockResolvedValue(mockStatus);

    const res = await request(app).get('/api/v1/runtime/gemma/status');
    expect(res.status).toBe(200); // 200 OK because the *route* successfully returned the status
    expect(res.body).toEqual(mockStatus);
  });
});
