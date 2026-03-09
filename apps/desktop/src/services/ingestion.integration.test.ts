import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const { mockSecureStorage } = vi.hoisted(() => ({
  mockSecureStorage: {
    getActiveAccountId: vi.fn(),
    getAccountToken: vi.fn(),
    getToken: vi.fn(),
  },
}));

vi.mock('./secure-storage', () => ({
  secureStorage: mockSecureStorage,
}));

import { FileIngestionService } from './ingestion';

interface MockJobState {
  id: string;
  type: 'import';
  status: 'queued' | 'running' | 'succeeded';
}

describe('FileIngestionService integration contract', () => {
  let tempDir = '';
  let tempFilePath = '';
  let server: ReturnType<typeof createServer> | null = null;
  let port = 0;
  let nextJobId = 1;
  const jobs = new Map<string, MockJobState>();
  const sseClients = new Set<ServerResponse>();

  const emitJobsUpdate = (job: MockJobState) => {
    const payload = JSON.stringify({
      jobId: job.id,
      type: job.type,
      status: job.status,
      progress: { percent: job.status === 'succeeded' ? 100 : job.status === 'running' ? 50 : 0 },
      timestamp: Date.now(),
      config: { fileName: 'desktop-import.json' },
    });

    for (const client of sseClients) {
      client.write(`event: jobs.update\n`);
      client.write(`data: ${payload}\n\n`);
    }
  };

  const consumeRequestBody = async (req: IncomingMessage): Promise<void> =>
    new Promise((resolve, reject) => {
      req.on('data', () => {
        // Drain request body; content is verified indirectly by successful enqueue.
      });
      req.on('end', () => resolve());
      req.on('error', (error) => reject(error));
    });

  const createMockApiServer = async (): Promise<number> =>
    new Promise((resolve, reject) => {
      server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://127.0.0.1');

          if (req.method === 'POST' && url.pathname === '/api/v1/jobs/import') {
            const auth = req.headers.authorization;
            if (auth !== 'Bearer desktop-access-token') {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
              return;
            }

            await consumeRequestBody(req);

            const jobId = `job_desktop_${nextJobId++}`;
            const job: MockJobState = { id: jobId, type: 'import', status: 'queued' };
            jobs.set(jobId, job);
            emitJobsUpdate(job);

            setTimeout(() => {
              const running = jobs.get(jobId);
              if (!running) return;
              running.status = 'running';
              emitJobsUpdate(running);
            }, 25);

            setTimeout(() => {
              const finished = jobs.get(jobId);
              if (!finished) return;
              finished.status = 'succeeded';
              emitJobsUpdate(finished);
            }, 50);

            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, jobId }));
            return;
          }

          if (req.method === 'GET' && url.pathname.startsWith('/api/v1/jobs/')) {
            const jobId = url.pathname.split('/').pop() || '';
            const job = jobs.get(jobId);
            if (!job) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Job not found' }));
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                job: {
                  id: job.id,
                  type: job.type,
                  state: { status: job.status },
                },
              })
            );
            return;
          }

          if (req.method === 'GET' && url.pathname === '/api/v1/stream/jobs') {
            const token = url.searchParams.get('token');
            if (token !== 'desktop-access-token') {
              res.statusCode = 401;
              res.end('Unauthorized');
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();

            sseClients.add(res);
            req.on('close', () => {
              sseClients.delete(res);
            });
            return;
          }

          res.statusCode = 404;
          res.end('Not Found');
        } catch (error) {
          reject(error);
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to bind mock API server'));
          return;
        }
        resolve(address.port);
      });
    });

  const waitForSseJobEvent = async (
    serverPort: number,
    expectedJobId: string,
    timeoutMs: number = 5000
  ): Promise<any> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(
      `http://127.0.0.1:${serverPort}/api/v1/stream/jobs?token=desktop-access-token`,
      {
        signal: controller.signal,
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(`Failed to open SSE stream: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let separator = buffer.indexOf('\n\n');

        while (separator !== -1) {
          const frame = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);

          let event = 'message';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) {
              event = line.slice('event:'.length).trim();
            } else if (line.startsWith('data:')) {
              data += line.slice('data:'.length).trim();
            }
          }

          if (event === 'jobs.update' && data) {
            const parsed = JSON.parse(data);
            if (parsed.jobId === expectedJobId) {
              clearTimeout(timeout);
              controller.abort();
              return parsed;
            }
          }

          separator = buffer.indexOf('\n\n');
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }

    throw new Error(`Timed out waiting for SSE update for ${expectedJobId}`);
  };

  beforeEach(async () => {
    jobs.clear();
    sseClients.clear();
    nextJobId = 1;

    mockSecureStorage.getActiveAccountId.mockResolvedValue('acc_desktop_1');
    mockSecureStorage.getAccountToken.mockResolvedValue('desktop-access-token');
    mockSecureStorage.getToken.mockResolvedValue(null);

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'desktop-ingest-test-'));
    tempFilePath = path.join(tempDir, 'desktop-import.json');
    await writeFile(
      tempFilePath,
      JSON.stringify([
        { title: 'Desktop import fixture', messages: [{ role: 'user', content: 'hello' }] },
      ]),
      'utf8'
    );

    port = await createMockApiServer();
  });

  afterEach(async () => {
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
    jobs.clear();

    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('creates import job via shared enqueue API and exposes job visibility through jobs/SSE surfaces', async () => {
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
      },
    } as any;

    const ingestionService = new FileIngestionService(mockWindow, port);

    const ingestResult = await ingestionService.ingestFile(tempFilePath);
    expect(ingestResult.success).toBe(true);
    expect(ingestResult.jobId).toMatch(/^job_desktop_/);

    const jobResponse = await fetch(`http://127.0.0.1:${port}/api/v1/jobs/${ingestResult.jobId}`);
    expect(jobResponse.status).toBe(200);
    const jobPayload = (await jobResponse.json()) as any;
    expect(jobPayload.job.id).toBe(ingestResult.jobId);
    expect(jobPayload.job.type).toBe('import');

    const sseUpdate = await waitForSseJobEvent(port, ingestResult.jobId);
    expect(sseUpdate.jobId).toBe(ingestResult.jobId);
    expect(['queued', 'running', 'succeeded']).toContain(sseUpdate.status);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'ingest:progress',
      expect.objectContaining({
        stage: 'uploading',
      })
    );
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'ingest:progress',
      expect.objectContaining({
        stage: 'queued',
        message: expect.stringContaining(ingestResult.jobId),
      })
    );
  });
});
