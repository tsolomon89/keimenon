/**
 * DbWorkerClient
 *
 * Main-thread client for the off-main-thread SQLite worker.
 * Wraps worker_threads postMessage/onMessage into typed, Promise-returning
 * methods with operation IDs, progress callbacks, and crash recovery.
 *
 * Usage:
 *   const client = new DbWorkerClient(dbPath);
 *   await client.start();
 *   const result = await client.flushImportBatch(nodes, edges);
 *   await client.stop();
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { promises as fs } from 'fs';
import type {
  DbWorkerInit,
  DbWorkerOperation,
  DbWorkerMessage,
  FlushImportBatchResult,
  ComputeAuthorityResult,
  DeleteSubgraphResult,
  RebuildInvertedIndexResult,
  HealthCheckResult,
  SerializedNode,
  SerializedEdge,
  GraphBatchPayload,
  BatchResult,
  BulkProgressEvent,
} from './db-worker-protocol';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressCallback {
  (progress: { phase: string; current: number; total: number; message?: string }): void;
}

interface PendingOperation {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  onProgress?: ProgressCallback;
}

export interface DbWorkerClientOptions {
  /** Max time to wait for worker to become ready (ms). Default: 10000 */
  startTimeoutMs?: number;
  /** Max time to wait for an individual operation (ms). Default: 600000 (10 min) */
  operationTimeoutMs?: number;
  /** Whether to auto-restart the worker on crash. Default: true */
  autoRestart?: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let operationCounter = 0;

export class DbWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingOperation>();
  private ready = false;
  private stopping = false;
  private readonly dbPath: string;
  private readonly options: Required<DbWorkerClientOptions>;

  constructor(dbPath: string, options: DbWorkerClientOptions = {}) {
    this.dbPath = dbPath;
    this.options = {
      startTimeoutMs: options.startTimeoutMs ?? 10_000,
      operationTimeoutMs: options.operationTimeoutMs ?? 600_000,
      autoRestart: options.autoRestart ?? true,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.worker) {
      return; // Already running
    }

    const workerPath = await this.resolveWorkerPath();
    const initData: DbWorkerInit = { dbPath: this.dbPath };

    // tsx/ts-node: if the worker script is .ts, we need to use execArgv
    // to register the TypeScript loader in the worker thread.
    const isTsSource = workerPath.endsWith('.ts');
    const execArgv = isTsSource ? ['--require', 'tsx/cjs'] : [];

    this.worker = new Worker(workerPath, {
      workerData: initData,
      execArgv,
    });

    this.worker.on('message', (msg: DbWorkerMessage | { type: 'ready' }) => {
      this.handleMessage(msg);
    });

    this.worker.on('error', (err: Error) => {
      console.error('[DbWorkerClient] Worker error:', err.message);
      this.handleWorkerCrash(err);
    });

    this.worker.on('exit', (code: number) => {
      if (code !== 0 && !this.stopping) {
        console.error(`[DbWorkerClient] Worker exited with code ${code}`);
        this.handleWorkerCrash(new Error(`Worker exited with code ${code}`));
      }
      this.worker = null;
      this.ready = false;
    });

    // Wait for the 'ready' message
    await this.waitForReady();
    console.log('[DbWorkerClient] Worker ready');
  }

  async stop(): Promise<void> {
    this.stopping = true;

    if (this.worker) {
      // Reject all pending operations
      for (const [id, op] of this.pending) {
        op.reject(new Error('DbWorkerClient is shutting down'));
        this.pending.delete(id);
      }

      await this.worker.terminate();
      this.worker = null;
    }

    this.ready = false;
    this.stopping = false;
  }

  isReady(): boolean {
    return this.ready && this.worker !== null;
  }

  // -------------------------------------------------------------------------
  // Public operations
  // -------------------------------------------------------------------------

  async flushImportBatch(
    nodes: SerializedNode[],
    edges: SerializedEdge[]
  ): Promise<FlushImportBatchResult> {
    return this.execute<FlushImportBatchResult>({
      type: 'flushImportBatch',
      id: this.nextId(),
      payload: { nodes, edges },
    });
  }

  async bulkInsertGraphBatch(
    batch: GraphBatchPayload,
    onProgress?: (progress: BulkProgressEvent) => void
  ): Promise<BatchResult> {
    return this.execute<BatchResult>(
      {
        type: 'bulkInsertGraphBatch',
        id: this.nextId(),
        payload: batch,
      },
      onProgress as any
    );
  }

  async computeAuthority(
    accountId: string,
    onProgress?: ProgressCallback
  ): Promise<ComputeAuthorityResult> {
    return this.execute<ComputeAuthorityResult>(
      {
        type: 'computeAuthority',
        id: this.nextId(),
        payload: { accountId },
      },
      onProgress
    );
  }

  async deleteSubgraph(
    accountId: string,
    scope: 'keimenon' | 'all-clients',
    isAdmin: boolean,
    onProgress?: ProgressCallback
  ): Promise<DeleteSubgraphResult> {
    return this.execute<DeleteSubgraphResult>(
      {
        type: 'deleteSubgraph',
        id: this.nextId(),
        payload: { accountId, scope, isAdmin },
      },
      onProgress
    );
  }

  async rebuildInvertedIndex(
    accountId: string,
    onProgress?: ProgressCallback
  ): Promise<RebuildInvertedIndexResult> {
    return this.execute<RebuildInvertedIndexResult>(
      {
        type: 'rebuildInvertedIndex',
        id: this.nextId(),
        payload: { accountId },
      },
      onProgress
    );
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return this.execute<HealthCheckResult>({
      type: 'healthCheck',
      id: this.nextId(),
      payload: {},
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private nextId(): string {
    return `op_${++operationCounter}_${Date.now()}`;
  }

  private execute<T>(op: DbWorkerOperation, onProgress?: ProgressCallback): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.worker || !this.ready) {
        reject(new Error('DbWorkerClient is not ready. Call start() first.'));
        return;
      }

      const timeoutHandle = setTimeout(() => {
        this.pending.delete(op.id);
        reject(
          new Error(
            `DbWorkerClient operation ${op.type} timed out after ${this.options.operationTimeoutMs}ms`
          )
        );
      }, this.options.operationTimeoutMs);

      this.pending.set(op.id, {
        resolve: (data: T) => {
          clearTimeout(timeoutHandle);
          resolve(data);
        },
        reject: (err: Error) => {
          clearTimeout(timeoutHandle);
          reject(err);
        },
        onProgress,
      });

      this.worker.postMessage(op);
    });
  }

  private handleMessage(msg: DbWorkerMessage | { type: 'ready' }): void {
    if (msg.type === 'ready') {
      this.ready = true;
      return;
    }

    const pending = this.pending.get(msg.id);
    if (!pending) {
      console.warn(`[DbWorkerClient] Received message for unknown operation: ${msg.id}`);
      return;
    }

    switch (msg.type) {
      case 'result':
        this.pending.delete(msg.id);
        pending.resolve(msg.data);
        break;
      case 'error':
        this.pending.delete(msg.id);
        pending.reject(new Error(msg.error));
        break;
      case 'progress':
      case 'bulk_progress':
        if (pending.onProgress) {
          pending.onProgress((msg as any).progress);
        }
        break;
    }
  }

  private handleWorkerCrash(err: Error): void {
    // Reject all pending operations
    for (const [id, op] of this.pending) {
      op.reject(new Error(`Worker crashed: ${err.message}`));
      this.pending.delete(id);
    }

    this.ready = false;

    if (this.options.autoRestart && !this.stopping) {
      console.log('[DbWorkerClient] Auto-restarting worker...');
      void this.start().catch((restartErr) => {
        console.error('[DbWorkerClient] Failed to restart worker:', restartErr.message);
      });
    }
  }

  private waitForReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.ready) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(
          new Error(
            `DbWorkerClient: worker did not become ready within ${this.options.startTimeoutMs}ms`
          )
        );
      }, this.options.startTimeoutMs);

      const checkReady = () => {
        if (this.ready) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });
  }

  private async resolveWorkerPath(): Promise<string> {
    // Follow the same pattern as ImportWorker.resolveImportWorkerPath()
    const candidates: string[] = [];

    if (__filename.endsWith('.ts')) {
      // tsx/dev runtime: prefer source
      candidates.push(path.join(__dirname, 'db-worker.ts'));
      candidates.push(path.join(__dirname, 'db-worker.js'));
      candidates.push(path.join(process.cwd(), 'apps', 'api', 'dist', 'workers', 'db-worker.js'));
    } else {
      // Compiled JS runtime
      candidates.push(path.join(__dirname, 'db-worker.js'));
      candidates.push(path.join(__dirname, 'db-worker.ts'));
    }

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    throw new Error(`[DbWorkerClient] Worker script not found. Searched: ${candidates.join(', ')}`);
  }
}
