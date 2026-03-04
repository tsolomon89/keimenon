/**
 * Delete Worker
 *
 * Processes delete jobs for removing data from the system.
 *
 * Responsibilities:
 * - Delete nodes and edges based on scope
 * - Clean up local file storage
 * - Report progress
 * - Handle errors
 *
 * Concurrency: Delete operations run with exclusive lock per account
 * (via concurrency group: delete:{accountId})
 *
 * Related: Product Directive - "Exclusive locks for deletes"
 */

import { promises as fs } from 'fs';
import path from 'path';
import { BaseWorker, WorkerContext, WorkerResult } from '../domain/Worker';
import { Job } from '../../jobs/domain/Job';
import { DatabaseClient } from '@keimenon/db';
import { getLocalDocumentStore } from '../../../services/local-document-store';
import {
  ChangeTracker,
  createChangeTracker,
  trackNodesDeleted,
  trackEdgesDeleted,
  serializeChangeTracker,
} from '../../jobs/domain/ChangeTracker';
import { getKeimenonDataInClause, getSystemNodeInClause } from '@keimenon/types';
import { getDeleteMetrics } from '../../../services/metrics/DeleteMetrics';

export class DeleteWorker extends BaseWorker {
  readonly type = 'delete' as const;

  constructor(private db: DatabaseClient) {
    super();
  }

  /**
   * Get database client for job (test DB if testContext, otherwise production DB)
   */
  private async getDbClientForJob(job: Job): Promise<DatabaseClient> {
    const testDbPath = job.config.testContext?.dbPath;

    if (testDbPath) {
      const path = await import('path');
      console.log(`[DeleteWorker] Using test database: ${path.basename(testDbPath)}`);
      const { getDbClient } = await import('../../../utils/get-db-client');
      const mockReq = { testDbPath } as any;
      return await getDbClient(mockReq);
    }

    return this.db; // Production database
  }

  validate(job: Job): boolean {
    // Check required config
    if (!job.config.deleteScope) {
      return false;
    }

    // Validate scope value
    const validScopes = ['keimenon', 'all-clients'];
    if (!validScopes.includes(job.config.deleteScope)) {
      return false;
    }

    return true;
  }

  protected async execute(job: Job, context: WorkerContext): Promise<WorkerResult> {
    const scope = job.config.deleteScope!;

    console.log(`🗑️ Delete worker processing ${scope} for job ${job.id}`);

    // Bug fix #23: Only write debug log in development mode with explicit env var
    const debugLogPath = process.env.DELETE_WORKER_DEBUG_LOG;
    if (debugLogPath && process.env.NODE_ENV !== 'production') {
      try {
        const debugLog = `
Timestamp: ${new Date().toISOString()}
Job ID: ${job.id}
Scope: ${scope}
Account ID: "${job.accountId}"
DB Path: ${(this.db as any).databasePath}
Node Count Check: Starting...
`;
        await fs.writeFile(debugLogPath, debugLog, { flag: 'a' });
      } catch (e) {
        console.error('Failed to write debug log', e);
      }
    }

    // ⏱️ Start performance timing for metrics
    const startTime = Date.now();
    const deleteMetrics = getDeleteMetrics();

    // ✅ Initialize change tracker for rollback support
    let changeTracker: ChangeTracker = createChangeTracker();

    try {
      // Get correct database client
      const dbClient = await this.getDbClientForJob(job);

      // Step 1: Count nodes to delete
      await this.reportProgress(job, 0, 100, 'Counting nodes...', context);

      const isAdmin = !!job.config.isAdmin;
      // @ts-ignore
      const nodeCount = await this.countNodesToDelete(dbClient, scope, job.accountId, isAdmin);

      // Bug fix #23: Only write debug log in development mode
      if (debugLogPath && process.env.NODE_ENV !== 'production') {
        try {
          await fs.appendFile(debugLogPath, `Node Count: ${nodeCount}\n`);
        } catch (e) {
          void e;
        }
      }

      if (nodeCount === 0) {
        job.updateStats({ nodesDeleted: 0, edgesDeleted: 0 });
        await this.reportProgress(job, 100, 100, 'No nodes to delete', context);
        return {
          success: true,
          metadata: {
            scope,
            nodesDeleted: 0,
            edgesDeleted: 0,
            changeTracker: serializeChangeTracker(changeTracker),
          },
        };
      }

      // Step 2: Delete nodes and edges (batched with progress reporting)
      await this.reportProgress(job, 10, 100, `Deleting ${nodeCount} nodes...`, context);

      // @ts-ignore
      const deleteResult = await this.deleteNodes(
        dbClient,
        scope,
        job.accountId!,
        changeTracker,
        job,
        context,
        isAdmin
      );
      const deletedNodes = deleteResult.deletedCount;
      changeTracker = deleteResult.changeTracker;

      if (this.shouldCancel(context.signal)) {
        return {
          success: false,
          error: {
            code: 'CANCELED',
            message: 'Job was canceled during deletion',
          },
          metadata: {
            changeTracker: serializeChangeTracker(changeTracker),
          },
        };
      }

      // Step 3: Delete edges (cascade delete should handle most)
      await this.reportProgress(job, 80, 100, 'Cleaning up edges...', context);

      // @ts-ignore
      const edgeResult = await this.deleteOrphanedEdges(
        dbClient,
        job.accountId,
        changeTracker,
        isAdmin
      );
      const deletedEdges = edgeResult.deletedCount;
      changeTracker = edgeResult.changeTracker;

      // ✅ Update stats with edge count
      job.updateStats({ edgesDeleted: deletedEdges });

      // Step 4: Clean up local files
      await this.reportProgress(job, 90, 100, 'Cleaning up files...', context);

      // @ts-ignore
      await this.cleanupLocalFiles(dbClient, scope, job.accountId);

      // Step 5: Complete
      await this.reportProgress(job, 100, 100, 'Deletion complete', context);

      // ⏱️ Record metrics for successful completion
      const durationMs = Date.now() - startTime;
      deleteMetrics.recordJobCompletion({
        jobId: job.id,
        accountId: job.accountId,
        scope: scope as 'keimenon' | 'all-clients',
        nodesDeleted: deletedNodes,
        durationMs,
      });

      console.log(
        `✅ Delete worker completed job ${job.id}: ${deletedNodes} nodes deleted in ${durationMs}ms`
      );

      return {
        success: true,
        metadata: {
          scope,
          nodesDeleted: deletedNodes,
          edgesDeleted: deletedEdges,
          durationMs, // ⏱️ Include duration in metadata
          changeTracker: serializeChangeTracker(changeTracker), // ✅ Include for audit trail
        },
      };
    } catch (error: any) {
      console.error(`❌ Delete worker failed for job ${job.id}:`, error);

      // ⏱️ Record metrics for failure
      deleteMetrics.recordJobFailure({
        jobId: job.id,
        accountId: job.accountId,
        scope: scope as 'keimenon' | 'all-clients',
        errorCode: error.code || 'DELETE_FAILED',
        errorMessage: error.message || 'Deletion failed',
      });

      return {
        success: false,
        error: {
          code: error.code || 'DELETE_FAILED',
          message: error.message || 'Deletion failed',
          stack: error.stack,
        },
        metadata: {
          changeTracker: serializeChangeTracker(changeTracker), // ✅ Include for potential rollback
        },
      };
    }
  }

  /**
   * Count nodes to delete
   *
   * Uses node kind constants from packages/types/src/node-kinds.ts
   * to ensure consistency across delete operations.
   *
   * See also: getNodeIdBatch() for matching deletion logic
   */
  private async countNodesToDelete(
    db: DatabaseClient,
    scope: string,
    accountId: string,
    isAdmin = false
  ): Promise<number> {
    if (scope === 'keimenon') {
      // Only count keimenon data nodes (ChatThread, Message, Source, CodeBlock, Group, Folder)
      // System nodes are excluded: UserNode, AccountNode, Board, Constellation
      // Admin users: count ALL keimenon data across all accounts
      const query = isAdmin
        ? `SELECT COUNT(*) as count FROM nodes WHERE kind IN (${getKeimenonDataInClause()})`
        : `SELECT COUNT(*) as count FROM nodes WHERE account_id = ? AND kind IN (${getKeimenonDataInClause()})`;
      const params = isAdmin ? [] : [accountId];
      const result = await db.execute(query, params);
      if (!result?.records?.length) {
        console.warn(
          `[DeleteWorker] Count query returned no records: scope=${scope}, accountId=${accountId}, isAdmin=${isAdmin}`
        );
      }
      return result.records[0]?.count ?? 0;
    } else if (scope === 'all-clients') {
      // Count all client data (exclude system nodes only)
      const query = isAdmin
        ? `SELECT COUNT(*) as count FROM nodes WHERE kind NOT IN (${getSystemNodeInClause()})`
        : `SELECT COUNT(*) as count FROM nodes WHERE account_id = ? AND kind NOT IN (${getSystemNodeInClause()})`;
      const params = isAdmin ? [] : [accountId];
      const result = await db.execute(query, params);
      if (!result?.records?.length) {
        console.warn(
          `[DeleteWorker] Count query returned no records: scope=${scope}, accountId=${accountId}, isAdmin=${isAdmin}`
        );
      }
      return result.records[0]?.count ?? 0;
    }

    return 0;
  }

  /**
   * Delete nodes based on scope - BATCHED to prevent event loop blocking
   *
   * Strategy:
   * 1. Fetch node IDs in batches (500 at a time)
   * 2. Delete each batch in a transaction
   * 3. Yield to event loop between batches (setImmediate)
   * 4. Report progress after each batch
   *
   * This prevents blocking the Node.js event loop when deleting large datasets (10K+ nodes)
   */
  private async deleteNodes(
    db: DatabaseClient,
    scope: string,
    accountId: string,
    changeTracker: ChangeTracker,
    job?: Job,
    context?: WorkerContext,
    isAdmin = false
  ): Promise<{ deletedCount: number; changeTracker: ChangeTracker }> {
    console.log(`🗑️ Deleting nodes for scope: ${scope}, account: ${accountId}`);
    console.log(`Checking database path (via db client): ${(db as any).databasePath || 'unknown'}`);

    const BATCH_SIZE = 500;
    let totalDeleted = 0;
    let batchNumber = 0;
    let tracker = changeTracker;

    // Get total count for progress calculation
    const totalNodes = await this.countNodesToDelete(db, scope, accountId, isAdmin);

    if (totalNodes === 0) {
      return { deletedCount: 0, changeTracker: tracker };
    }

    console.log(`   Total nodes to delete: ${totalNodes}`);
    console.log(`   Batch size: ${BATCH_SIZE}`);
    console.log(`   Estimated batches: ${Math.ceil(totalNodes / BATCH_SIZE)}`);

    // Delete in batches
    while (true) {
      batchNumber++;

      // Check for cancellation
      if (context && this.shouldCancel(context.signal)) {
        console.log(`   ⚠️ Deletion canceled after ${totalDeleted} nodes (batch ${batchNumber})`);
        throw new Error('Deletion canceled by user');
      }

      // Get batch of node IDs
      const nodeIds = await this.getNodeIdBatch(db, scope, accountId, BATCH_SIZE, isAdmin);

      if (nodeIds.length === 0) {
        // No more nodes to delete
        break;
      }

      // ✅ Track node IDs BEFORE deletion (for potential rollback)
      tracker = trackNodesDeleted(tracker, nodeIds);

      // Delete this batch (with CASCADE for edges)
      const batchDeleted = await this.deleteBatch(db, nodeIds, accountId, isAdmin);
      totalDeleted += batchDeleted;

      console.log(
        `   Batch ${batchNumber}: Requested deletion of ${nodeIds.length} IDs. Database reported ${batchDeleted} changes. (${totalDeleted}/${totalNodes} total, ${((totalDeleted / totalNodes) * 100).toFixed(1)}%)`
      );

      // Report progress to job system
      if (job && context) {
        const progressPercent = Math.min(
          Math.round((totalDeleted / totalNodes) * 70), // 10-80% range reserved for deletion
          70
        );
        // ✅ Update stats for real-time SSE feedback
        job.updateStats({ nodesDeleted: totalDeleted });
        await this.reportProgress(
          job,
          10 + progressPercent,
          100,
          `Deleted ${totalDeleted.toLocaleString()} of ${totalNodes.toLocaleString()} nodes...`,
          context
        );
      }

      // CRITICAL: Yield to event loop to prevent blocking
      // This allows HTTP requests, SSE broadcasts, and UI updates to process
      await this.yieldToEventLoop();
    }

    console.log(`   ✅ Deletion complete: ${totalDeleted} nodes deleted in ${batchNumber} batches`);
    return { deletedCount: totalDeleted, changeTracker: tracker };
  }

  /**
   * Get batch of node IDs to delete
   *
   * Uses node kind constants from packages/types/src/node-kinds.ts
   * to ensure consistency with countNodesToDelete().
   *
   * See also: countNodesToDelete() for matching count logic
   */
  private async getNodeIdBatch(
    db: DatabaseClient,
    scope: string,
    accountId: string,
    batchSize: number,
    isAdmin = false
  ): Promise<string[]> {
    let query: string;
    let params: any[];

    if (scope === 'keimenon') {
      // Only delete keimenon data nodes (ChatThread, Message, Source, CodeBlock, Group, Folder)
      // System nodes are preserved: UserNode, AccountNode, Board, Constellation
      // Admin users: select from ALL accounts
      if (isAdmin) {
        query = `SELECT id FROM nodes
                 WHERE kind IN (${getKeimenonDataInClause()})
                 LIMIT ?`;
        params = [batchSize];
      } else {
        query = `SELECT id FROM nodes
                 WHERE account_id = ?
                 AND kind IN (${getKeimenonDataInClause()})
                 LIMIT ?`;
        params = [accountId, batchSize];
      }
    } else if (scope === 'all-clients') {
      // Get client data nodes (exclude system nodes only)
      if (isAdmin) {
        query = `SELECT id FROM nodes
                 WHERE kind NOT IN (${getSystemNodeInClause()})
                 LIMIT ?`;
        params = [batchSize];
      } else {
        query = `SELECT id FROM nodes
                 WHERE account_id = ?
                 AND kind NOT IN (${getSystemNodeInClause()})
                 LIMIT ?`;
        params = [accountId, batchSize];
      }
    } else {
      return [];
    }

    const result = await db.execute(query, params);
    return result.records.map((r: any) => r.id);
  }

  /**
   * Delete a batch of nodes by ID
   * Uses IN clause for efficient deletion
   * CASCADE DELETE will automatically remove associated edges
   */
  private async deleteBatch(
    db: DatabaseClient,
    nodeIds: string[],
    accountId: string,
    isAdmin = false
  ): Promise<number> {
    if (nodeIds.length === 0) {
      return 0;
    }

    // Build parameterized query with placeholders
    const placeholders = nodeIds.map(() => '?').join(',');
    // Admin users: skip account_id filter (nodes already filtered by kind in getNodeIdBatch)
    const query = isAdmin
      ? `DELETE FROM nodes WHERE id IN (${placeholders})`
      : `DELETE FROM nodes WHERE account_id = ? AND id IN (${placeholders})`;
    const params = isAdmin ? [...nodeIds] : [accountId, ...nodeIds];

    const result = await db.execute(query, params);
    return result.records[0]?.changes || nodeIds.length;
  }

  /**
   * Yield to event loop using setImmediate
   * This allows other async operations (HTTP requests, SSE broadcasts) to process
   * Prevents "UI thread starvation" where synchronous operations block everything
   */
  private async yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  /**
   * Delete orphaned edges (edges without valid from/to nodes)
   */
  private async deleteOrphanedEdges(
    db: DatabaseClient,
    accountId: string,
    changeTracker: ChangeTracker,
    isAdmin = false
  ): Promise<{ deletedCount: number; changeTracker: ChangeTracker }> {
    // Admin users: check ALL edges for orphans (not just current account)
    const accountFilter = isAdmin ? '' : 'AND account_id = ?';
    const params = isAdmin ? [] : [accountId];

    // ✅ First, get the IDs of edges to be deleted (for tracking)
    const edgeIdsResult = await db.execute(
      `SELECT id FROM edges
       WHERE 1=1
       ${accountFilter}
       AND (
         from_id NOT IN (SELECT id FROM nodes)
         OR to_id NOT IN (SELECT id FROM nodes)
       )`,
      params
    );

    const edgeIds = edgeIdsResult.records.map((r: any) => r.id);

    if (edgeIds.length === 0) {
      return { deletedCount: 0, changeTracker };
    }

    // ✅ Track edge IDs BEFORE deletion
    const tracker = trackEdgesDeleted(changeTracker, edgeIds);

    // Now delete the edges
    const result = await db.execute(
      `DELETE FROM edges
       WHERE 1=1
       ${accountFilter}
       AND (
         from_id NOT IN (SELECT id FROM nodes)
         OR to_id NOT IN (SELECT id FROM nodes)
       )`,
      params
    );

    const deletedCount = result.records[0]?.changes || 0;

    if (deletedCount > 0) {
      console.log(`   Cleaned up ${deletedCount} orphaned edges`);
    }

    return { deletedCount, changeTracker: tracker };
  }

  /**
   * Clean up local files for deleted nodes
   */
  private async cleanupLocalFiles(
    db: DatabaseClient,
    scope: string,
    accountId: string
  ): Promise<void> {
    console.log(`🗑️ Cleaning up local files for account: ${accountId}`);

    const localStore = getLocalDocumentStore();

    try {
      // Strategy: Query nodes BEFORE deletion to extract document IDs from properties,
      // then delete those files after nodes are removed.
      // This works because we call this AFTER deleteNodes(), so we need to rely on
      // the fact that nodes are already deleted. Instead, we'll change the order.

      // NOTE: We're being called AFTER node deletion, so we can't query nodes anymore.
      // The proper approach would be to:
      // 1. Query document IDs from nodes before deletion
      // 2. Delete nodes
      // 3. Delete files using the saved document IDs
      //
      // However, since we're already past deletion, we'll implement a safe cleanup
      // that checks for orphaned metadata files (metadata without corresponding nodes).

      const stats = await localStore.getStats();
      console.log(`   Found ${stats.totalDocuments} documents in local storage`);
      console.log(`   Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);

      // Get all document IDs from metadata
      const metadataPath = path.join(localStore['basePath'], 'metadata');
      const files = await fs.readdir(metadataPath);

      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.meta.json')) continue;

        const metaFilePath = path.join(metadataPath, file);
        const content = await fs.readFile(metaFilePath, 'utf-8');
        const metadata = JSON.parse(content);

        // Check if any node references this document
        // Documents are typically stored in conversation/message folders named by ID
        // or referenced in node properties as documentId
        const result = await db.execute(
          `SELECT COUNT(*) as count FROM nodes
           WHERE account_id = ?
           AND (
             json_extract(properties, '$.documentId') = ?
             OR json_extract(properties, '$.sourceDocumentId') = ?
             OR id = ?
           )`,
          [accountId, metadata.id, metadata.id, metadata.id]
        );

        const nodeCount = result.records[0]?.count || 0;

        // If no nodes reference this document, it's orphaned - delete it
        if (nodeCount === 0) {
          const deleted = await localStore.deleteContent(metadata.id);
          if (deleted) {
            deletedCount++;
          }
        }
      }

      console.log(`   ✅ Deleted ${deletedCount} orphaned document files`);

      if (deletedCount > 0) {
        // Log new stats
        const newStats = await localStore.getStats();
        console.log(
          `   Remaining: ${newStats.totalDocuments} documents (${(newStats.totalSize / 1024 / 1024).toFixed(2)} MB)`
        );
      }
    } catch (error: any) {
      console.warn(`   Failed to cleanup local files: ${error.message}`);
      // Don't throw - file cleanup failure shouldn't block node deletion
    }
  }
}
