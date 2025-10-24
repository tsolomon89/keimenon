/**
 * StartJob Use Case
 *
 * Command: Transition job from queued to running.
 *
 * Responsibilities:
 * - Load job from repository
 * - Check if job can be started (status = queued)
 * - Transition to running state
 * - Persist updated state
 *
 * Called by: Worker pool when picking up queued jobs
 *
 * Related: Product Directive - "Worker pool architecture"
 */

import { Job } from '../domain/Job';
import { JobRepository } from '../infrastructure/JobRepository';

export interface StartJobCommand {
  jobId: string;
  accountId: string;
}

export interface StartJobResult {
  success: boolean;
  job?: Job;
  error?: string;
}

/**
 * StartJob Use Case
 */
export class StartJob {
  constructor(private jobRepository: JobRepository) {}

  async execute(command: StartJobCommand): Promise<StartJobResult> {
    try {
      // 1. Load job
      const job = await this.jobRepository.findById(command.jobId, command.accountId);

      if (!job) {
        return {
          success: false,
          error: 'Job not found',
        };
      }

      // 2. Check if can start
      if (!job.canStart) {
        return {
          success: false,
          error: `Cannot start job in status: ${job.status}`,
        };
      }

      // 3. Transition to running
      job.start();

      // 4. Persist
      await this.jobRepository.save(job);

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
