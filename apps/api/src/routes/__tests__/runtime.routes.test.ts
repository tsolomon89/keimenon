import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { createRuntimeRoutes } from '../runtime.routes';
import { gemmaProvider } from '../../services/agent/gemma-local-provider';
import { localInferenceManager } from '../../services/agent/local-inference-manager';
import { modelManager } from '../../services/agent/model-manager';
import { CandidateNotFoundError } from '../../services/agent/errors';

vi.mock('../../services/agent/local-inference-manager', () => ({
  localInferenceManager: {
    getCombinedStatus: vi.fn(),
  },
}));

vi.mock('../../services/agent/model-manager', () => ({
  modelManager: {
    getModelDownloadPlan: vi.fn(),
    prepareModelDownload: vi.fn(),
    recordLicenseAcceptance: vi.fn(),
    recordDownloadStarted: vi.fn(),
    verifyModelFile: vi.fn(),
    recordDownloadComplete: vi.fn(),
    recordDownloadFailed: vi.fn(),
  },
}));

vi.mock('../../services/agent/model-downloader', () => ({
  modelDownloader: {
    startDownload: vi.fn(),
    getProgress: vi.fn(),
  },
}));

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
  it('POST /api/v1/runtime/local-inference/models/license-acceptance rejects non-Gemma models', async () => {
    setupApp('professional');
    const res = await request(app)
      .post('/api/v1/runtime/local-inference/models/license-acceptance')
      .send({
        model_family: 'llama',
        candidate_id: 'some-llama',
        accepted: true,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only Gemma models are supported');
  });

  it('GET /api/v1/runtime/local-inference/models/download-plan/:id returns 404 for unknown candidate', async () => {
    setupApp('professional');
    vi.mocked(modelManager.getModelDownloadPlan).mockRejectedValueOnce(
      new CandidateNotFoundError('unknown-id')
    );
    const res = await request(app).get(
      '/api/v1/runtime/local-inference/models/download-plan/unknown-id'
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Candidate not found');
  });

  it('POST /api/v1/runtime/local-inference/models/pending returns 404 for unknown candidate', async () => {
    setupApp('professional');
    vi.mocked(modelManager.prepareModelDownload).mockRejectedValueOnce(
      new CandidateNotFoundError('unknown-id')
    );
    const res = await request(app)
      .post('/api/v1/runtime/local-inference/models/pending')
      .send({ candidateId: 'unknown-id' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Candidate not found');
  });

  it('POST /api/v1/runtime/local-inference/models/pending returns 400 when missing candidateId', async () => {
    setupApp('professional');
    const res = await request(app).post('/api/v1/runtime/local-inference/models/pending').send({}); // No candidateId
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('candidateId is required');
  });

  it('GET /api/v1/runtime/local-inference/status returns 403 when agent runtime is not enabled (free tier)', async () => {
    setupApp('free');
    const res = await request(app).get('/api/v1/runtime/local-inference/status');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Agent runtime is not enabled for this account tier');
  });

  it('POST /api/v1/runtime/local-inference/models/download starts download', async () => {
    setupApp('professional');
    const { modelDownloader } = await import('../../services/agent/model-downloader');
    vi.mocked(modelDownloader.startDownload).mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/v1/runtime/local-inference/models/download')
      .send({ candidateId: 'gemma-4' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Download initiated.');
    expect(modelDownloader.startDownload).toHaveBeenCalledWith('gemma-4');
  });

  it('GET /api/v1/runtime/local-inference/models/download/progress/:id returns progress', async () => {
    setupApp('professional');
    const { modelDownloader } = await import('../../services/agent/model-downloader');
    const mockProgress = {
      candidateId: 'gemma-4',
      bytesDownloaded: 100,
      totalBytes: 1000,
      progressPercent: 10,
      status: 'downloading' as const,
    };
    vi.mocked(modelDownloader.getProgress).mockReturnValueOnce(mockProgress);

    const res = await request(app).get(
      '/api/v1/runtime/local-inference/models/download/progress/gemma-4'
    );

    expect(res.status).toBe(200);
    expect(res.body.progress).toEqual(mockProgress);
    expect(modelDownloader.getProgress).toHaveBeenCalledWith('gemma-4');
  });

  it('POST /api/v1/runtime/local-inference/models/download-started starts download status update', async () => {
    setupApp('professional');
    vi.mocked(modelManager.recordDownloadStarted).mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/v1/runtime/local-inference/models/download-started')
      .send({ candidateId: 'gemma-4' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(modelManager.recordDownloadStarted).toHaveBeenCalledWith('gemma-4');
  });

  it('POST /api/v1/runtime/local-inference/models/download-failed fails download status update', async () => {
    setupApp('professional');
    vi.mocked(modelManager.recordDownloadFailed).mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/v1/runtime/local-inference/models/download-failed')
      .send({ candidateId: 'gemma-4', reason: 'Disk full' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(modelManager.recordDownloadFailed).toHaveBeenCalledWith('gemma-4', 'Disk full');
  });

  it('POST /api/v1/runtime/local-inference/models/download-complete completes download status update', async () => {
    setupApp('professional');
    vi.mocked(modelManager.recordDownloadComplete).mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/v1/runtime/local-inference/models/download-complete')
      .send({ candidateId: 'gemma-4', local_path: 'gemma-4.litertlm', size_bytes: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(modelManager.recordDownloadComplete).toHaveBeenCalledWith({
      candidate_id: 'gemma-4',
      local_path: 'gemma-4.litertlm',
      size_bytes: 1000,
    });
  });
});
