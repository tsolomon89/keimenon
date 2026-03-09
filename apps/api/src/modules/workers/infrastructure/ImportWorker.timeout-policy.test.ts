import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Job } from '../../jobs/domain/Job';
import { ImportWorker } from './ImportWorker';
import { WORKER_CONFIG } from '../../jobs/jobs.config';

function createImportJob(params?: {
  fileSize?: number;
  processingMode?: 'automatic' | 'manual' | 'hybrid';
  metadata?: Record<string, unknown>;
}): Job {
  const fileSize = params?.fileSize ?? 1024;
  return Job.create({
    type: 'import',
    accountId: 'acc_timeout_policy',
    createdBy: 'usr_timeout_policy',
    config: {
      files: [
        {
          fileName: 'conversations.json',
          fileSize,
          mimeType: 'application/json',
          filePath: '/tmp/conversations.json',
        },
      ],
      importOptions: {
        processingMode: params?.processingMode ?? 'automatic',
      },
      metadata: params?.metadata ?? {},
    } as any,
  });
}

describe('ImportWorker timeout policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies pro-import multiplier for automatic mode when not capped', () => {
    const worker = new ImportWorker({} as any, undefined, 1_000);
    const tenMb = 10 * 1024 * 1024;

    const automaticJob = createImportJob({ fileSize: tenMb, processingMode: 'automatic' });
    const manualJob = createImportJob({ fileSize: tenMb, processingMode: 'manual' });

    const automaticTimeout = (worker as any).calculateAdaptiveTimeout(automaticJob) as number;
    const manualTimeout = (worker as any).calculateAdaptiveTimeout(manualJob) as number;

    expect(automaticTimeout).toBeGreaterThan(manualTimeout);
    expect(Math.round(automaticTimeout / manualTimeout)).toBe(2);
  });

  it('enforces expanded max wall-clock timeout envelope for large imports', () => {
    const worker = new ImportWorker({} as any, undefined, 1_000);
    const veryLargeJob = createImportJob({
      fileSize: 200 * 1024 * 1024, // 200MB export
      processingMode: 'automatic',
      metadata: { importContractVersion: 'v2' },
    });

    const timeout = (worker as any).calculateAdaptiveTimeout(veryLargeJob) as number;
    expect(timeout).toBe(WORKER_CONFIG.import.adaptiveTimeout.maxMs);
  });

  it('fails stalled imports with IMPORT_STALLED before wall-clock timeout', async () => {
    const worker = new ImportWorker({} as any, undefined, 60_000);
    const job = createImportJob({ processingMode: 'automatic' });

    vi.spyOn(worker as any, 'calculateAdaptiveTimeout').mockReturnValue(60_000);
    vi.spyOn(worker as any, 'calculateStallTimeout').mockReturnValue(200);
    vi.spyOn(worker as any, 'executeWithCheckpoints').mockImplementation(
      () => new Promise(() => {})
    );

    const resultPromise = worker.process(job, {
      jobRepository: { save: vi.fn() } as any,
      signal: new AbortController().signal,
      broadcaster: undefined,
    });

    await vi.advanceTimersByTimeAsync(6_000);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('IMPORT_STALLED');
    expect(result.error?.message).toContain('stalled');
  }, 15_000);
});
