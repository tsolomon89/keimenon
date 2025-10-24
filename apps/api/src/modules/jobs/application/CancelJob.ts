/**
 * CancelJob Use Case
 *
 * Command: Cancel a job (queued, running, or blocked).
 *
 * Responsibilities:
 * - Load job from repository
 * - Check if job can be canceled
 * - Transition to canceled state
 * - Persist updated state
 * - Signal worker to stop (if running)
 *
 * Authorization: Only the user who created the job (or admin) can cancel it
 *
 * Related: Product Directive - "User can cancel jobs"
 */

import { Job } from '../domain/Job';
import { JobRepository } from '../infrastructure/JobRepository';

export interface CancelJobCommand {
  jobId: string;
  accountId: string;
  canceledBy: string; // user_id
  reason?: string;
}

export interface CancelJobResult {
  success: boolean;
  job?: Job;
  error?: string;
}

/**
 * CancelJob Use Case
 */
export class CancelJob {
  constructor(private jobRepository: JobRepository) {}

  async execute(command: CancelJobCommand): Promise<CancelJobResult> {
    try {
      // 1. Load job
      const job = await this.jobRepository.findById(command.jobId, command.accountId);

      if (!job) {
        return {
          success: false,
          error: 'Job not found',
        };
      }

      // 2. Authorization check
      // TODO: Check if canceledBy is admin or job creator
      // For now, just check account_id matches

      // 3. Check if can cancel
      if (!job.canCancel) {
        return {
          success: false,
          error: `Cannot cancel job in status: ${job.status}`,
        };
      }

      // 4. Transition to canceled
      const reason = command.reason || 'Canceled by user';
      job.cancel(reason);

      // 5. Persist
      await this.jobRepository.save(job);

      // 6. TODO: Signal worker to stop (if running)
      // This will be handled by the worker pool in Phase 3

      return {
        success: true,
        job,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
