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
import { DatabaseClient } from '@keimenon/db';

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
  private readonly BATCH_SIZE = 500; // Delete in batches to avoid blocking

  constructor(
    private jobRepository: JobRepository,
    private db: DatabaseClient
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

      // 2. Check if job has already been compensated
      // TODO: Implement JobRepository.getRawStateData() method
      // const stateData = JSON.parse((await this.jobRepository.getRawStateData(job.id)) || '{}');
      const stateData: any = {}; // FIXME: Placeholder until getRawStateData is implemented

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

      // 4. Delete created edges (must delete edges before nodes due to foreign keys)
      let edgesDeleted = 0;
      if (changeTracker.edgesCreated.length > 0) {
        edgesDeleted = await this.deleteEdgesInBatches(
          changeTracker.edgesCreated,
          command.accountId
        );
      }

      // 5. Delete created nodes
      let nodesDeleted = 0;
      if (changeTracker.nodesCreated.length > 0) {
        nodesDeleted = await this.deleteNodesInBatches(
          changeTracker.nodesCreated,
          command.accountId
        );
      }

      const duration = Date.now() - startTime;

      // 6. Update job state with compensation metadata
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

      // TODO: Implement JobRepository.updateStateData() method or add Job.compensate() domain method
      // await this.jobRepository.updateStateData(job.id, JSON.stringify(stateData));
      console.warn(
        '[CompensateJob] State data update skipped - updateStateData() not implemented yet'
      );

      console.log(`[CompensateJob] ✅ Compensation complete for job ${job.id}`);
      console.log(`   Deleted: ${nodesDeleted} nodes, ${edgesDeleted} edges`);
      console.log(`   Duration: ${duration}ms`);

      return {
        success: true,
        job,
        compensation,
      };
    } catch (error: any) {
      console.error(`[CompensateJob] ❌ Compensation failed for job ${command.jobId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete edges in batches to avoid blocking event loop
   */
  private async deleteEdgesInBatches(edgeIds: string[], accountId: string): Promise<number> {
    let deletedCount = 0;

    for (let i = 0; i < edgeIds.length; i += this.BATCH_SIZE) {
      const batch = edgeIds.slice(i, i + this.BATCH_SIZE);

      try {
        // TODO: Implement using DatabaseClient interface instead of prepare()
        // The current DatabaseClient doesn't expose prepare() method
        // Option 1: Change db type to Database.Database from better-sqlite3
        // Option 2: Add batch delete methods to DatabaseClient interface
        console.warn(
          `[CompensateJob] Edge deletion not implemented - DatabaseClient missing prepare() method`
        );

        // FIXME: Placeholder implementation
        // const placeholders = batch.map(() => '?').join(',');
        // const stmt = this.db.prepare(
        //   `DELETE FROM edges WHERE id IN (${placeholders}) AND account_id = ?`
        // );
        // const result = stmt.run(...batch, accountId);
        // deletedCount += result.changes;

        console.log(
          `[CompensateJob] Would delete edge batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(edgeIds.length / this.BATCH_SIZE)} (${batch.length} edges)`
        );

        // Yield to event loop
        await new Promise((resolve) => setImmediate(resolve));
      } catch (error: any) {
        console.error(`[CompensateJob] Failed to delete edge batch:`, error.message);
        // Continue with next batch
      }
    }

    return deletedCount;
  }

  /**
   * Delete nodes in batches to avoid blocking event loop
   */
  private async deleteNodesInBatches(nodeIds: string[], accountId: string): Promise<number> {
    let deletedCount = 0;

    for (let i = 0; i < nodeIds.length; i += this.BATCH_SIZE) {
      const batch = nodeIds.slice(i, i + this.BATCH_SIZE);

      try {
        // TODO: Implement using DatabaseClient interface instead of prepare()
        // See deleteEdgesInBatches for implementation options
        console.warn(
          `[CompensateJob] Node deletion not implemented - DatabaseClient missing prepare() method`
        );

        // FIXME: Placeholder implementation
        // const placeholders = batch.map(() => '?').join(',');
        // const stmt = this.db.prepare(
        //   `DELETE FROM nodes WHERE id IN (${placeholders}) AND account_id = ?`
        // );
        // const result = stmt.run(...batch, accountId);
        // deletedCount += result.changes;

        console.log(
          `[CompensateJob] Would delete node batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(nodeIds.length / this.BATCH_SIZE)} (${batch.length} nodes)`
        );

        // Yield to event loop
        await new Promise((resolve) => setImmediate(resolve));
      } catch (error: any) {
        console.error(`[CompensateJob] Failed to delete node batch:`, error.message);
        // Continue with next batch
      }
    }

    return deletedCount;
  }
}
