/**
 * Database Write Queue
 *
 * Non-blocking write queue for SQLite operations.
 * Batches writes to prevent event-loop blocking and improve performance.
 */

import { DatabaseClient } from '@keimenon/db';
import { AnyNode, AnyEdge } from '@keimenon/types';
import { SSEBroadcaster } from '../modules/jobs/infrastructure/SSEBroadcaster';
import { WriteQueueErrorHandler } from './WriteQueueErrorHandler';
import type { SqlVariableSplitDiagnostics } from './WriteQueueErrorHandler';

interface NodePreview {
  id: string;
  kind: string;
  label?: string;
}

function deriveNodeLabel(node: any): string | undefined {
  const candidates: Array<string | undefined> = [
    typeof node.title === 'string' ? node.title : undefined,
    typeof node.name === 'string' ? node.name : undefined,
    typeof node.claim_text === 'string' ? node.claim_text : undefined,
    typeof node.metadata?.label === 'string' ? node.metadata.label : undefined,
    typeof node.metadata?.title === 'string' ? node.metadata.title : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

export interface WriteQueueStats {
  nodesQueued: number;
  edgesQueued: number;
  nodesFlushed: number;
  edgesFlushed: number;
  flushCount: number;
  lastFlushTime: number | null;
  flushInFlight: number;
  flushRequestedWhileBusy: number;
  serializedFlushLoops: number;
  fkConstraintFailures: number;
  deferredForeignKeyEdges: number;
  fkRequeueEscalations: number;
  sqlVariableSplitRetries: number;
  lastSqlVariableSplit?: SqlVariableSplitDiagnostics;
}

type FlushTrigger = 'interval' | 'threshold' | 'force' | 'stop';

export class DatabaseWriteQueue {
  private nodeQueue: AnyNode[] = [];
  private edgeQueue: AnyEdge[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private errorHandler: WriteQueueErrorHandler;
  private flushRequested = false;
  private flushLoopPromise: Promise<void> | null = null;
  private flushInProgress = false;

  private stats: WriteQueueStats = {
    nodesQueued: 0,
    edgesQueued: 0,
    nodesFlushed: 0,
    edgesFlushed: 0,
    flushCount: 0,
    lastFlushTime: null,
    flushInFlight: 0,
    flushRequestedWhileBusy: 0,
    serializedFlushLoops: 0,
    fkConstraintFailures: 0,
    deferredForeignKeyEdges: 0,
    fkRequeueEscalations: 0,
    sqlVariableSplitRetries: 0,
    lastSqlVariableSplit: undefined,
  };

  private readonly FLUSH_INTERVAL_MS = 100;
  private readonly BATCH_SIZE_THRESHOLD = 50;
  private readonly MAX_NODES_PER_FLUSH = 400;
  private readonly MAX_EDGES_PER_FLUSH = 600;
  private readonly MAX_EDGE_FK_REQUEUE_ATTEMPTS = 4;
  private edgeForeignKeyRequeueAttempts: Map<string, number> = new Map();

  constructor(
    private db: DatabaseClient,
    private broadcaster?: SSEBroadcaster
  ) {
    if ('enableDirectWrites' in this.db) {
      (this.db as any).enableDirectWrites();
    }

    this.errorHandler = new WriteQueueErrorHandler(this.db, {
      maxConsecutiveFailures: 3,
      maxRetries: 2,
      retryDelayMs: 1000,
      useExponentialBackoff: true,
      enableCircuitBreaker: true,
      deadLetterQueueSize: 1000,
    });
  }

  start(): void {
    if (this.flushInterval) {
      console.warn('[DatabaseWriteQueue] start() ignored; queue already started');
      return;
    }

    const clearedCount = this.errorHandler.clearDeadLetterQueue();
    if (clearedCount > 0) {
      console.log(`[DatabaseWriteQueue] cleared ${clearedCount} stale dead-letter item(s)`);
    }

    this.flushInterval = setInterval(() => {
      void this.scheduleFlush('interval').catch((error) => {
        console.error('[DatabaseWriteQueue] interval flush scheduling error:', error);
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.scheduleFlush('stop');
  }

  enqueueNode(node: AnyNode): void {
    if (this.isShuttingDown) {
      throw new Error('Cannot enqueue nodes: write queue is shutting down');
    }

    this.nodeQueue.push(node);
    this.stats.nodesQueued++;

    if (this.nodeQueue.length >= this.BATCH_SIZE_THRESHOLD) {
      setImmediate(() => {
        void this.scheduleFlush('threshold').catch((error) => {
          console.error('[DatabaseWriteQueue] threshold flush scheduling error:', error);
        });
      });
    }
  }

  enqueueEdge(edge: AnyEdge): void {
    if (this.isShuttingDown) {
      throw new Error('Cannot enqueue edges: write queue is shutting down');
    }

    this.edgeQueue.push(edge);
    this.stats.edgesQueued++;

    if (this.edgeQueue.length >= this.BATCH_SIZE_THRESHOLD) {
      setImmediate(() => {
        void this.scheduleFlush('threshold').catch((error) => {
          console.error('[DatabaseWriteQueue] threshold flush scheduling error:', error);
        });
      });
    }
  }

  enqueueNodes(nodes: AnyNode[]): void {
    for (const node of nodes) {
      this.enqueueNode(node);
    }
  }

  enqueueEdges(edges: AnyEdge[]): void {
    for (const edge of edges) {
      this.enqueueEdge(edge);
    }
  }

  async forceFlush(): Promise<void> {
    await this.scheduleFlush('force');
  }

  // Compatibility entrypoint used by legacy tests and debug helpers.
  async flush(): Promise<void> {
    await this.scheduleFlush('force');
  }

  getStats(): WriteQueueStats {
    return {
      ...this.stats,
      nodesQueued: this.nodeQueue.length,
      edgesQueued: this.edgeQueue.length,
      flushInFlight: this.flushInProgress ? 1 : 0,
    };
  }

  getQueueSizes(): { nodes: number; edges: number } {
    return {
      nodes: this.nodeQueue.length,
      edges: this.edgeQueue.length,
    };
  }

  isCircuitOpen(): boolean {
    return this.errorHandler.isCircuitOpen();
  }

  closeCircuitBreaker(): void {
    this.errorHandler.closeCircuit();
  }

  getErrorMetrics() {
    return this.errorHandler.getMetrics();
  }

  getDeadLetterQueue() {
    return this.errorHandler.getDeadLetterQueue();
  }

  clearDeadLetterQueue(): number {
    return this.errorHandler.clearDeadLetterQueue();
  }

  resetCircuitBreaker(): void {
    this.errorHandler.closeCircuit();
  }

  private scheduleFlush(trigger: FlushTrigger): Promise<void> {
    this.flushRequested = true;

    if (this.flushLoopPromise) {
      this.stats.flushRequestedWhileBusy++;
      return this.flushLoopPromise;
    }

    this.flushLoopPromise = this.drainFlushLoop(trigger).finally(() => {
      this.flushLoopPromise = null;
    });

    return this.flushLoopPromise;
  }

  private async drainFlushLoop(_trigger: FlushTrigger): Promise<void> {
    this.stats.serializedFlushLoops++;

    while (this.flushRequested || this.nodeQueue.length > 0 || this.edgeQueue.length > 0) {
      this.flushRequested = false;
      await this.flushOnce();
    }
  }

  private async flushOnce(): Promise<void> {
    if (this.nodeQueue.length === 0 && this.edgeQueue.length === 0) {
      return;
    }

    const nodes = this.nodeQueue.splice(0, this.MAX_NODES_PER_FLUSH);
    const edges = this.edgeQueue.splice(0, this.MAX_EDGES_PER_FLUSH);
    const startTime = Date.now();

    this.flushInProgress = true;
    this.stats.flushInFlight = 1;

    try {
      const perAccount = new Map<
        string,
        { nodesAdded: number; edgesAdded: number; recentNodes: NodePreview[] }
      >();
      const ensureAccountBucket = (accountId: string) => {
        if (!perAccount.has(accountId)) {
          perAccount.set(accountId, { nodesAdded: 0, edgesAdded: 0, recentNodes: [] });
        }
        return perAccount.get(accountId)!;
      };

      for (const node of nodes as Array<any>) {
        const accountId = node.account_id;
        if (!accountId) {
          continue;
        }
        const bucket = ensureAccountBucket(accountId);
        bucket.nodesAdded += 1;
        bucket.recentNodes.unshift({
          id: node.id,
          kind: node.kind,
          label: deriveNodeLabel(node),
        });
        if (bucket.recentNodes.length > 20) {
          bucket.recentNodes = bucket.recentNodes.slice(0, 20);
        }
      }

      for (const edge of edges as Array<any>) {
        const accountId = edge.account_id;
        if (!accountId) {
          continue;
        }
        const bucket = ensureAccountBucket(accountId);
        bucket.edgesAdded += 1;
      }

      const flushResult = {
        totalWritten: 0,
        nodesWritten: 0,
        edgesWritten: 0,
      };
      let deferredForeignKeyCount = 0;
      const sqlVariableSplits: SqlVariableSplitDiagnostics[] = [];

      if (nodes.length > 0) {
        const nodeFlush = await this.errorHandler.handleFlush(nodes, [], {
          allowForeignKeyRequeue: false,
        });
        flushResult.totalWritten += nodeFlush.totalWritten;
        flushResult.nodesWritten += nodeFlush.nodesWritten;
        if (nodeFlush.diagnostics?.sqlVariableSplit) {
          sqlVariableSplits.push(nodeFlush.diagnostics.sqlVariableSplit);
        }
      }

      if (edges.length > 0) {
        if (this.nodeQueue.length > 0) {
          this.requeueEdgesToFront(edges);
          deferredForeignKeyCount += edges.length;
          console.warn(
            `[DatabaseWriteQueue] deferred ${edges.length} edge(s) until pending node queue drains (remainingNodes=${this.nodeQueue.length})`
          );
        } else {
          const edgeFlush = await this.errorHandler.handleFlush([], edges, {
            allowForeignKeyRequeue: true,
          });
          flushResult.totalWritten += edgeFlush.totalWritten;
          flushResult.edgesWritten += edgeFlush.edgesWritten;
          deferredForeignKeyCount += edgeFlush.deferredForeignKeyCount || 0;
          if (edgeFlush.diagnostics?.sqlVariableSplit) {
            sqlVariableSplits.push(edgeFlush.diagnostics.sqlVariableSplit);
          }
          this.clearResolvedDeferredEdgeAttempts(edges, edgeFlush.deferredEdges || []);
          if (edgeFlush.deferredEdges && edgeFlush.deferredEdges.length > 0) {
            this.requeueDeferredForeignKeyEdges(edgeFlush.deferredEdges);
          }
        }
      }

      const errorMetrics = this.errorHandler.getMetrics();

      this.stats.nodesFlushed = errorMetrics.successfulNodeWrites;
      this.stats.edgesFlushed = errorMetrics.successfulEdgeWrites;
      this.stats.fkConstraintFailures = errorMetrics.fkConstraintFailures;
      this.stats.sqlVariableSplitRetries = errorMetrics.sqlVariableSplitRetries;
      this.stats.deferredForeignKeyEdges += deferredForeignKeyCount;
      if (sqlVariableSplits.length > 0) {
        this.stats.lastSqlVariableSplit = sqlVariableSplits[sqlVariableSplits.length - 1];
      }
      this.stats.flushCount++;
      this.stats.lastFlushTime = Date.now();

      if (this.errorHandler.isCircuitOpen()) {
        console.warn('[DatabaseWriteQueue] circuit breaker is open');
      }

      const deadLetterQueue = this.errorHandler.getDeadLetterQueue();
      if (deadLetterQueue.length > 0) {
        console.warn(
          `[DatabaseWriteQueue] dead-letter queue contains ${deadLetterQueue.length} item(s)`
        );
      }

      const durationMs = Date.now() - startTime;
      console.log(
        `[DatabaseWriteQueue] flushed ${flushResult.totalWritten}/${nodes.length + edges.length} items in ${durationMs}ms`
      );
      for (const split of sqlVariableSplits) {
        console.warn(
          `[DatabaseWriteQueue] SQL variable split retry applied ` +
            `(nodes=${split.nodesAttempted}, edges=${split.edgesAttempted}, ` +
            `nodeChunks=${split.nodeChunksProcessed}, edgeChunks=${split.edgeChunksProcessed}, ` +
            `splitRetries=${split.splitRetries}, nodeFallback=${split.nodeFallbackWrites}, ` +
            `edgeFallback=${split.edgeFallbackWrites})`
        );
      }

      if (this.broadcaster && perAccount.size > 0) {
        const queueStats = {
          nodesQueued: this.nodeQueue.length,
          edgesQueued: this.edgeQueue.length,
          nodesFlushed: this.stats.nodesFlushed,
          edgesFlushed: this.stats.edgesFlushed,
        };
        const timestamp = Date.now();
        for (const [accountId, data] of perAccount.entries()) {
          this.broadcaster.broadcastGraphUpdate(accountId, {
            nodesAdded: data.nodesAdded,
            edgesAdded: data.edgesAdded,
            queueStats,
            timestamp,
            recentNodes: data.recentNodes,
          });
        }
      }
    } catch (error) {
      console.error('[DatabaseWriteQueue] flush failed:', error);
      if (this.errorHandler.isCircuitOpen()) {
        console.error(
          `[DatabaseWriteQueue] circuit breaker opened with ${nodes.length + edges.length} buffered item(s)`
        );
      }
    } finally {
      this.flushInProgress = false;
      this.stats.flushInFlight = 0;
    }
  }

  private requeueEdgesToFront(edges: AnyEdge[]): void {
    for (let index = edges.length - 1; index >= 0; index -= 1) {
      this.edgeQueue.unshift(edges[index]);
    }
  }

  private getEdgeIdentifier(edge: AnyEdge): string {
    const edgeData = edge as any;
    return typeof edgeData.id === 'string' && edgeData.id.length > 0
      ? edgeData.id
      : `edge_${Math.random().toString(36).slice(2, 10)}`;
  }

  private clearResolvedDeferredEdgeAttempts(
    attemptedEdges: AnyEdge[],
    deferredEdges: AnyEdge[]
  ): void {
    if (attemptedEdges.length === 0) {
      return;
    }

    const deferredIds = new Set(deferredEdges.map((edge) => this.getEdgeIdentifier(edge)));
    for (const edge of attemptedEdges) {
      const edgeId = this.getEdgeIdentifier(edge);
      if (!deferredIds.has(edgeId)) {
        this.edgeForeignKeyRequeueAttempts.delete(edgeId);
      }
    }
  }

  private requeueDeferredForeignKeyEdges(deferredEdges: AnyEdge[]): void {
    const edgesToRetry: AnyEdge[] = [];

    for (const edge of deferredEdges) {
      const edgeId = this.getEdgeIdentifier(edge);
      const attemptCount = (this.edgeForeignKeyRequeueAttempts.get(edgeId) || 0) + 1;
      this.edgeForeignKeyRequeueAttempts.set(edgeId, attemptCount);

      if (attemptCount > this.MAX_EDGE_FK_REQUEUE_ATTEMPTS) {
        this.errorHandler.forceDeadLetterEdge(
          edge,
          'FK_MISSING_ENDPOINT',
          `Edge endpoint unresolved after ${attemptCount} deferred flush attempts`
        );
        this.edgeForeignKeyRequeueAttempts.delete(edgeId);
        this.stats.fkRequeueEscalations += 1;
        continue;
      }

      edgesToRetry.push(edge);
    }

    if (edgesToRetry.length > 0) {
      this.requeueEdgesToFront(edgesToRetry);
      console.warn(
        `[DatabaseWriteQueue] re-queued ${edgesToRetry.length} deferred FK edge(s) for dependency resolution`
      );
    }
  }
}
