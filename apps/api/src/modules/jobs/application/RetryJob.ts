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
  constructor(private jobRepository: JobRepository) {}

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

    console.log(`✅ Retried job ${jobId} → new job ${newJob.id}`);

    return {
      success: true,
      originalJob,
      newJob,
    };
  }
}
