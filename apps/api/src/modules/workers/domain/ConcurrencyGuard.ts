/**
 * Concurrency Guard
 *
 * Enforces concurrency rules for jobs in the same concurrency group.
 * Prevents conflicts like running an import while a delete is in progress.
 *
 * Rules:
 * - Jobs without concurrency_group can run in parallel
 * - Jobs with same concurrency_group run exclusively (one at a time)
 * - Delete operations should have account-wide concurrency group
 *
 * Related: Product Directive - "Exclusive locks for deletes"
 */

import { Job } from '../../jobs/domain/Job';
import { JobRepository } from '../../jobs/infrastructure/JobRepository';

export interface ConcurrencyCheck {
  canStart: boolean;
  reason?: string;
  blockedBy?: string[]; // Job IDs blocking this job
}

/**
 * Concurrency Guard
 */
export class ConcurrencyGuard {
  constructor(private jobRepository: JobRepository) {}

  /**
   * Check if job can start based on concurrency rules
   */
  async canStart(job: Job): Promise<ConcurrencyCheck> {
    // Jobs without concurrency group can always start
    if (!job.concurrencyGroup) {
      return { canStart: true };
    }

    // Check for active jobs in same concurrency group
    const activeCount = await this.jobRepository.countActiveInGroup(
      job.concurrencyGroup,
      job.accountId
    );

    // If there are active jobs in this group (excluding current job)
    // then this job must wait
    if (activeCount > 0) {
      // Find which jobs are blocking
      const activeJobs = await this.jobRepository.find({
        accountId: job.accountId,
        status: ['queued', 'running'],
        limit: 10,
      });

      const blockingJobs = activeJobs
        .filter((j) => j.concurrencyGroup === job.concurrencyGroup && j.id !== job.id)
        .map((j) => j.id);

      return {
        canStart: false,
        reason: `Blocked by ${activeCount} active job(s) in concurrency group: ${job.concurrencyGroup}`,
        blockedBy: blockingJobs,
      };
    }

    return { canStart: true };
  }

  /**
   * Block a job due to concurrency conflict
   */
  async blockJob(job: Job, reason: string): Promise<void> {
    job.block(reason);
    await this.jobRepository.save(job);
  }

  /**
   * Unblock jobs that were blocked by concurrency
   */
  async unblockWaitingJobs(completedJob: Job): Promise<Job[]> {
    if (!completedJob.concurrencyGroup) {
      return [];
    }

    // Find blocked jobs in the same concurrency group
    const blockedJobs = await this.jobRepository.find({
      accountId: completedJob.accountId,
      status: ['blocked'],
      limit: 100,
    });

    const toUnblock = blockedJobs.filter(
      (j) => j.concurrencyGroup === completedJob.concurrencyGroup
    );

    // Retry blocked jobs (move back to queued)
    for (const job of toUnblock) {
      job.retry();
      await this.jobRepository.save(job);
    }

    return toUnblock;
  }

  /**
   * Get concurrency group for job type
   *
   * This defines the default concurrency groups:
   * - Delete: account-wide exclusive lock
   * - Import: no default concurrency (can be set per-job)
   * - Export: no default concurrency
   */
  static getConcurrencyGroup(
    jobType: 'import' | 'delete' | 'export' | 'analyze',
    accountId: string,
    customGroup?: string
  ): string | undefined {
    if (customGroup) {
      return customGroup;
    }

    // Delete operations are exclusive per account
    if (jobType === 'delete') {
      return `delete:${accountId}`;
    }

    // No default concurrency for other job types
    return undefined;
  }
}
