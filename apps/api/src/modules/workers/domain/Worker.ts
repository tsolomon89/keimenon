/**
 * Worker Interface
 *
 * Defines the contract for workers that process jobs.
 * Each job type (import, delete, export) has its own worker implementation.
 *
 * Responsibilities:
 * - Process a job from start to finish
 * - Report progress via job.updateProgress()
 * - Handle errors gracefully
 * - Support cancellation
 *
 * Related: Product Directive - "Background execution"
 */

import { Job } from '../../jobs/domain/Job';
import { JobRepository } from '../../jobs/infrastructure/JobRepository';
import { SSEBroadcaster } from '../../jobs/infrastructure/SSEBroadcaster';
import { ImportJobStage } from '@keimenon/types';

export interface WorkerContext {
  jobRepository: JobRepository;
  signal: AbortSignal; // For cancellation
  broadcaster?: SSEBroadcaster; // For progress updates
}

export interface WorkerResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Worker Interface
 */
export interface IWorker {
  /**
   * Worker type (matches job type)
   */
  readonly type: 'import' | 'delete' | 'export' | 'analyze';

  /**
   * Process a job
   *
   * @param job - The job to process
   * @param context - Worker context (repository, abort signal)
   * @returns Result of processing
   */
  process(job: Job, context: WorkerContext): Promise<WorkerResult>;

  /**
   * Validate job config before processing
   */
  validate(job: Job): boolean;
}

/**
 * Abstract base worker class
 */
export abstract class BaseWorker implements IWorker {
  abstract readonly type: 'import' | 'delete' | 'export' | 'analyze';

  async process(job: Job, context: WorkerContext): Promise<WorkerResult> {
    try {
      // Validate config
      if (!this.validate(job)) {
        return {
          success: false,
          error: {
            code: 'INVALID_CONFIG',
            message: 'Job configuration is invalid',
          },
        };
      }

      // Check if already canceled
      if (context.signal.aborted) {
        return {
          success: false,
          error: {
            code: 'CANCELED',
            message: 'Job was canceled before processing started',
          },
        };
      }

      // Execute the job
      const result = await this.execute(job, context);

      return result;
    } catch (error: any) {
      // Check if it was a cancellation
      if (context.signal.aborted || error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'CANCELED',
            message: 'Job was canceled during processing',
          },
        };
      }

      // Regular error
      return {
        success: false,
        error: {
          code: error.code || 'PROCESSING_ERROR',
          message: error.message || 'Unknown error occurred',
          stack: error.stack,
        },
      };
    }
  }

  /**
   * Execute the job (to be implemented by subclasses)
   */
  protected abstract execute(job: Job, context: WorkerContext): Promise<WorkerResult>;

  /**
   * Validate job config (to be implemented by subclasses)
   */
  abstract validate(job: Job): boolean;

  /**
   * Helper: Report progress and persist
   */
  protected async reportProgress(
    job: Job,
    current: number,
    total: number,
    message: string,
    context: WorkerContext,
    stage?: ImportJobStage,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    job.updateProgress(current, total, message, stage, metadata);
    await context.jobRepository.save(job);

    // Broadcast progress update via SSE
    if (context.broadcaster) {
      context.broadcaster.broadcastJobUpdate(job);
    }
  }

  /**
   * Helper: Check if job should be canceled
   */
  protected shouldCancel(signal: AbortSignal): boolean {
    return signal.aborted;
  }
}
