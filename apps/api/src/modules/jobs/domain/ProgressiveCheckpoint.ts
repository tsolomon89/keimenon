/**
 * Progressive Checkpoint Helper
 *
 * Provides utilities for saving job state periodically during long-running operations.
 * This enables resume capability if the process crashes mid-execution.
 *
 * Usage:
 *   const checkpoint = createProgressiveCheckpoint(job, context, 10);
 *   for (const batch of batches) {
 *     // ... process batch ...
 *     await checkpoint.saveIfNeeded(changeTracker, batchNumber);
 *   }
 *
 * Related: Product Directive - "Resilient job processing with resume capability"
 */

import { Job } from './Job';
import { ChangeTracker, serializeChangeTracker } from './ChangeTracker';
import { WorkerContext } from '../../workers/domain/Worker';

export interface ProgressiveCheckpointOptions {
  /** How often to save checkpoint (every N batches) */
  interval: number;

  /** Optional custom logger */
  logger?: (message: string) => void;
}

/**
 * Progressive Checkpoint Manager
 */
export class ProgressiveCheckpoint {
  private lastCheckpointBatch: number = 0;

  constructor(
    private job: Job,
    private context: WorkerContext,
    private options: ProgressiveCheckpointOptions
  ) {}

  /**
   * Save checkpoint if interval has been reached
   *
   * @param changeTracker - Current change tracker state
   * @param currentBatch - Current batch number
   * @returns Promise<boolean> - True if checkpoint was saved
   */
  async saveIfNeeded(changeTracker: ChangeTracker, currentBatch: number): Promise<boolean> {
    const batchesSinceCheckpoint = currentBatch - this.lastCheckpointBatch;

    if (batchesSinceCheckpoint >= this.options.interval) {
      await this.save(changeTracker, currentBatch);
      return true;
    }

    return false;
  }

  /**
   * Force save checkpoint regardless of interval
   *
   * @param changeTracker - Current change tracker state
   * @param currentBatch - Current batch number
   */
  async save(changeTracker: ChangeTracker, currentBatch: number): Promise<void> {
    try {
      const checkpoint = {
        batch: currentBatch,
        timestamp: new Date().toISOString(),
        nodesTracked: changeTracker.nodesCreated.length + changeTracker.nodesDeleted.length,
        edgesTracked: changeTracker.edgesCreated.length + changeTracker.edgesDeleted.length,
      };

      const stateData = this.job.state as any;
      this.job.updateState({
        metadata: {
          ...(stateData.metadata || {}),
          checkpoint,
          changeTracker: serializeChangeTracker(changeTracker),
        },
      });

      await this.context.jobRepository.save(this.job);
      this.lastCheckpointBatch = currentBatch;

      const logger = this.options.logger || console.log;
      logger(
        `Checkpoint saved at batch ${currentBatch} (${checkpoint.nodesTracked} nodes, ${checkpoint.edgesTracked} edges tracked)`
      );
    } catch (error: any) {
      // Non-fatal - checkpoint failures should not stop the running job.
      console.error(`[ProgressiveCheckpoint] Failed to save checkpoint:`, error.message);
    }
  }

  /**
   * Get the last batch number that was checkpointed
   */
  getLastCheckpointBatch(): number {
    return this.lastCheckpointBatch;
  }
}

/**
 * Create a progressive checkpoint manager
 *
 * @param job - Job being processed
 * @param context - Worker context (includes jobRepository)
 * @param interval - How often to save checkpoint (every N batches)
 * @param logger - Optional custom logger
 * @returns ProgressiveCheckpoint instance
 */
export function createProgressiveCheckpoint(
  job: Job,
  context: WorkerContext,
  interval: number = 10,
  logger?: (message: string) => void
): ProgressiveCheckpoint {
  return new ProgressiveCheckpoint(job, context, { interval, logger });
}

/**
 * Resume from checkpoint if available
 *
 * Loads the saved changeTracker and checkpoint metadata from job state.
 * Returns null if no checkpoint exists.
 *
 * @param job - Job to resume
 * @returns Checkpoint data or null
 */
export function loadCheckpoint(job: Job): {
  changeTracker: ChangeTracker;
  batch: number;
  timestamp: string;
} | null {
  try {
    const stateData = job.state as any;
    const metadata = stateData.metadata || {};
    const checkpoint = stateData.checkpoint || metadata.checkpoint;
    const changeTracker = stateData.changeTracker || metadata.changeTracker;

    if (!checkpoint || !changeTracker) {
      return null;
    }

    return {
      changeTracker,
      batch: checkpoint.batch,
      timestamp: checkpoint.timestamp,
    };
  } catch (error: any) {
    console.error(`[ProgressiveCheckpoint] Failed to load checkpoint:`, error.message);
    return null;
  }
}
