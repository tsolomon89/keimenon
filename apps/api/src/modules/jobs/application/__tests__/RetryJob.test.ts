/**
 * RetryJob Unit Tests
 *
 * Tests the RetryJob use case, including checkpoint copying for crash recovery.
 *
 * Related:
 * - apps/api/src/modules/jobs/application/RetryJob.ts
 * - Crash recovery: When a job fails mid-import, retrying should copy the checkpoint
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RetryJob } from '../RetryJob';
import { Job, JobSpec } from '../../domain/Job';
import { JobRepository } from '../../infrastructure/JobRepository';

// Mock repository with checkpoint support
class MockJobRepository implements JobRepository {
  private jobs = new Map<string, Job>();
  private stateDataMap = new Map<string, any>();

  async save(job: Job): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async findById(id: string, accountId: string): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job || job.accountId !== accountId) {
      return null;
    }
    return Job.fromJSON(job.toJSON());
  }

  async find(criteria: any): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter((job) => {
      if (criteria.accountId && job.accountId !== criteria.accountId) return false;
      if (criteria.status && job.status !== criteria.status) return false;
      return true;
    });
  }

  async existsByIdempotencyKey(key: string, accountId: string): Promise<Job | null> {
    return null;
  }

  async delete(id: string, accountId: string): Promise<void> {
    this.jobs.delete(id);
  }

  async appendEvent(event: any): Promise<void> {}

  async loadEvents(jobId: string, accountId: string): Promise<any[]> {
    return [];
  }

  async countActiveInGroup(concurrencyGroup: string, accountId: string): Promise<number> {
    return 0;
  }

  async atomicTransition(
    jobId: string,
    accountId: string,
    fromStatus: any,
    toStatus: any,
    stateData: string
  ): Promise<boolean> {
    return true;
  }

  async getRawStateData(jobId: string, accountId: string): Promise<any | null> {
    const key = `${jobId}:${accountId}`;
    return this.stateDataMap.get(key) || null;
  }

  async updateStateData(jobId: string, accountId: string, stateData: string): Promise<void> {
    const key = `${jobId}:${accountId}`;
    this.stateDataMap.set(key, JSON.parse(stateData));
  }

  // Helper for tests
  setStateData(jobId: string, accountId: string, data: any): void {
    const key = `${jobId}:${accountId}`;
    this.stateDataMap.set(key, data);
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }
}

describe('RetryJob', () => {
  let jobRepository: MockJobRepository;
  let retryJob: RetryJob;

  beforeEach(() => {
    jobRepository = new MockJobRepository();
    retryJob = new RetryJob(jobRepository);
  });

  it('should create a new job when retrying a failed job', async () => {
    // Create and save a failed job
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test',
      createdBy: 'user_test',
      config: {
        files: [{ fileName: 'test.json', fileSize: 1024, mimeType: 'application/json' }],
      },
    };

    const originalJob = Job.create(jobSpec);
    originalJob.start();
    originalJob.fail({ code: 'TEST_ERROR', message: 'Test failure' });
    await jobRepository.save(originalJob);

    // Retry the job
    const result = await retryJob.execute({
      jobId: originalJob.id,
      accountId: 'acc_test',
      retriedBy: 'user_test',
    });

    expect(result.success).toBe(true);
    expect(result.newJob).toBeDefined();
    expect(result.newJob!.id).not.toBe(originalJob.id);
    expect(result.newJob!.status).toBe('queued');
    expect(result.newJob!.type).toBe('import');
  });

  it('should copy checkpoint from failed job to new job for crash recovery', async () => {
    // Create a failed job with checkpoint data (simulating crash mid-import)
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test',
      createdBy: 'user_test',
      config: {
        files: [{ fileName: 'large-file.json', fileSize: 1024 * 1024 * 500, mimeType: 'application/json' }],
      },
    };

    const originalJob = Job.create(jobSpec);
    originalJob.start();
    originalJob.fail({ code: 'ORPHANED', message: 'Server crashed' });
    await jobRepository.save(originalJob);

    // Set checkpoint data (simulating mid-import crash)
    const checkpointData = {
      checkpoint: {
        phase: 'materialize',
        fileIndex: 0,
        conversationsProcessed: 5000,
        messagesProcessed: 25000,
        lastBatchIndex: 100,
        lastSaveTime: Date.now() - 60000,
        uploadHash: 'upload_test_123',
      },
      changeTracker: {
        nodesCreated: ['node1', 'node2', 'node3'],
        edgesCreated: ['edge1', 'edge2'],
        nodesDeleted: [],
        edgesDeleted: [],
      },
    };
    jobRepository.setStateData(originalJob.id, 'acc_test', checkpointData);

    // Retry the job
    const result = await retryJob.execute({
      jobId: originalJob.id,
      accountId: 'acc_test',
      retriedBy: 'user_test',
    });

    expect(result.success).toBe(true);
    expect(result.newJob).toBeDefined();

    // Verify checkpoint was copied to new job
    const newJobStateData = await jobRepository.getRawStateData(result.newJob!.id, 'acc_test');
    expect(newJobStateData).toBeDefined();
    expect(newJobStateData.checkpoint).toEqual(checkpointData.checkpoint);
    expect(newJobStateData.changeTracker).toEqual(checkpointData.changeTracker);
    expect(newJobStateData.resumedFrom).toBe(originalJob.id);
  });

  it('should NOT copy checkpoint if job completed successfully', async () => {
    // Create a succeeded job
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test',
      createdBy: 'user_test',
      config: {
        files: [{ fileName: 'test.json', fileSize: 1024, mimeType: 'application/json' }],
      },
    };

    const originalJob = Job.create(jobSpec);
    originalJob.start();
    originalJob.succeed('Completed successfully');
    await jobRepository.save(originalJob);

    // Set completed checkpoint
    const checkpointData = {
      checkpoint: {
        phase: 'complete', // Completed phase - should NOT be copied
        fileIndex: 0,
        conversationsProcessed: 100,
        messagesProcessed: 500,
        lastBatchIndex: 2,
        lastSaveTime: Date.now(),
        uploadHash: 'upload_test_456',
      },
    };
    jobRepository.setStateData(originalJob.id, 'acc_test', checkpointData);

    // Retry the job (user wants to re-import)
    const result = await retryJob.execute({
      jobId: originalJob.id,
      accountId: 'acc_test',
      retriedBy: 'user_test',
    });

    expect(result.success).toBe(true);

    // Verify checkpoint was NOT copied (phase was 'complete')
    const newJobStateData = await jobRepository.getRawStateData(result.newJob!.id, 'acc_test');
    expect(newJobStateData).toBeNull();
  });

  it('should fail to retry job in non-terminal state', async () => {
    // Create a running job
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test',
      createdBy: 'user_test',
      config: {
        files: [{ fileName: 'test.json', fileSize: 1024, mimeType: 'application/json' }],
      },
    };

    const runningJob = Job.create(jobSpec);
    runningJob.start();
    await jobRepository.save(runningJob);

    // Try to retry running job
    const result = await retryJob.execute({
      jobId: runningJob.id,
      accountId: 'acc_test',
      retriedBy: 'user_test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot retry job in status');
  });

  it('should fail to retry non-existent job', async () => {
    const result = await retryJob.execute({
      jobId: 'job_nonexistent',
      accountId: 'acc_test',
      retriedBy: 'user_test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Job not found');
  });
});
