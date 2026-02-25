/**
 * CompensateJob Use Case
 *
 * Command: Rollback a failed job's partial database changes.
 *
 * Responsibilities:
 * - Load job and its change tracker from repository
 * - Delete created nodes/edges (reverse operation)
 * - Mark job with compensation metadata
 * - Persist updated state
 *
 * Architecture:
 * - Uses ChangeTracker from job.state_data
 * - Deletes entities in batches (prevents event loop blocking)
 * - Can be called manually or automatically on job failure
 * - Idempotent (safe to retry)
 *
 * Authorization: Only admins or system can trigger compensation
 *
 * Related: Product Directive - "No orphaned data from failed imports"
 */

import { Job } from '../domain/Job';
import { JobRepository } from '../infrastructure/JobRepository';
import { ChangeTracker, deserializeChangeTracker } from '../domain/ChangeTracker';
import { SQLiteClient } from '@keimenon/db';

export interface CompensateJobCommand {
  jobId: string;
  accountId: string;
  compensatedBy: string; // user_id or 'system'
}

export interface CompensateJobResult {
  success: boolean;
  job?: Job;
  compensation?: {
    nodesDeleted: number;
    edgesDeleted: number;
    duration: number;
  };
  error?: string;
}

/**
 * CompensateJob Use Case
 */
export class CompensateJob {
  constructor(
    private jobRepository: JobRepository,
    private db: SQLiteClient
  ) {}

  async execute(command: CompensateJobCommand): Promise<CompensateJobResult> {
    const startTime = Date.now();

    try {
      // 1. Load job
      const job = await this.jobRepository.findById(command.jobId, command.accountId);

      if (!job) {
        return {
          success: false,
          error: 'Job not found',
        };
      }

      // 2. Get raw state_data to access changeTracker
      const stateData = await this.jobRepository.getRawStateData(job.id, command.accountId) || {};

      if (stateData.compensated) {
        console.log(`[CompensateJob] Job ${job.id} already compensated, skipping`);
        return {
          success: true,
          job,
          compensation: stateData.compensation || {
            nodesDeleted: 0,
            edgesDeleted: 0,
            duration: 0,
          },
        };
      }

      // 3. Extract change tracker
      const changeTracker: ChangeTracker = stateData.changeTracker
        ? deserializeChangeTracker(stateData.changeTracker)
        : {
            nodesCreated: [],
            edgesCreated: [],
            nodesDeleted: [],
            edgesDeleted: [],
            checkpointAt: Date.now(),
            changesSinceCheckpoint: 0,
          };

      console.log(`[CompensateJob] Starting compensation for job ${job.id}`);
      console.log(`   Nodes to delete: ${changeTracker.nodesCreated.length}`);
      console.log(`   Edges to delete: ${changeTracker.edgesCreated.length}`);

      // 4. Enable direct writes for rollback operation
      this.db.enableDirectWrites();

      try {
        // 5. Delete created edges (must delete edges before nodes due to foreign keys)
        let edgesDeleted = 0;
        if (changeTracker.edgesCreated.length > 0) {
          edgesDeleted = this.db.batchDeleteEdges(
            changeTracker.edgesCreated,
            command.accountId
          );
        }

        // 6. Delete created nodes
        let nodesDeleted = 0;
        if (changeTracker.nodesCreated.length > 0) {
          nodesDeleted = this.db.batchDeleteNodes(
            changeTracker.nodesCreated,
            command.accountId
          );
        }

        const duration = Date.now() - startTime;

        // 7. Update job state with compensation metadata
        const compensation = {
          nodesDeleted,
          edgesDeleted,
          duration,
          compensatedAt: new Date().toISOString(),
          compensatedBy: command.compensatedBy,
        };

        // Update state_data with compensation info
        stateData.compensated = true;
        stateData.compensation = compensation;

        await this.jobRepository.updateStateData(job.id, command.accountId, JSON.stringify(stateData));

        console.log(`[CompensateJob] ✅ Compensation complete for job ${job.id}`);
        console.log(`   Deleted: ${nodesDeleted} nodes, ${edgesDeleted} edges`);
        console.log(`   Duration: ${duration}ms`);

        return {
          success: true,
          job,
          compensation,
        };
      } finally {
        // Always disable direct writes when done
        this.db.disableDirectWrites();
      }
    } catch (error: any) {
      console.error(`[CompensateJob] ❌ Compensation failed for job ${command.jobId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

}
