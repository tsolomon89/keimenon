/**
 * DB Worker Singleton
 *
 * Provides a global DbWorkerClient instance that the import pipeline,
 * delete worker, and post-import services use to run long-running
 * SQLite operations off the main thread.
 *
 * Initialization:
 *   Call initDbWorker(dbPath) during app startup, after the DB path is resolved.
 *   The worker starts asynchronously and is ready by the time the first
 *   import/delete job runs.
 *
 * Usage:
 *   import { getDbWorker } from '../workers/db-worker-singleton';
 *   const worker = getDbWorker();
 *   if (worker?.isReady()) {
 *     await worker.flushImportBatch(nodes, edges);
 *   }
 */

import { DbWorkerClient } from './DbWorkerClient';

let instance: DbWorkerClient | null = null;

/**
 * Initialize the global DB worker. Call once during app startup.
 * Safe to call multiple times (idempotent — subsequent calls are no-ops).
 */
export async function initDbWorker(dbPath: string): Promise<DbWorkerClient> {
  if (instance) {
    return instance;
  }

  instance = new DbWorkerClient(dbPath);
  await instance.start();
  return instance;
}

/**
 * Get the global DB worker client, or null if not yet initialized.
 * Callers should always check isReady() before dispatching operations.
 */
export function getDbWorker(): DbWorkerClient | null {
  return instance;
}

/**
 * Shutdown the global DB worker. Call during graceful shutdown.
 */
export async function stopDbWorker(): Promise<void> {
  if (instance) {
    await instance.stop();
    instance = null;
  }
}
