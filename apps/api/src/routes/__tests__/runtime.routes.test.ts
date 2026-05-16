import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { createRuntimeRoutes } from '../runtime.routes';
import { gemmaProvider } from '../../services/agent/gemma-local-provider';

vi.mock('../../services/agent/gemma-local-provider', () => {
  return {
    gemmaProvider: {
      checkStatus: vi.fn(),
    },
  };
});

// Mock entitlement
vi.mock('@keimenon/types', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    featureManifestForAccountClass: vi.fn().mockImplementation((accountClass: string) => {
      return { agent_runtime: accountClass !== 'free' };
    }),
  };
});

describe('Runtime Routes', () => {
  let app: Express;

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/v1/runtime/gemma/status returns 403 when agent runtime is not enabled (free tier)', async () => {
    setupApp('free');

    const res = await request(app).get('/api/v1/runtime/gemma/status');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Agent runtime is not enabled for this account tier');
    expect(res.body.configured).toBe(false);
  });

  it('GET /api/v1/runtime/gemma/status returns structured status with guidance when unconfigured', async () => {
    setupApp('business'); // Business has agent_runtime enabled

    const mockStatus = {
      configured: false,
      status: 'unavailable' as const,
      error_code: 'GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED',
      error: 'Gemma local base URL is not configured.',
    };

    vi.mocked(gemmaProvider.checkStatus).mockResolvedValue(mockStatus);

    const res = await request(app).get('/api/v1/runtime/gemma/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.guidance).toBeDefined();
    expect(res.body.guidance.title).toBe('Gemma Not Configured');
  });

  it('GET /api/v1/runtime/gemma/status returns structured status with guidance when model is missing', async () => {
    setupApp('professional');

    const mockStatus = {
      configured: true,
      status: 'offline' as const,
      modelAvailable: false,
      runtimeKind: 'openai-compatible',
      modelName: 'gemma-4-e2b',
      error_code: 'GEMMA_MODEL_NOT_FOUND',
    };

    vi.mocked(gemmaProvider.checkStatus).mockResolvedValue(mockStatus);

    const res = await request(app).get('/api/v1/runtime/gemma/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.guidance).toBeDefined();
    expect(res.body.guidance.title).toBe('Gemma Model Missing');
  });

  it('GET /api/v1/runtime/gemma/status returns online guidance when available', async () => {
    setupApp('professional');

    const mockStatus = {
      configured: true,
      status: 'online' as const,
      modelAvailable: true,
      runtimeKind: 'openai-compatible',
      modelName: 'gemma-4-e2b',
    };

    vi.mocked(gemmaProvider.checkStatus).mockResolvedValue(mockStatus);

    const res = await request(app).get('/api/v1/runtime/gemma/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.guidance).toBeDefined();
    expect(res.body.guidance.title).toBe('Gemma Online');
  });
});
