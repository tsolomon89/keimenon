/**
 * WorkerPool Unit Tests
 *
 * Tests the WorkerPool's job cancellation and worker lifecycle management.
 * These are unit tests that mock the job repository and workers.
 *
 * Related:
 * - apps/api/src/modules/workers/domain/WorkerPool.ts
 * - apps/api/src/__tests__/jobs-system.test.ts (integration tests)
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { WorkerPool } from '../domain/WorkerPool';
import { Job, JobSpec } from '../../jobs/domain/Job';
import { JobRepository } from '../../jobs/infrastructure/JobRepository';
import { ConcurrencyGuard } from '../domain/ConcurrencyGuard';
import { StartJob } from '../../jobs/application/StartJob';
import { SSEBroadcaster } from '../../jobs/infrastructure/SSEBroadcaster';
import { BaseWorker, WorkerContext, WorkerResult } from '../domain/Worker';

// Mock worker that simulates long-running work
class MockImportWorker extends BaseWorker {
  readonly type = 'import' as const;
  public processCallCount = 0;
  public wasCanceled = false;

  validate(job: Job): boolean {
    return true;
  }

  protected async execute(job: Job, context: WorkerContext): Promise<WorkerResult> {
    this.processCallCount++;

    // Simulate long-running work with checkpoint checks
    for (let i = 0; i < 10; i++) {
      // Check for cancellation at each checkpoint
      if (this.shouldCancel(context.signal)) {
        this.wasCanceled = true;
        return {
          success: false,
          error: {
            code: 'CANCELED',
            message: 'Job was canceled during processing',
          },
        };
      }

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      success: true,
      metadata: { itemsProcessed: 10 },
    };
  }
}

// Mock repository
class MockJobRepository implements JobRepository {
  private jobs = new Map<string, Job>();

  async save(job: Job): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async findById(id: string, accountId: string): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job || job.accountId !== accountId) {
      return null;
    }
    // Return a clone to simulate DB behavior (prevent shared reference mutation)
    // StartJob modifies the job instance before calling atomicTransition
    return Job.fromJSON(job.toJSON());
  }

  async find(criteria: any): Promise<Job[]> {
    const jobs = Array.from(this.jobs.values());
    return jobs.filter((job) => {
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

  async countByStatus(accountId: string, status: string): Promise<number> {
    return this.find({ accountId, status }).then((jobs) => jobs.length);
  }

  // Additional methods required by JobRepository interface
  async appendEvent(event: any): Promise<void> {
    // No-op for tests
  }

  async loadEvents(jobId: string, accountId: string): Promise<any[]> {
    return [];
  }

  async countActiveInGroup(concurrencyGroup: string, accountId: string): Promise<number> {
    const jobs = Array.from(this.jobs.values()).filter(
      (job) =>
        job.accountId === accountId &&
        job.concurrencyGroup === concurrencyGroup &&
        job.status === 'running'
    );
    return jobs.length;
  }

  async atomicTransition(
    jobId: string,
    accountId: string,
    fromStatus: any,
    toStatus: any,
    stateData: string
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.accountId !== accountId || job.status !== fromStatus) {
      return false;
    }
    // Simulate successful transition
    // In a real DB, this would update the row.
    // Since we are now using clones, we need to update the stored instance with the new state
    if (job) {
      // We can simply update the job in the map with the new stateData
      // But since we don't have the full new job object passed here (only stateData),
      // and StartJob only updates state...
      // Actually, StartJob modifies the INSTANCE it got from findById.
      // But we returned a clone. So the instance StartJob has is different from this.jobs.get(id).
      // We need to reflect the change in our "DB" (this.jobs).
      // However, for this mock, we can just say "it succeeded" and assume
      // subsequent fetches (if any) might need to be correct.
      // Parse state data and convert date strings to Date objects
      const parsed = JSON.parse(stateData);
      const newState: any = { ...parsed };

      // Rehydrate dates
      ['queuedAt', 'startedAt', 'completedAt', 'canceledAt', 'blockedAt'].forEach((field) => {
        if (newState[field]) {
          newState[field] = new Date(newState[field]);
        }
      });

      (job as any)._state = { ...job.state, ...newState };
    }
    return true;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }
}

// Mock concurrency guard
class MockConcurrencyGuard extends ConcurrencyGuard {
  constructor() {
    super({} as any);
  }

  async canStart(job: Job): Promise<{ canStart: boolean; reason?: string }> {
    return { canStart: true };
  }

  async blockJob(job: Job, reason: string): Promise<void> {
    job.block(reason);
  }

  async unblockWaitingJobs(completedJob: Job): Promise<Job[]> {
    // No-op for tests - return empty array
    return [];
  }
}

// Test suite
describe('WorkerPool', () => {
  let workerPool: WorkerPool;
  let jobRepository: MockJobRepository;
  let concurrencyGuard: MockConcurrencyGuard;
  let startJob: StartJob;
  let mockWorker: MockImportWorker;

  beforeAll(async () => {
    jobRepository = new MockJobRepository();
    concurrencyGuard = new MockConcurrencyGuard();
    startJob = new StartJob(jobRepository);

    // Force NODE_ENV to 'development' for unit tests to bypass WorkerPool's "MultiDatabase" integration logic
    // which tries to import 'get-db-client' and query real databases.
    vi.stubEnv('NODE_ENV', 'development');

    workerPool = new WorkerPool(jobRepository, concurrencyGuard, startJob, {
      maxConcurrentJobs: 2,
      pollIntervalMs: 100, // Short interval for tests
    });

    mockWorker = new MockImportWorker();
    workerPool.registerWorker(mockWorker);
  });

  // Cleanup after each test to prevent hanging
  afterAll(async () => {
    if (workerPool) {
      await workerPool.stop();
    }
    vi.unstubAllEnvs();
  });

  it('should cancel a running job', async () => {
    // Create a job
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test',
      createdBy: 'user_test',
      config: {
        files: [
          {
            fileName: 'test.json',
            fileSize: 1024,
            mimeType: 'application/json',
          },
        ],
      },
    };

    const job = Job.create(jobSpec);
    await jobRepository.save(job);

    // Start the worker pool
    await workerPool.start();

    // Wait for job to be picked up and start processing (need at least one poll cycle + some execution time)
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Verify job is running
    const runningJob = jobRepository.getJob(job.id);
    assert.ok(runningJob, 'Job should exist');

    // Cancel the job
    const canceled = await workerPool.cancelJob(job.id, job.accountId);
    assert.strictEqual(canceled, true, 'cancelJob should return true');

    // Wait for worker to detect cancellation
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify job status is canceled
    const canceledJob = jobRepository.getJob(job.id);
    assert.ok(canceledJob, 'Job should still exist');
    assert.strictEqual(canceledJob.status, 'canceled', 'Job should be marked as canceled');

    // Verify worker detected the cancellation
    assert.strictEqual(mockWorker.wasCanceled, true, 'Worker should have detected cancellation');

    // Stop worker pool
    await workerPool.stop();
  });

  it('should return false when canceling non-existent job', async () => {
    await workerPool.start();

    const canceled = await workerPool.cancelJob('job_nonexistent', 'acc_test');
    assert.strictEqual(canceled, false, 'cancelJob should return false for non-existent job');

    await workerPool.stop();
  });

  it('should update job status before aborting worker', async () => {
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test',
      createdBy: 'user_test',
      config: {
        files: [
          {
            fileName: 'test.json',
            fileSize: 1024,
            mimeType: 'application/json',
          },
        ],
      },
    };

    const job = Job.create(jobSpec);
    await jobRepository.save(job);

    await workerPool.start();

    // Wait for job to be picked up and start
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Get job status before cancel
    const jobBeforeCancel = jobRepository.getJob(job.id);
    assert.ok(jobBeforeCancel, 'Job should exist');

    // Cancel the job
    await workerPool.cancelJob(job.id, job.accountId);

    // Job should be marked as canceled immediately (before worker finishes)
    const jobAfterCancel = jobRepository.getJob(job.id);
    assert.ok(jobAfterCancel, 'Job should exist after cancel');
    assert.strictEqual(
      jobAfterCancel.status,
      'canceled',
      'Job status should be updated before worker finishes'
    );

    await workerPool.stop();
  });

  it('should not cancel job from different account', async () => {
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test_1',
      createdBy: 'user_test',
      config: {
        files: [
          {
            fileName: 'test.json',
            fileSize: 1024,
            mimeType: 'application/json',
          },
        ],
      },
    };

    const job = Job.create(jobSpec);
    await jobRepository.save(job);

    await workerPool.start();
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Try to cancel with different account ID
    const canceled = await workerPool.cancelJob(job.id, 'acc_test_2');
    assert.strictEqual(canceled, false, 'Should not cancel job from different account');

    await workerPool.stop();
  });

  it('should handle cancellation during worker checkpoints', async () => {
    const jobSpec: JobSpec = {
      type: 'import',
      accountId: 'acc_test',
      createdBy: 'user_test',
      config: {
        files: [
          {
            fileName: 'test.json',
            fileSize: 1024,
            mimeType: 'application/json',
          },
        ],
      },
    };

    const job = Job.create(jobSpec);
    await jobRepository.save(job);

    await workerPool.start();

    // Wait for worker to start (but not complete all checkpoints)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Cancel while worker is mid-execution
    const canceled = await workerPool.cancelJob(job.id, job.accountId);
    assert.strictEqual(canceled, true, 'cancelJob should succeed');

    // Wait for worker to finish current checkpoint and detect cancellation
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify worker was canceled (didn't complete all 10 iterations)
    assert.strictEqual(mockWorker.wasCanceled, true, 'Worker should detect cancellation');

    const finalJob = jobRepository.getJob(job.id);
    assert.ok(finalJob, 'Job should exist');
    assert.strictEqual(finalJob.status, 'canceled', 'Job should be marked as canceled');

    await workerPool.stop();
  });
});
