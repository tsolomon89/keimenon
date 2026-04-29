/**
 * Write Queue Error Handler
 *
 * Provides robust error handling for database write operations with:
 * - Exponential backoff retry logic
 * - Circuit breaker pattern (stop after N consecutive failures)
 * - Partial success handling (save what works, quarantine what fails)
 * - Dead letter queue for failed items
 * - Metrics and logging
 */

import { DatabaseClient } from '@keimenon/db';
import { AnyNode, AnyEdge } from '@keimenon/types';

export interface WriteQueueMetrics {
  totalAttempts: number;
  successfulWrites: number;
  successfulNodeWrites: number;
  successfulEdgeWrites: number;
  failedWrites: number;
  failedNodeWrites: number;
  failedEdgeWrites: number;
  fkConstraintFailures: number;
  retriedWrites: number;
  circuitBreakerOpens: number;
  partialSuccesses: number;
  deadLetterItems: number;
  deadLetterEnqueues: number;
  sqlVariableSplitRetries: number;
  foreignKeyDeferredRetries: number;
}

export interface SqlVariableSplitDiagnostics {
  stage: 'write_queue_flush';
  nodesAttempted: number;
  edgesAttempted: number;
  nodeChunksProcessed: number;
  edgeChunksProcessed: number;
  splitRetries: number;
  nodeFallbackWrites: number;
  edgeFallbackWrites: number;
}

export interface FlushResult {
  totalWritten: number;
  nodesWritten: number;
  edgesWritten: number;
  circuitOpen: boolean;
  deadLetterCount: number;
  deferredForeignKeyCount?: number;
  deferredEdges?: AnyEdge[];
  diagnostics?: {
    sqlVariableSplit?: SqlVariableSplitDiagnostics;
  };
}

export interface HandleFlushOptions {
  allowForeignKeyRequeue?: boolean;
}

export interface DeadLetterItem {
  type: 'node' | 'edge';
  data: AnyNode | AnyEdge;
  error: Error;
  normalizedReason?: string;
  timestamp: number;
  attemptCount: number;
}

export interface WriteQueueErrorHandlerOptions {
  maxConsecutiveFailures?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  useExponentialBackoff?: boolean;
  enableCircuitBreaker?: boolean;
  deadLetterQueueSize?: number;
  circuitBreakerResetMs?: number;
}

interface EdgeWriteResult {
  success: boolean;
  deferredForeignKey?: boolean;
  deferredEdge?: AnyEdge;
}

export class WriteQueueErrorHandler {
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt: number | null = null;
  private deadLetterQueue: DeadLetterItem[] = [];
  private metrics: WriteQueueMetrics = {
    totalAttempts: 0,
    successfulWrites: 0,
    successfulNodeWrites: 0,
    successfulEdgeWrites: 0,
    failedWrites: 0,
    failedNodeWrites: 0,
    failedEdgeWrites: 0,
    fkConstraintFailures: 0,
    retriedWrites: 0,
    circuitBreakerOpens: 0,
    partialSuccesses: 0,
    deadLetterItems: 0,
    deadLetterEnqueues: 0,
    sqlVariableSplitRetries: 0,
    foreignKeyDeferredRetries: 0,
  };

  private options: Required<WriteQueueErrorHandlerOptions>;
  private readonly SQL_VARIABLE_SAFE_CHUNK_SIZE = 400;

  constructor(
    private db: DatabaseClient,
    options: WriteQueueErrorHandlerOptions = {}
  ) {
    this.options = {
      maxConsecutiveFailures: options.maxConsecutiveFailures ?? 3,
      maxRetries: options.maxRetries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 1000,
      useExponentialBackoff: options.useExponentialBackoff ?? true,
      enableCircuitBreaker: options.enableCircuitBreaker ?? true,
      deadLetterQueueSize: options.deadLetterQueueSize ?? 1000,
      circuitBreakerResetMs:
        options.circuitBreakerResetMs ?? parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '30000'),
    };
  }

  /**
   * Handle flush operation with error recovery.
   */
  async handleFlush(
    nodes: AnyNode[],
    edges: AnyEdge[],
    options: HandleFlushOptions = {}
  ): Promise<FlushResult> {
    this.metrics.totalAttempts++;
    const allowForeignKeyRequeue = options.allowForeignKeyRequeue !== false;

    if (this.circuitOpen && this.options.enableCircuitBreaker) {
      const resetTimeout = this.options.circuitBreakerResetMs;
      if (this.circuitOpenedAt && Date.now() - this.circuitOpenedAt > resetTimeout) {
        console.log(
          `[WriteQueueErrorHandler] Circuit breaker auto-closing after ${resetTimeout}ms`
        );
        this.closeCircuit();
      } else {
        const remainingSeconds = Math.ceil(
          (resetTimeout - (Date.now() - (this.circuitOpenedAt || 0))) / 1000
        );
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open after ${this.consecutiveFailures} consecutive failures. ` +
            `Will auto-reset in ${remainingSeconds}s. ` +
            `Manual reset: POST /api/v1/debug/queue/reset-circuit`
        );
      }
    }

    try {
      if (nodes.length > 0 && this.db.createNodes) {
        await this.db.createNodes(nodes);
      }
      if (edges.length > 0 && this.db.createEdges) {
        await this.db.createEdges(edges);
      }

      this.consecutiveFailures = 0;
      this.metrics.successfulWrites += nodes.length + edges.length;
      this.metrics.successfulNodeWrites += nodes.length;
      this.metrics.successfulEdgeWrites += edges.length;

      return {
        totalWritten: nodes.length + edges.length,
        nodesWritten: nodes.length,
        edgesWritten: edges.length,
        circuitOpen: this.circuitOpen,
        deadLetterCount: this.deadLetterQueue.length,
      };
    } catch (error: any) {
      const normalizedError = this.ensureError(error);
      if (this.isSqlVariableLimitError(normalizedError)) {
        const splitResult = await this.tryChunkedWritesForSqlVariableLimit(
          nodes,
          edges,
          normalizedError,
          allowForeignKeyRequeue
        );
        if (
          splitResult.totalWritten + (splitResult.deferredForeignKeyCount || 0) ===
          nodes.length + edges.length
        ) {
          this.consecutiveFailures = 0;
          return splitResult;
        }
      }

      this.consecutiveFailures++;
      console.error(
        `[WriteQueueErrorHandler] Batch write failed (${this.consecutiveFailures}/${this.options.maxConsecutiveFailures}):`,
        normalizedError?.message || normalizedError
      );

      if (
        this.options.enableCircuitBreaker &&
        this.consecutiveFailures >= this.options.maxConsecutiveFailures
      ) {
        this.openCircuit();
      }

      return this.tryIndividualWrites(nodes, edges, allowForeignKeyRequeue);
    }
  }

  private async tryChunkedWritesForSqlVariableLimit(
    nodes: AnyNode[],
    edges: AnyEdge[],
    originalError: Error,
    allowForeignKeyRequeue: boolean
  ): Promise<FlushResult> {
    const diagnostics: SqlVariableSplitDiagnostics = {
      stage: 'write_queue_flush',
      nodesAttempted: nodes.length,
      edgesAttempted: edges.length,
      nodeChunksProcessed: 0,
      edgeChunksProcessed: 0,
      splitRetries: 0,
      nodeFallbackWrites: 0,
      edgeFallbackWrites: 0,
    };

    console.warn(
      `[WriteQueueErrorHandler] SQL variable limit hit during batch flush, applying adaptive chunk split ` +
        `(nodes=${nodes.length}, edges=${edges.length}, message=${originalError.message})`
    );

    const nodeWriteResult = await this.processNodesWithAdaptiveChunking(nodes, diagnostics);
    const edgeWriteResult = await this.processEdgesWithAdaptiveChunking(
      edges,
      diagnostics,
      allowForeignKeyRequeue
    );
    const successCount = nodeWriteResult + edgeWriteResult.written;

    if (successCount > 0) {
      this.metrics.partialSuccesses++;
    }

    return {
      totalWritten: successCount,
      nodesWritten: nodeWriteResult,
      edgesWritten: edgeWriteResult.written,
      circuitOpen: this.circuitOpen,
      deadLetterCount: this.deadLetterQueue.length,
      deferredForeignKeyCount: edgeWriteResult.deferredEdges.length,
      deferredEdges: edgeWriteResult.deferredEdges,
      diagnostics: {
        sqlVariableSplit: diagnostics,
      },
    };
  }

  private async processNodesWithAdaptiveChunking(
    nodes: AnyNode[],
    diagnostics: SqlVariableSplitDiagnostics
  ): Promise<number> {
    if (nodes.length === 0) {
      return 0;
    }

    const writeChunk = async (chunk: AnyNode[]): Promise<number> => {
      if (chunk.length === 0) {
        return 0;
      }

      diagnostics.nodeChunksProcessed += 1;

      try {
        if (this.db.createNodes) {
          await this.db.createNodes(chunk);
        } else {
          let fallbackWritten = 0;
          for (const node of chunk) {
            const success = await this.tryWriteNode(node, 0);
            if (success) {
              fallbackWritten++;
              this.metrics.successfulWrites++;
              this.metrics.successfulNodeWrites++;
            } else {
              this.metrics.failedWrites++;
              this.metrics.failedNodeWrites++;
            }
          }
          diagnostics.nodeFallbackWrites += chunk.length;
          return fallbackWritten;
        }

        this.metrics.successfulWrites += chunk.length;
        this.metrics.successfulNodeWrites += chunk.length;
        return chunk.length;
      } catch (error: any) {
        const normalized = this.ensureError(error);
        if (this.isSqlVariableLimitError(normalized) && chunk.length > 1) {
          const midpoint = Math.floor(chunk.length / 2);
          diagnostics.splitRetries += 1;
          this.metrics.sqlVariableSplitRetries += 1;
          const left = await writeChunk(chunk.slice(0, midpoint));
          const right = await writeChunk(chunk.slice(midpoint));
          return left + right;
        }

        let written = 0;
        diagnostics.nodeFallbackWrites += chunk.length;
        for (const node of chunk) {
          const success = await this.tryWriteNode(node, 0);
          if (success) {
            written += 1;
            this.metrics.successfulWrites++;
            this.metrics.successfulNodeWrites++;
          } else {
            this.metrics.failedWrites++;
            this.metrics.failedNodeWrites++;
          }
        }
        return written;
      }
    };

    let totalWritten = 0;
    for (let index = 0; index < nodes.length; index += this.SQL_VARIABLE_SAFE_CHUNK_SIZE) {
      const chunk = nodes.slice(index, index + this.SQL_VARIABLE_SAFE_CHUNK_SIZE);
      totalWritten += await writeChunk(chunk);
    }

    return totalWritten;
  }

  private async processEdgesWithAdaptiveChunking(
    edges: AnyEdge[],
    diagnostics: SqlVariableSplitDiagnostics,
    allowForeignKeyRequeue: boolean
  ): Promise<{ written: number; deferredEdges: AnyEdge[] }> {
    if (edges.length === 0) {
      return { written: 0, deferredEdges: [] };
    }

    const writeChunk = async (
      chunk: AnyEdge[]
    ): Promise<{ written: number; deferredEdges: AnyEdge[] }> => {
      if (chunk.length === 0) {
        return { written: 0, deferredEdges: [] };
      }

      diagnostics.edgeChunksProcessed += 1;

      try {
        if (this.db.createEdges) {
          await this.db.createEdges(chunk);
        } else {
          let fallbackWritten = 0;
          const deferredEdges: AnyEdge[] = [];
          diagnostics.edgeFallbackWrites += chunk.length;
          for (const edge of chunk) {
            const result = await this.tryWriteEdge(edge, 0, false, allowForeignKeyRequeue);
            if (result.success) {
              fallbackWritten++;
              this.metrics.successfulWrites++;
              this.metrics.successfulEdgeWrites++;
            } else if (result.deferredForeignKey && result.deferredEdge) {
              deferredEdges.push(result.deferredEdge);
              this.metrics.foreignKeyDeferredRetries++;
            } else {
              this.metrics.failedWrites++;
              this.metrics.failedEdgeWrites++;
            }
          }
          return { written: fallbackWritten, deferredEdges };
        }

        this.metrics.successfulWrites += chunk.length;
        this.metrics.successfulEdgeWrites += chunk.length;
        return { written: chunk.length, deferredEdges: [] };
      } catch (error: any) {
        const normalized = this.ensureError(error);
        if (this.isSqlVariableLimitError(normalized) && chunk.length > 1) {
          const midpoint = Math.floor(chunk.length / 2);
          diagnostics.splitRetries += 1;
          this.metrics.sqlVariableSplitRetries += 1;
          const left = await writeChunk(chunk.slice(0, midpoint));
          const right = await writeChunk(chunk.slice(midpoint));
          return {
            written: left.written + right.written,
            deferredEdges: [...left.deferredEdges, ...right.deferredEdges],
          };
        }

        diagnostics.edgeFallbackWrites += chunk.length;
        let fallbackWritten = 0;
        const deferredEdges: AnyEdge[] = [];
        for (const edge of chunk) {
          const result = await this.tryWriteEdge(edge, 0, false, allowForeignKeyRequeue);
          if (result.success) {
            fallbackWritten++;
            this.metrics.successfulWrites++;
            this.metrics.successfulEdgeWrites++;
          } else if (result.deferredForeignKey && result.deferredEdge) {
            deferredEdges.push(result.deferredEdge);
            this.metrics.foreignKeyDeferredRetries++;
          } else {
            this.metrics.failedWrites++;
            this.metrics.failedEdgeWrites++;
          }
        }
        return { written: fallbackWritten, deferredEdges };
      }
    };

    let totalWritten = 0;
    const deferredEdges: AnyEdge[] = [];
    for (let index = 0; index < edges.length; index += this.SQL_VARIABLE_SAFE_CHUNK_SIZE) {
      const chunk = edges.slice(index, index + this.SQL_VARIABLE_SAFE_CHUNK_SIZE);
      const chunkResult = await writeChunk(chunk);
      totalWritten += chunkResult.written;
      deferredEdges.push(...chunkResult.deferredEdges);
    }

    return {
      written: totalWritten,
      deferredEdges,
    };
  }

  /**
   * Try writing items individually for partial success.
   */
  private async tryIndividualWrites(
    nodes: AnyNode[],
    edges: AnyEdge[],
    allowForeignKeyRequeue: boolean
  ): Promise<FlushResult> {
    let nodesWritten = 0;
    let edgesWritten = 0;
    const deferredForeignKeyEdges: AnyEdge[] = [];
    const unresolvedForeignKeyEdges: AnyEdge[] = [];

    for (const node of nodes) {
      const success = await this.tryWriteNode(node);
      if (success) {
        nodesWritten++;
        this.metrics.successfulWrites++;
        this.metrics.successfulNodeWrites++;
      } else {
        this.metrics.failedWrites++;
        this.metrics.failedNodeWrites++;
      }
    }

    for (const edge of edges) {
      const result = await this.tryWriteEdge(edge, 0, true);
      if (result.success) {
        edgesWritten++;
        this.metrics.successfulWrites++;
        this.metrics.successfulEdgeWrites++;
      } else if (result.deferredForeignKey && result.deferredEdge) {
        deferredForeignKeyEdges.push(result.deferredEdge);
      } else {
        this.metrics.failedWrites++;
        this.metrics.failedEdgeWrites++;
      }
    }

    // Single deferred retry pass after node writes complete in this flush cycle.
    for (const edge of deferredForeignKeyEdges) {
      const retryResult = await this.tryWriteEdge(edge, 0, false, allowForeignKeyRequeue);
      if (retryResult.success) {
        edgesWritten++;
        this.metrics.successfulWrites++;
        this.metrics.successfulEdgeWrites++;
      } else if (retryResult.deferredForeignKey && retryResult.deferredEdge) {
        unresolvedForeignKeyEdges.push(retryResult.deferredEdge);
        this.metrics.foreignKeyDeferredRetries++;
      } else {
        this.metrics.failedWrites++;
        this.metrics.failedEdgeWrites++;
      }
    }

    const successCount = nodesWritten + edgesWritten;
    if (successCount > 0) {
      this.metrics.partialSuccesses++;
    }

    return {
      totalWritten: successCount,
      nodesWritten,
      edgesWritten,
      circuitOpen: this.circuitOpen,
      deadLetterCount: this.deadLetterQueue.length,
      deferredForeignKeyCount: unresolvedForeignKeyEdges.length,
      deferredEdges: unresolvedForeignKeyEdges,
    };
  }

  private async tryWriteNode(node: AnyNode, attemptCount: number = 0): Promise<boolean> {
    try {
      if (this.db.createNode) {
        await this.db.createNode(node);
      }
      if (attemptCount > 0) {
        this.metrics.retriedWrites++;
      }
      return true;
    } catch (error: any) {
      if (attemptCount < this.options.maxRetries) {
        const delayMs = this.calculateRetryDelay(attemptCount);
        await this.sleep(delayMs);
        return this.tryWriteNode(node, attemptCount + 1);
      }

      this.addToDeadLetterQueue('node', node, this.ensureError(error), attemptCount + 1);
      return false;
    }
  }

  private async tryWriteEdge(
    edge: AnyEdge,
    attemptCount: number = 0,
    deferForeignKeyDeadLetter: boolean = false,
    allowForeignKeyRequeue: boolean = false
  ): Promise<EdgeWriteResult> {
    try {
      if (this.db.createEdge) {
        await this.db.createEdge(edge);
      }
      if (attemptCount > 0) {
        this.metrics.retriedWrites++;
      }
      return { success: true };
    } catch (error: any) {
      if (attemptCount < this.options.maxRetries) {
        const delayMs = this.calculateRetryDelay(attemptCount);
        await this.sleep(delayMs);
        return this.tryWriteEdge(edge, attemptCount + 1, deferForeignKeyDeadLetter);
      }

      const normalizedError = this.ensureError(error);
      const isForeignKeyFailure = this.isForeignKeyConstraintError(normalizedError);
      if (isForeignKeyFailure) {
        this.metrics.fkConstraintFailures++;
      }

      if (isForeignKeyFailure && (deferForeignKeyDeadLetter || allowForeignKeyRequeue)) {
        return { success: false, deferredForeignKey: true, deferredEdge: edge };
      }

      this.addToDeadLetterQueue(
        'edge',
        edge,
        normalizedError,
        attemptCount + 1,
        isForeignKeyFailure ? 'FK_MISSING_ENDPOINT' : undefined
      );
      return { success: false };
    }
  }

  forceDeadLetterEdge(
    edge: AnyEdge,
    reason: string = 'FK_MISSING_ENDPOINT',
    message: string = 'Unresolved foreign-key edge endpoint after deferred retries'
  ): void {
    this.addToDeadLetterQueue(
      'edge',
      edge,
      new Error(message),
      this.options.maxRetries + 1,
      reason
    );
    this.metrics.failedWrites++;
    this.metrics.failedEdgeWrites++;
  }

  private calculateRetryDelay(attemptCount: number): number {
    if (!this.options.useExponentialBackoff) {
      return this.options.retryDelayMs;
    }

    return this.options.retryDelayMs * Math.pow(2, attemptCount);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private addToDeadLetterQueue(
    type: 'node' | 'edge',
    data: AnyNode | AnyEdge,
    error: Error,
    attemptCount: number,
    normalizedReason?: string
  ): void {
    if (this.deadLetterQueue.length >= this.options.deadLetterQueueSize) {
      this.deadLetterQueue.shift();
    }

    this.deadLetterQueue.push({
      type,
      data,
      error,
      normalizedReason,
      timestamp: Date.now(),
      attemptCount,
    });

    this.metrics.deadLetterItems++;
    this.metrics.deadLetterEnqueues++;
  }

  private openCircuit(): void {
    this.circuitOpen = true;
    this.circuitOpenedAt = Date.now();
    this.metrics.circuitBreakerOpens++;
    const resetTimeSeconds = this.options.circuitBreakerResetMs / 1000;

    console.error(
      `[WriteQueueErrorHandler] CIRCUIT_BREAKER_OPEN after ${this.consecutiveFailures} failures`
    );
    console.error(`   write operations paused, auto-reset in ${resetTimeSeconds}s`);
    console.error(`   dead letter queue size: ${this.deadLetterQueue.length}`);
  }

  closeCircuit(): void {
    this.circuitOpen = false;
    this.circuitOpenedAt = null;
    this.consecutiveFailures = 0;
  }

  getMetrics(): WriteQueueMetrics {
    return { ...this.metrics };
  }

  getDeadLetterQueue(): DeadLetterItem[] {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    return count;
  }

  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }

  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulWrites: 0,
      successfulNodeWrites: 0,
      successfulEdgeWrites: 0,
      failedWrites: 0,
      failedNodeWrites: 0,
      failedEdgeWrites: 0,
      fkConstraintFailures: 0,
      retriedWrites: 0,
      circuitBreakerOpens: 0,
      partialSuccesses: 0,
      deadLetterItems: 0,
      deadLetterEnqueues: 0,
      sqlVariableSplitRetries: 0,
      foreignKeyDeferredRetries: 0,
    };
  }

  private isForeignKeyConstraintError(error: Error): boolean {
    const message = String(error?.message || '').toUpperCase();
    return (
      message.includes('SQLITE_CONSTRAINT_FOREIGNKEY') ||
      message.includes('FOREIGN KEY CONSTRAINT FAILED')
    );
  }

  private isSqlVariableLimitError(error: Error): boolean {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('too many sql variables');
  }

  private ensureError(value: unknown): Error {
    if (value instanceof Error) {
      return value;
    }
    return new Error(String(value));
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
