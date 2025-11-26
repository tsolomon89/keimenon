/**
 * Worker Pool
 *
 * Manages a pool of workers that process background jobs.
 *
 * Responsibilities:
 * - Poll for queued jobs
 * - Check concurrency constraints
 * - Dispatch jobs to workers
 * - Track active jobs
 * - Handle job completion/failure
 * - Respect bounded concurrency (max workers)
 *
 * Related: Product Directive - "Bounded worker pool"
 */

import { Job, JobType } from '../../jobs/domain/Job';
import { JobRepository } from '../../jobs/infrastructure/JobRepository';
import { IWorker, WorkerContext } from './Worker';
import { ConcurrencyGuard } from './ConcurrencyGuard';
import { StartJob } from '../../jobs/application/StartJob';
import { SSEBroadcaster } from '../../jobs/infrastructure/SSEBroadcaster';
import { ErrorFactory } from '../../../middleware/error-handler.middleware';

export interface WorkerPoolConfig {
  maxConcurrentJobs: number;
  pollIntervalMs: number;
  accountId?: string; // Optional: restrict to specific account
}

export interface ActiveJobExecution {
  job: Job;
  worker: IWorker;
  abortController: AbortController;
  startedAt: Date;
}

/**
 * Worker Pool
 */
export class WorkerPool {
  private workers: Map<JobType, IWorker> = new Map();
  private activeJobs: Map<string, ActiveJobExecution> = new Map();
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private jobRepository: JobRepository,
    private concurrencyGuard: ConcurrencyGuard,
    private startJob: StartJob,
    private config: WorkerPoolConfig,
    private broadcaster?: SSEBroadcaster
  ) {}

  /**
   * Register a worker for a job type
   */
  registerWorker(worker: IWorker): void {
    this.workers.set(worker.type, worker);
    console.log(`✅ Registered worker for job type: ${worker.type}`);
  }

  /**
   * Start the worker pool
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️ Worker pool is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Worker pool started (max concurrency: ${this.config.maxConcurrentJobs})`);

    // Recover orphaned jobs from previous server instance
    await this.recoverOrphanedJobs();

    // Start polling for jobs
    this.scheduleNextPoll();
  }

  /**
   * Stop the worker pool
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping worker pool...');
    this.isRunning = false;

    // Clear poll timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Cancel all active jobs
    const cancelPromises = Array.from(this.activeJobs.values()).map(async (execution) => {
      console.log(`  Canceling job: ${execution.job.id}`);
      execution.abortController.abort();
    });

    await Promise.all(cancelPromises);

    console.log('✅ Worker pool stopped');
  }

  /**
   * Get pool status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      availableSlots: this.config.maxConcurrentJobs - this.activeJobs.size,
      registeredWorkers: Array.from(this.workers.keys()),
      currentJobs: Array.from(this.activeJobs.values()).map((e) => ({
        jobId: e.job.id,
        type: e.job.type,
        status: e.job.status,
        startedAt: e.startedAt,
      })),
    };
  }

  /**
   * Schedule next poll
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      await this.pollAndDispatch();
      this.scheduleNextPoll();
    }, this.config.pollIntervalMs);
  }

  /**
   * Poll for queued jobs and dispatch to workers
   */
  private async pollAndDispatch(): Promise<void> {
    try {
      // Check if we have capacity
      const availableSlots = this.config.maxConcurrentJobs - this.activeJobs.size;
      console.log(
        `🔄 Polling for jobs... (${this.activeJobs.size}/${this.config.maxConcurrentJobs} active, ${availableSlots} slots available)`
      );

      if (availableSlots <= 0) {
        console.log('⏸️ Pool is full, skipping poll');
        return; // Pool is full
      }

      // Find queued jobs
      const queuedJobs = await this.findQueuedJobs(availableSlots);
      console.log(`📋 Found ${queuedJobs.length} queued jobs to process`);

      // Dispatch each job
      for (const job of queuedJobs) {
        console.log(`⚡ Dispatching job ${job.id} (type: ${job.type})`);
        await this.dispatchJob(job);
      }
    } catch (error: any) {
      console.error('❌ Error polling for jobs:', error);

      // Log error but don't throw - polling should continue
      // This error is non-critical and shouldn't stop the worker pool
    }
  }

  /**
   * Find queued jobs ready to process
   *
   * CRITICAL FIX: In test mode, queries BOTH production database AND all active test databases
   * This solves the test timeout issue where test jobs were saved to test DBs but never discovered
   */
  private async findQueuedJobs(limit: number): Promise<Job[]> {
    const isTestMode = process.env.NODE_ENV === 'test';

    // In test mode, query all databases (production + active test DBs)
    if (isTestMode) {
      return await this.findQueuedJobsMultiDatabase(limit);
    }

    // Production mode: existing logic
    if (this.config.accountId) {
      return await this.jobRepository.find({
        status: 'queued',
        limit,
        accountId: this.config.accountId,
      });
    }

    // Otherwise, fetch queued jobs across ALL accounts
    // Multi-tenant worker pool handles jobs for all accounts
    const allQueued = await this.jobRepository.find({
      status: 'queued',
      limit,
      // Don't pass accountId to fetch from all accounts
    });

    return allQueued;
  }

  /**
   * Find queued jobs across multiple databases (test mode only)
   *
   * Queries:
   * 1. Production database (for any production jobs)
   * 2. All active test databases (for E2E test jobs)
   *
   * Then combines, deduplicates, and returns up to limit jobs.
   */
  private async findQueuedJobsMultiDatabase(limit: number): Promise<Job[]> {
    const allJobs: Job[] = [];

    // 1. Query production database
    try {
      const productionJobs = await this.jobRepository.find({
        status: 'queued',
        limit,
      });
      console.log(`[WorkerPool] Found ${productionJobs.length} queued jobs in production DB`);
      allJobs.push(...productionJobs);
    } catch (error: any) {
      console.error('[WorkerPool] Error querying production DB:', error.message);
    }

    // 2. Query all active test databases
    // CRITICAL FIX: In test mode with separate jobs database architecture,
    // we need to query jobs databases (worker-0-jobs.db) not data databases (worker-0.db)
    const { getActiveTestDatabases } = await import('../../../utils/get-db-client');
    const testDbPaths = getActiveTestDatabases();

    // Filter to only jobs database paths (exclude data database paths)
    // Jobs databases end with "-jobs.db", data databases end with ".db" (no "-jobs")
    const jobsDbPaths = testDbPaths.filter((path) => path.includes('-jobs.db'));

    if (jobsDbPaths.length > 0) {
      console.log(`[WorkerPool] Querying ${jobsDbPaths.length} active test jobs database(s)...`);

      for (const jobsDbPath of jobsDbPaths) {
        try {
          // Convert jobs DB path back to data DB path for testDbPath
          // (JobRepository expects data DB path, then internally routes to jobs DB)
          // worker-0-jobs.db → worker-0.db
          const dataDbPath = jobsDbPath.replace('-jobs.db', '.db');

          // Create mock request with data DB path (repository will route to jobs DB internally)
          const mockReq = { testDbPath: dataDbPath } as any;

          const testJobs = await this.jobRepository.find(
            {
              status: 'queued',
              limit,
            },
            mockReq
          );

          const dbName = jobsDbPath.split(/[/\\]/).pop(); // Extract filename
          console.log(`[WorkerPool] Found ${testJobs.length} queued jobs in ${dbName}`);
          allJobs.push(...testJobs);
        } catch (error: any) {
          const dbName = jobsDbPath.split(/[/\\]/).pop();
          console.error(`[WorkerPool] Error querying jobs DB ${dbName}:`, error.message);
        }
      }
    }

    // 3. Deduplicate by job ID (in case same job appears in multiple DBs)
    const uniqueJobs = Array.from(new Map(allJobs.map((job) => [job.id, job])).values());

    console.log(
      `[WorkerPool] Combined ${allJobs.length} jobs, ${uniqueJobs.length} unique after deduplication`
    );

    // 4. Return up to limit jobs
    return uniqueJobs.slice(0, limit);
  }

  /**
   * Dispatch job to worker
   */
  private async dispatchJob(job: Job): Promise<void> {
    try {
      // Check concurrency constraints
      const concurrencyCheck = await this.concurrencyGuard.canStart(job);
      if (!concurrencyCheck.canStart) {
        // Block the job
        await this.concurrencyGuard.blockJob(
          job,
          concurrencyCheck.reason || 'Concurrency limit reached'
        );
        console.log(`⏸️ Job ${job.id} blocked: ${concurrencyCheck.reason}`);
        return;
      }

      // Find worker for job type
      const worker = this.workers.get(job.type);
      if (!worker) {
        console.error(`❌ No worker registered for job type: ${job.type}`);
        job.fail({
          code: 'NO_WORKER',
          message: `No worker available for job type: ${job.type}`,
        });
        await this.jobRepository.save(job);
        return;
      }

      // Start the job (transition to running)
      const startResult = await this.startJob.execute({
        jobId: job.id,
        accountId: job.accountId,
      });

      if (!startResult.success) {
        console.error(`❌ Failed to start job ${job.id}: ${startResult.error}`);
        return;
      }

      const runningJob = startResult.job!;

      // Create abort controller for cancellation
      const abortController = new AbortController();

      // Track active job
      this.activeJobs.set(runningJob.id, {
        job: runningJob,
        worker,
        abortController,
        startedAt: new Date(),
      });

      console.log(`▶️ Started job ${runningJob.id} (type: ${runningJob.type})`);

      // Broadcast job started
      if (this.broadcaster) {
        this.broadcaster.broadcastJobUpdate(runningJob);
      }

      // Execute job in background
      this.executeJob(runningJob, worker, abortController.signal);
    } catch (error) {
      console.error(`❌ Error dispatching job ${job.id}:`, error);
    }
  }

  /**
   * Execute job (async, non-blocking)
   */
  private async executeJob(job: Job, worker: IWorker, signal: AbortSignal): Promise<void> {
    try {
      // Create worker context
      const context: WorkerContext = {
        jobRepository: this.jobRepository,
        signal,
        broadcaster: this.broadcaster,
      };

      // Process the job
      const result = await worker.process(job, context);

      // Remove from active jobs
      this.activeJobs.delete(job.id);

      // Reload job (it may have been updated during processing)
      const updatedJob = await this.jobRepository.findById(job.id, job.accountId);
      if (!updatedJob) {
        console.error(`❌ Job ${job.id} disappeared during processing`);
        return;
      }

      // Update job status based on result (only if not already terminal)
      if (!updatedJob.isTerminal) {
        if (result.success) {
          updatedJob.succeed('Job completed successfully');
          console.log(`✅ Job ${job.id} completed successfully`);
        } else {
          updatedJob.fail(result.error!);
          console.log(`❌ Job ${job.id} failed: ${result.error?.message}`);
        }
        await this.jobRepository.save(updatedJob);
      } else {
        console.log(
          `⏭️  Job ${job.id} already in terminal state (${updatedJob.status}), skipping status update`
        );
      }

      // Broadcast job completion
      if (this.broadcaster) {
        this.broadcaster.broadcastJobUpdate(updatedJob);
      }

      // Unblock waiting jobs in same concurrency group
      await this.concurrencyGuard.unblockWaitingJobs(updatedJob);
    } catch (error: any) {
      console.error(`❌ Unexpected error executing job ${job.id}:`, error);

      // Remove from active jobs
      this.activeJobs.delete(job.id);

      // Try to mark job as failed (only if not already in terminal state)
      try {
        const failedJob = await this.jobRepository.findById(job.id, job.accountId);
        if (failedJob && !failedJob.isTerminal) {
          failedJob.fail({
            code: 'UNEXPECTED_ERROR',
            message: error.message || 'Unknown error',
            stack: error.stack,
          });
          await this.jobRepository.save(failedJob);

          // Broadcast failure
          if (this.broadcaster) {
            this.broadcaster.broadcastJobUpdate(failedJob);
          }
        } else if (failedJob?.isTerminal) {
          console.log(
            `⏭️  Job ${job.id} already in terminal state (${failedJob.status}), skipping error update`
          );
        }
      } catch (saveError: any) {
        console.error(`❌ Failed to save error state for job ${job.id}:`, saveError);

        // This is a critical error - log with ErrorFactory but don't throw
        // (would stop the worker pool)
        const apiError = ErrorFactory.internal(
          `Failed to save job error state: ${saveError.message}`,
          'WorkerPool.executeJob',
          {
            jobId: job.id,
            jobType: job.type,
            accountId: job.accountId,
            originalError: error.message,
            saveError: saveError.message,
          }
        );
        console.error('[WorkerPool] Critical error:', apiError);
      }
    }
  }

  /**
   * Cancel a specific job
   *
   * This method is called when a user requests job cancellation.
   * It updates the job status in the database BEFORE signaling the worker to stop.
   * This ensures the worker sees the canceled status on its next checkpoint check.
   */
  async cancelJob(jobId: string, accountId: string, reason?: string): Promise<boolean> {
    const execution = this.activeJobs.get(jobId);
    if (!execution) {
      return false; // Job not running in this pool
    }

    try {
      // 1. Load job from database
      const job = await this.jobRepository.findById(jobId, accountId);
      if (!job) {
        console.warn(`⚠️ Job ${jobId} not found in database during cancel`);
        return false;
      }

      // 2. Update job status to canceled
      job.cancel(reason || 'Canceled by user');
      await this.jobRepository.save(job);

      console.log(`⛔ Job ${jobId} marked as canceled in database`);

      // 3. Broadcast cancellation event
      if (this.broadcaster) {
        this.broadcaster.broadcastJobUpdate(job);
      }

      // 4. Abort the worker execution (signal will be checked on next checkpoint)
      execution.abortController.abort();

      console.log(`📡 Abort signal sent to worker for job ${jobId}`);

      return true;
    } catch (error: any) {
      console.error(`❌ Error canceling job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Recover orphaned jobs from previous server instance
   *
   * When the server restarts, jobs that were in 'running' status
   * are now orphaned (no worker is processing them). We need to
   * mark them as failed so they don't block the queue.
   *
   * Detection strategy:
   * - Find all jobs with status='running'
   * - Check if they were started more than ORPHAN_THRESHOLD_MS ago
   * - Mark as failed with error code 'ORPHANED'
   */
  private async recoverOrphanedJobs(): Promise<void> {
    try {
      console.log('🔍 Checking for orphaned jobs from previous server instance...');

      // Threshold: jobs running for more than 2 minutes are considered orphaned
      // This handles server restarts, crashes, and user logouts quickly
      const ORPHAN_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

      // Find all running jobs
      const runningJobs = await this.jobRepository.find({
        status: 'running',
        limit: 1000, // Check up to 1000 jobs
      });

      if (runningJobs.length === 0) {
        console.log('✅ No orphaned jobs found');
        return;
      }

      console.log(
        `📋 Found ${runningJobs.length} jobs in 'running' status, checking for orphans...`
      );

      let orphanedCount = 0;
      const now = Date.now();

      for (const job of runningJobs) {
        // Check if job was started long ago
        const startedAt = job.state.startedAt?.getTime();
        if (!startedAt) {
          // Job in 'running' without startedAt is invalid, mark as orphaned
          console.log(`⚠️ Job ${job.id} is running without startedAt, marking as orphaned`);
          job.fail({
            code: 'ORPHANED',
            message:
              'Job orphaned: Server restarted while job was running (no startedAt timestamp)',
          });
          await this.jobRepository.save(job);
          orphanedCount++;
          continue;
        }

        const runningTimeMs = now - startedAt;
        if (runningTimeMs > ORPHAN_THRESHOLD_MS) {
          // Job has been running too long, likely orphaned
          const runningMinutes = Math.round(runningTimeMs / 1000 / 60);
          console.log(
            `⚠️ Job ${job.id} has been running for ${runningMinutes} minutes, marking as orphaned`
          );
          job.fail({
            code: 'ORPHANED',
            message: `Job orphaned: Server restarted while job was running (${runningMinutes} minutes ago)`,
          });
          await this.jobRepository.save(job);

          // Broadcast failure
          if (this.broadcaster) {
            this.broadcaster.broadcastJobUpdate(job);
          }

          orphanedCount++;
        } else {
          // Job was recently started, might still be valid
          // This can happen if server restarts very quickly
          console.log(
            `ℹ️ Job ${job.id} started ${Math.round(runningTimeMs / 1000)}s ago, keeping as running`
          );
        }
      }

      if (orphanedCount > 0) {
        console.log(`✅ Recovered ${orphanedCount} orphaned job(s)`);
      } else {
        console.log('✅ No orphaned jobs found (all running jobs are recent)');
      }
    } catch (error: any) {
      console.error('❌ Error recovering orphaned jobs:', error);
      // Don't throw - recovery failure shouldn't prevent worker pool from starting
    }
  }
}
