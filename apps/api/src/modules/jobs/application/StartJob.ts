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

      // 3. Transition to running (in-memory state update)
      job.start();

      // 4. Persist with optimistic locking (atomic transition)
      // This prevents race conditions where multiple worker pool instances
      // try to claim the same queued job
      const stateData = JSON.stringify(job.state);
      const claimed = await this.jobRepository.atomicTransition(
        job.id,
        job.accountId,
        'queued', // fromStatus - must still be queued
        'running', // toStatus - transition to running
        stateData
      );

      if (!claimed) {
        // Another worker instance already claimed this job
        return {
          success: false,
          error: 'Job already claimed by another worker',
        };
      }

      // ✅ CRITICAL FIX: Persist 'started' event
      // atomicTransition only updates the job table, not the event log.
      // We must explicitly save the event to maintain the event stream and sequence numbers.
      const startedEvent = job.events[job.events.length - 1];
      if (startedEvent.type === 'job.started') {
        await this.jobRepository.appendEvent(startedEvent);
      } else {
        console.warn(
          `[StartJob] Expected last event to be job.started, found ${startedEvent.type}`
        );
      }

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
