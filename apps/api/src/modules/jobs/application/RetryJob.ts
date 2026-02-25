/**
 * Retry Job Use Case
 *
 * Creates a new job with the same configuration as a failed/canceled job.
 * This allows users to retry jobs that failed due to transient errors
 * or jobs that were canceled.
 *
 * Use cases:
 * - Retry failed import after fixing data
 * - Retry canceled delete operation
 * - Retry job that timed out
 *
 * Related: Product Directive - "Jobs as first-class citizens"
 */

import { Job, JobSpec } from '../domain/Job';
import { JobRepository } from '../infrastructure/JobRepository';
import { SSEBroadcaster } from '../infrastructure/SSEBroadcaster';

export interface RetryJobCommand {
  jobId: string;
  accountId: string;
  retriedBy: string; // user_id who initiated retry
}

export interface RetryJobResult {
  success: boolean;
  error?: string;
  originalJob?: Job;
  newJob?: Job;
}

/**
 * Retry Job Use Case
 */
export class RetryJob {
  constructor(
    private jobRepository: JobRepository,
    private broadcaster?: SSEBroadcaster
  ) {}

  async execute(command: RetryJobCommand): Promise<RetryJobResult> {
    const { jobId, accountId, retriedBy } = command;

    // 1. Load original job
    const originalJob = await this.jobRepository.findById(jobId, accountId);
    if (!originalJob) {
      return {
        success: false,
        error: 'Job not found',
      };
    }

    // 2. Validate that job can be retried
    // Only allow retry of terminal states (failed, canceled, succeeded)
    if (!originalJob.isTerminal) {
      return {
        success: false,
        error: `Cannot retry job in status: ${originalJob.status}. Only failed, canceled, or succeeded jobs can be retried.`,
        originalJob,
      };
    }

    // 3. Create new job with same config
    const spec: JobSpec = {
      type: originalJob.type,
      accountId: originalJob.accountId,
      createdBy: retriedBy, // Track who retried it
      config: originalJob.config,
      // Don't copy idempotency key (allow duplicate retries)
      // Don't copy concurrency group (will be checked again)
    };

    const newJob = Job.create(spec);

    // 4. Save new job
    await this.jobRepository.save(newJob);

    // 5. Broadcast new job to SSE clients (so UI shows it immediately)
    if (this.broadcaster) {
      this.broadcaster.broadcastJobUpdate(newJob);
    }

    // 6. Copy checkpoint from original job (if exists) for resume capability
    // This enables crash recovery: if job was interrupted, it can resume from checkpoint
    try {
      const originalStateData = await this.jobRepository.getRawStateData(jobId, accountId);
      if (originalStateData?.checkpoint && originalStateData.checkpoint.phase !== 'complete') {
        console.log(`📋 Copying checkpoint from job ${jobId} to ${newJob.id} for resume`);
        console.log(`   - Phase: ${originalStateData.checkpoint.phase}`);
        console.log(`   - Conversations: ${originalStateData.checkpoint.conversationsProcessed}`);

        // Copy checkpoint and changeTracker to new job
        const newStateData = {
          checkpoint: originalStateData.checkpoint,
          changeTracker: originalStateData.changeTracker,
          resumedFrom: jobId,
        };
        await this.jobRepository.updateStateData(newJob.id, accountId, JSON.stringify(newStateData));
      }
    } catch (error: any) {
      // Non-fatal: if checkpoint copy fails, job will start fresh
      console.warn(`⚠️ Could not copy checkpoint from job ${jobId}: ${error.message}`);
    }

    console.log(`✅ Retried job ${jobId} → new job ${newJob.id}`);

    return {
      success: true,
      originalJob,
      newJob,
    };
  }
}
