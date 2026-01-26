/**
 * Write Queue Error Handler
 *
 * Provides robust error handling for database write operations with:
 * - Exponential backoff retry logic
 * - Circuit breaker pattern (stop after N consecutive failures)
 * - Partial success handling (save what works, quarantine what fails)
 * - Dead letter queue for failed items
 * - Metrics and logging
 *
 * Prevents infinite error loops and data loss during imports.
 */

import { DatabaseClient } from '@keimenon/db';
import { AnyNode, AnyEdge } from '@keimenon/types';

export interface WriteQueueMetrics {
  totalAttempts: number;
  successfulWrites: number;
  failedWrites: number;
  retriedWrites: number;
  circuitBreakerOpens: number;
  partialSuccesses: number;
  deadLetterItems: number;
}

export interface DeadLetterItem {
  type: 'node' | 'edge';
  data: AnyNode | AnyEdge;
  error: Error;
  timestamp: number;
  attemptCount: number;
}

export interface WriteQueueErrorHandlerOptions {
  maxConsecutiveFailures?: number; // Circuit breaker threshold (default: 3)
  maxRetries?: number; // Max retries per item (default: 2)
  retryDelayMs?: number; // Initial retry delay (default: 1000)
  useExponentialBackoff?: boolean; // Use exponential backoff (default: true)
  enableCircuitBreaker?: boolean; // Enable circuit breaker (default: true)
  deadLetterQueueSize?: number; // Max dead letter queue size (default: 1000)
  circuitBreakerResetMs?: number; // Auto-reset timeout for circuit breaker (default: 30000)
}

export class WriteQueueErrorHandler {
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt: number | null = null;
  private deadLetterQueue: DeadLetterItem[] = [];
  private metrics: WriteQueueMetrics = {
    totalAttempts: 0,
    successfulWrites: 0,
    failedWrites: 0,
    retriedWrites: 0,
    circuitBreakerOpens: 0,
    partialSuccesses: 0,
    deadLetterItems: 0,
  };

  private options: Required<WriteQueueErrorHandlerOptions>;

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
   * Handle flush operation with error recovery
   * Returns number of items successfully written
   */
  async handleFlush(nodes: AnyNode[], edges: AnyEdge[]): Promise<number> {
    this.metrics.totalAttempts++;

    // Check circuit breaker
    if (this.circuitOpen && this.options.enableCircuitBreaker) {
      // Try to auto-close circuit after configured timeout
      const resetTimeout = this.options.circuitBreakerResetMs;
      if (this.circuitOpenedAt && Date.now() - this.circuitOpenedAt > resetTimeout) {
        console.log(`🔄 Circuit breaker auto-closing after ${resetTimeout / 1000}s timeout`);
        this.closeCircuit();
      } else {
        const remainingSeconds = Math.ceil(
          (resetTimeout - (Date.now() - (this.circuitOpenedAt || 0))) / 1000
        );
        const error = new CircuitBreakerOpenError(
          `Circuit breaker is open after ${this.consecutiveFailures} consecutive failures. ` +
            `Will auto-reset in ${remainingSeconds}s. ` +
            `Manual reset: POST /api/v1/debug/queue/reset-circuit`
        );
        console.error('🚫', error.message);
        throw error;
      }
    }

    try {
      // Try batch write first (most efficient)
      if (nodes.length > 0 && this.db.createNodes) {
        await this.db.createNodes(nodes);
      }
      if (edges.length > 0 && this.db.createEdges) {
        await this.db.createEdges(edges);
      }

      // Success - reset failure counter
      this.consecutiveFailures = 0;
      this.metrics.successfulWrites += nodes.length + edges.length;

      return nodes.length + edges.length;
    } catch (error: any) {
      this.consecutiveFailures++;
      this.metrics.failedWrites += nodes.length + edges.length;

      console.error(
        `❌ Batch write failed (attempt ${this.consecutiveFailures}/${this.options.maxConsecutiveFailures}):`,
        error.message
      );

      // Open circuit breaker if threshold reached
      if (
        this.options.enableCircuitBreaker &&
        this.consecutiveFailures >= this.options.maxConsecutiveFailures
      ) {
        this.openCircuit();
      }

      // Try individual writes (partial success)
      return await this.tryIndividualWrites(nodes, edges);
    }
  }

  /**
   * Try writing items individually for partial success
   */
  private async tryIndividualWrites(nodes: AnyNode[], edges: AnyEdge[]): Promise<number> {
    let successCount = 0;

    console.log(
      `🔄 Attempting individual writes for ${nodes.length} nodes and ${edges.length} edges`
    );

    // Try nodes individually
    for (const node of nodes) {
      const success = await this.tryWriteNode(node);
      if (success) {
        successCount++;
        this.metrics.successfulWrites++;
      } else {
        this.metrics.failedWrites++;
      }
    }

    // Try edges individually
    for (const edge of edges) {
      const success = await this.tryWriteEdge(edge);
      if (success) {
        successCount++;
        this.metrics.successfulWrites++;
      } else {
        this.metrics.failedWrites++;
      }
    }

    if (successCount > 0) {
      this.metrics.partialSuccesses++;
      console.log(
        `✅ Partial success: ${successCount}/${nodes.length + edges.length} items written`
      );
    }

    return successCount;
  }

  /**
   * Try writing a single node with retries
   */
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
      // Retry with exponential backoff
      if (attemptCount < this.options.maxRetries) {
        const delayMs = this.calculateRetryDelay(attemptCount);
        console.log(
          `🔄 Retrying node ${node.id} after ${delayMs}ms (attempt ${attemptCount + 1}/${this.options.maxRetries})`
        );

        await this.sleep(delayMs);
        return await this.tryWriteNode(node, attemptCount + 1);
      }

      // Max retries exceeded - add to dead letter queue
      console.error(
        `❌ Failed to write node ${node.id} after ${attemptCount + 1} attempts:`,
        error.message
      );
      this.addToDeadLetterQueue('node', node, error, attemptCount + 1);
      return false;
    }
  }

  /**
   * Try writing a single edge with retries
   */
  private async tryWriteEdge(edge: AnyEdge, attemptCount: number = 0): Promise<boolean> {
    try {
      if (this.db.createEdge) {
        await this.db.createEdge(edge);
      }
      if (attemptCount > 0) {
        this.metrics.retriedWrites++;
      }
      return true;
    } catch (error: any) {
      // Retry with exponential backoff
      if (attemptCount < this.options.maxRetries) {
        const delayMs = this.calculateRetryDelay(attemptCount);
        console.log(
          `🔄 Retrying edge ${edge.id} after ${delayMs}ms (attempt ${attemptCount + 1}/${this.options.maxRetries})`
        );

        await this.sleep(delayMs);
        return await this.tryWriteEdge(edge, attemptCount + 1);
      }

      // Max retries exceeded - add to dead letter queue
      console.error(
        `❌ Failed to write edge ${edge.id} after ${attemptCount + 1} attempts:`,
        error.message
      );
      this.addToDeadLetterQueue('edge', edge, error, attemptCount + 1);
      return false;
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attemptCount: number): number {
    if (!this.options.useExponentialBackoff) {
      return this.options.retryDelayMs;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ...
    return this.options.retryDelayMs * Math.pow(2, attemptCount);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Add item to dead letter queue
   */
  private addToDeadLetterQueue(
    type: 'node' | 'edge',
    data: AnyNode | AnyEdge,
    error: Error,
    attemptCount: number
  ): void {
    // Check queue size limit
    if (this.deadLetterQueue.length >= this.options.deadLetterQueueSize) {
      console.warn(
        `⚠️ Dead letter queue full (${this.options.deadLetterQueueSize}), dropping oldest item`
      );
      this.deadLetterQueue.shift(); // Remove oldest
    }

    this.deadLetterQueue.push({
      type,
      data,
      error,
      timestamp: Date.now(),
      attemptCount,
    });

    this.metrics.deadLetterItems++;
  }

  /**
   * Open circuit breaker
   */
  private openCircuit(): void {
    this.circuitOpen = true;
    this.circuitOpenedAt = Date.now();
    this.metrics.circuitBreakerOpens++;

    const resetTimeSeconds = this.options.circuitBreakerResetMs / 1000;

    console.error(
      `🚫 CIRCUIT BREAKER OPENED after ${this.consecutiveFailures} consecutive failures.`
    );
    console.error(`   Write operations paused. Will auto-reset in ${resetTimeSeconds}s.`);
    console.error(`   Manual reset: POST /api/v1/debug/queue/reset-circuit`);
    console.error(`   Dead letter queue size: ${this.deadLetterQueue.length} items`);
    console.error(`   Troubleshooting:`);
    console.error(`   1. Check database connection and disk space`);
    console.error(`   2. Review dead letter queue for error patterns`);
    console.error(`   3. Consider increasing CIRCUIT_BREAKER_RESET_MS if transient failures`);

    // TODO: Send alert to monitoring system
    // this.sendAlert('Write queue circuit breaker opened');
  }

  /**
   * Close circuit breaker (manual reset or auto after timeout)
   */
  closeCircuit(): void {
    console.log('✅ Circuit breaker closed, resuming operations');
    this.circuitOpen = false;
    this.circuitOpenedAt = null;
    this.consecutiveFailures = 0;
  }

  /**
   * Get current metrics
   */
  getMetrics(): WriteQueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Get dead letter queue items
   */
  getDeadLetterQueue(): DeadLetterItem[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    return count;
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulWrites: 0,
      failedWrites: 0,
      retriedWrites: 0,
      circuitBreakerOpens: 0,
      partialSuccesses: 0,
      deadLetterItems: 0,
    };
  }
}

/**
 * Circuit Breaker Open Error
 * Thrown when circuit breaker is open (too many consecutive failures)
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
