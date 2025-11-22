/**
 * Database Write Queue
 *
 * Non-blocking write queue for SQLite operations.
 * Batches writes to prevent event loop blocking and improve performance.
 *
 * Architecture:
 * - Collects nodes/edges in memory queues
 * - Flushes every 100ms OR when batch size reaches threshold
 * - Uses SQLiteClient's batched createNodes()/createEdges() methods
 * - Emits SSE events for real-time UI updates
 *
 * Performance Impact:
 * - Event loop never blocked > 100ms (enables real-time SSE)
 * - 10-50x faster than individual writes
 * - Supports concurrent operations (future AI agents)
 *
 * Related: Product Directive - "Desktop-class app with live canvas updates"
 */

import { DatabaseClient } from '@canvas-memory/db';
import { AnyNode, AnyEdge } from '@canvas-memory/types';
import { SSEBroadcaster } from '../modules/jobs/infrastructure/SSEBroadcaster';
import { WriteQueueErrorHandler } from './WriteQueueErrorHandler';

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
}

/**
 * Non-blocking write queue for database operations
 */
export class DatabaseWriteQueue {
  private nodeQueue: AnyNode[] = [];
  private edgeQueue: AnyEdge[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private errorHandler: WriteQueueErrorHandler;
  private stats: WriteQueueStats = {
    nodesQueued: 0,
    edgesQueued: 0,
    nodesFlushed: 0,
    edgesFlushed: 0,
    flushCount: 0,
    lastFlushTime: null,
  };

  // Configuration
  private readonly FLUSH_INTERVAL_MS = 100; // Flush every 100ms (allows 10 SSE updates/sec)
  private readonly BATCH_SIZE_THRESHOLD = 50; // Flush early if batch exceeds this size

  constructor(
    private db: DatabaseClient,
    private broadcaster?: SSEBroadcaster
  ) {
    // Enable direct writes for the write queue (authorized write path)
    if ('enableDirectWrites' in this.db) {
      (this.db as any).enableDirectWrites();
    }

    // Initialize error handler with circuit breaker and retry logic
    this.errorHandler = new WriteQueueErrorHandler(this.db, {
      maxConsecutiveFailures: 3,
      maxRetries: 2,
      retryDelayMs: 1000,
      useExponentialBackoff: true,
      enableCircuitBreaker: true,
      deadLetterQueueSize: 1000,
    });
  }

  /**
   * Start the write queue (begins automatic flushing)
   */
  start(): void {
    if (this.flushInterval) {
      console.warn('⚠️ DatabaseWriteQueue already started');
      return;
    }

    console.log('🚀 Starting DatabaseWriteQueue...');
    console.log(`   Flush interval: ${this.FLUSH_INTERVAL_MS}ms`);
    console.log(`   Batch threshold: ${this.BATCH_SIZE_THRESHOLD} items`);

    // ✅ Clear stale dead letter queue items from previous session
    const clearedCount = this.errorHandler.clearDeadLetterQueue();
    if (clearedCount > 0) {
      console.log(`🧹 Cleared ${clearedCount} stale items from dead letter queue`);
    }

    // Start periodic flushing
    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => {
        console.error('❌ Write queue flush error:', error);
      });
    }, this.FLUSH_INTERVAL_MS);

    console.log('✅ DatabaseWriteQueue started');
  }

  /**
   * Stop the write queue and flush remaining items
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping DatabaseWriteQueue...');
    this.isShuttingDown = true;

    // Stop periodic flushing
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush any remaining items
    await this.flush();

    console.log('✅ DatabaseWriteQueue stopped');
    console.log(`   Total nodes flushed: ${this.stats.nodesFlushed}`);
    console.log(`   Total edges flushed: ${this.stats.edgesFlushed}`);
    console.log(`   Total flushes: ${this.stats.flushCount}`);
  }

  /**
   * Enqueue a node for writing (non-blocking)
   */
  enqueueNode(node: AnyNode): void {
    if (this.isShuttingDown) {
      throw new Error('Cannot enqueue nodes - write queue is shutting down');
    }

    this.nodeQueue.push(node);
    this.stats.nodesQueued++;

    // Flush early if batch is large
    if (this.nodeQueue.length >= this.BATCH_SIZE_THRESHOLD) {
      setImmediate(() => {
        this.flush().catch((error) => {
          console.error('❌ Write queue early flush error:', error);
        });
      });
    }
  }

  /**
   * Enqueue an edge for writing (non-blocking)
   */
  enqueueEdge(edge: AnyEdge): void {
    if (this.isShuttingDown) {
      throw new Error('Cannot enqueue edges - write queue is shutting down');
    }

    this.edgeQueue.push(edge);
    this.stats.edgesQueued++;

    // Flush early if batch is large
    if (this.edgeQueue.length >= this.BATCH_SIZE_THRESHOLD) {
      setImmediate(() => {
        this.flush().catch((error) => {
          console.error('❌ Write queue early flush error:', error);
        });
      });
    }
  }

  /**
   * Enqueue multiple nodes (bulk operation)
   */
  enqueueNodes(nodes: AnyNode[]): void {
    for (const node of nodes) {
      this.enqueueNode(node);
    }
  }

  /**
   * Enqueue multiple edges (bulk operation)
   */
  enqueueEdges(edges: AnyEdge[]): void {
    for (const edge of edges) {
      this.enqueueEdge(edge);
    }
  }

  /**
   * Flush queued writes to database (batched)
   */
  private async flush(): Promise<void> {
    // Nothing to flush
    if (this.nodeQueue.length === 0 && this.edgeQueue.length === 0) {
      return;
    }

    const startTime = Date.now();

    // Extract queued items (empties queues)
    const nodes = this.nodeQueue.splice(0);
    const edges = this.edgeQueue.splice(0);

    try {
      // Aggregate updates per account (for SSE broadcasting)
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
        const preview: NodePreview = {
          id: node.id,
          kind: node.kind,
          label: deriveNodeLabel(node),
        };
        bucket.recentNodes.unshift(preview);
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

      // Batched database writes with error handling (circuit breaker + retry + partial success)
      const successCount = await this.errorHandler.handleFlush(nodes, edges);

      // Update stats from error handler metrics
      const errorMetrics = this.errorHandler.getMetrics();
      this.stats.nodesFlushed = errorMetrics.successfulWrites;
      this.stats.edgesFlushed = errorMetrics.successfulWrites;
      this.stats.flushCount++;
      this.stats.lastFlushTime = Date.now();

      const flushDuration = Date.now() - startTime;

      console.log(
        `💾 Flushed ${successCount}/${nodes.length + edges.length} items in ${flushDuration}ms`
      );

      // Log circuit breaker status if opened
      if (this.errorHandler.isCircuitOpen()) {
        console.warn('⚠️ Circuit breaker is open - write operations paused');
      }

      // Log dead letter queue if items failed
      const deadLetterQueue = this.errorHandler.getDeadLetterQueue();
      if (deadLetterQueue.length > 0) {
        console.warn(
          `⚠️ ${deadLetterQueue.length} items in dead letter queue (failed after retries)`
        );
      }

      // Emit SSE event for real-time UI updates (per account)
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
      console.error('❌ Failed to flush write queue:', error);

      // Error handler has already tried retries and partial success
      // Check if circuit breaker opened
      if (this.errorHandler.isCircuitOpen()) {
        console.error('🚫 Circuit breaker opened - stopping write operations');
        console.error('   Will auto-reset in 30 seconds');
        console.error(`   Items queued when circuit opened: ${nodes.length + edges.length}`);
      } else {
        console.error(`   Items failed after retries: ${nodes.length + edges.length}`);
      }

      // Don't re-throw - error handler has done its best
      // Circuit breaker will prevent further attempts if needed
      // Dead letter queue contains failed items for investigation
    }
  }

  /**
   * Force immediate flush (useful for job pause/completion)
   */
  async forceFlush(): Promise<void> {
    console.log('⚡ Forcing write queue flush...');
    await this.flush();
  }

  /**
   * Get queue statistics
   */
  getStats(): WriteQueueStats {
    return {
      ...this.stats,
      nodesQueued: this.nodeQueue.length,
      edgesQueued: this.edgeQueue.length,
    };
  }

  /**
   * Get current queue sizes
   */
  getQueueSizes(): { nodes: number; edges: number } {
    return {
      nodes: this.nodeQueue.length,
      edges: this.edgeQueue.length,
    };
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitOpen(): boolean {
    return this.errorHandler.isCircuitOpen();
  }

  /**
   * Manually close circuit breaker (for recovery)
   */
  closeCircuitBreaker(): void {
    this.errorHandler.closeCircuit();
  }

  /**
   * Get error handler metrics
   */
  getErrorMetrics() {
    return this.errorHandler.getMetrics();
  }

  /**
   * Get dead letter queue (failed items)
   */
  getDeadLetterQueue() {
    return this.errorHandler.getDeadLetterQueue();
  }

  /**
   * Clear dead letter queue (returns count of items cleared)
   */
  clearDeadLetterQueue(): number {
    return this.errorHandler.clearDeadLetterQueue();
  }

  /**
   * Manually reset the circuit breaker
   * Use this when you've fixed the root cause and want to resume operations
   */
  resetCircuitBreaker(): void {
    console.log('🔄 Manually resetting circuit breaker...');
    this.errorHandler.closeCircuit();
    console.log('✅ Circuit breaker reset successfully');
  }
}
