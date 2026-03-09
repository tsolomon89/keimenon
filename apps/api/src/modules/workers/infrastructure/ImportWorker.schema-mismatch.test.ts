import { describe, it, expect, vi } from 'vitest';
import { Job } from '../../jobs/domain/Job';
import { ImportWorker } from './ImportWorker';

describe('ImportWorker schema compatibility gate', () => {
  it('fails fast with SCHEMA_MISMATCH before batch parsing/import work', async () => {
    const mockDbClient = {
      assertImportSchemaCompatibility: () => {
        const error: Error & { code?: string } = new Error('Database migration required');
        error.code = 'SCHEMA_MISMATCH';
        throw error;
      },
    };

    const worker = new ImportWorker(mockDbClient as any, undefined, 5000);
    const job = Job.create({
      type: 'import',
      accountId: 'acc_schema_gate',
      createdBy: 'usr_schema_gate',
      config: {
        files: [
          {
            fileName: 'conversations.json',
            fileSize: 2048,
            mimeType: 'application/json',
            filePath: '/tmp/conversations.json',
          },
        ],
      },
    });

    const result = await worker.process(job, {
      jobRepository: { save: vi.fn() } as any,
      signal: new AbortController().signal,
      broadcaster: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCHEMA_MISMATCH');
    expect(result.error?.message).toContain('Database migration required');
  });
});
