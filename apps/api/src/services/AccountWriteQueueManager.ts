/**
 * AccountWriteQueueManager
 *
 * Purpose: Manage per-account write queues to prevent starvation in M:N user-account architecture.
 *
 * In a multi-user, multi-account system, we need to ensure:
 * 1. Users in different accounts don't block each other
 * 2. Heavy operations in one account don't starve other accounts
 * 3. Fair resource allocation across accounts
 *
 * Implementation:
 * - Separate write queue per account
 * - Round-robin scheduling between accounts
 * - Concurrent processing within each account
 * - Backpressure handling
 */

import { randomUUID } from 'crypto';

export interface WriteOperation {
  id: string;
  accountId: string;
  userId: string;
  operation: () => Promise<any>;
  priority?: number; // 1-10, higher is more important
  timeout?: number; // milliseconds
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

export interface QueueStats {
  accountId: string;
  queuedOperations: number;
  runningOperations: number;
  completedOperations: number;
  failedOperations: number;
  avgProcessingTime: number;
}

interface AccountQueue {
  accountId: string;
  operations: WriteOperation[];
  running: number;
  maxConcurrent: number;
  stats: {
    completed: number;
    failed: number;
    totalProcessingTime: number;
  };
}

/**
 * Manages separate write queues for each account to prevent cross-account starvation
 */
export class AccountWriteQueueManager {
  private queues: Map<string, AccountQueue> = new Map();
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly defaultMaxConcurrent: number = 3;
  private readonly processingIntervalMs: number = 100; // Check queues every 100ms

  constructor(maxConcurrentPerAccount: number = 3, processingIntervalMs: number = 100) {
    this.defaultMaxConcurrent = maxConcurrentPerAccount;
    this.processingIntervalMs = processingIntervalMs;
  }

  /**
   * Start the queue processor
   */
  start(): void {
    if (this.processingInterval) {
      return; // Already started
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processQueues();
    }, this.processingIntervalMs);

    console.log('✅ AccountWriteQueueManager started');
  }

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    console.log('🛑 AccountWriteQueueManager stopped');
  }

  /**
   * Enqueue a write operation for an account
   */
  async enqueue(operation: WriteOperation): Promise<void> {
    // Get or create queue for this account
    let queue = this.queues.get(operation.accountId);
    if (!queue) {
      queue = {
        accountId: operation.accountId,
        operations: [],
        running: 0,
        maxConcurrent: this.defaultMaxConcurrent,
        stats: {
          completed: 0,
          failed: 0,
          totalProcessingTime: 0,
        },
      };
      this.queues.set(operation.accountId, queue);
    }

    // Add operation ID if not present
    if (!operation.id) {
      operation.id = randomUUID();
    }

    // Add to queue (sorted by priority if present)
    queue.operations.push(operation);
    queue.operations.sort((a, b) => (b.priority || 5) - (a.priority || 5));

    console.log(
      `📥 Enqueued operation ${operation.id} for account ${operation.accountId} (queue size: ${queue.operations.length})`
    );
  }

  /**
   * Process operations from all account queues (round-robin)
   */
  private async processQueues(): Promise<void> {
    if (!this.isProcessing) return;

    // Get all accounts with pending operations
    const accountsWithWork = Array.from(this.queues.entries())
      .filter(([_, queue]) => queue.operations.length > 0 || queue.running > 0)
      .map(([accountId, queue]) => ({ accountId, queue }));

    if (accountsWithWork.length === 0) {
      return; // No work to do
    }

    // Round-robin: process one operation from each account that has capacity
    for (const { accountId, queue } of accountsWithWork) {
      // Check if this account has capacity to run more operations
      if (queue.running >= queue.maxConcurrent) {
        continue; // Account is at max concurrency
      }

      // Check if there are operations to process
      if (queue.operations.length === 0) {
        continue; // No operations in queue
      }

      // Take the next operation (already sorted by priority)
      const operation = queue.operations.shift();
      if (!operation) continue;

      // Mark as running
      queue.running++;

      // Process asynchronously (don't await - let it run in background)
      this.processOperation(operation, queue).catch((error) => {
        console.error(`Error processing operation ${operation.id}:`, error);
      });
    }
  }

  /**
   * Process a single write operation
   */
  private async processOperation(operation: WriteOperation, queue: AccountQueue): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`🔄 Processing operation ${operation.id} for account ${operation.accountId}`);

      // Apply timeout if specified
      let result: any;
      if (operation.timeout) {
        result = await Promise.race([
          operation.operation(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), operation.timeout)
          ),
        ]);
      } else {
        result = await operation.operation();
      }

      // Update stats
      const processingTime = Date.now() - startTime;
      queue.stats.completed++;
      queue.stats.totalProcessingTime += processingTime;

      console.log(`✅ Completed operation ${operation.id} in ${processingTime}ms`);

      // Call success callback if provided
      if (operation.onSuccess) {
        operation.onSuccess(result);
      }
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      queue.stats.failed++;
      queue.stats.totalProcessingTime += processingTime;

      console.error(
        `❌ Failed operation ${operation.id} after ${processingTime}ms:`,
        error.message
      );

      // Call error callback if provided
      if (operation.onError) {
        operation.onError(error);
      }
    } finally {
      // Decrement running count
      queue.running--;

      // Clean up empty queues
      if (queue.operations.length === 0 && queue.running === 0) {
        // Keep queue for stats, but could optionally delete it here
        // this.queues.delete(operation.accountId);
      }
    }
  }

  /**
   * Get queue statistics for an account
   */
  getStats(accountId: string): QueueStats | null {
    const queue = this.queues.get(accountId);
    if (!queue) {
      return null;
    }

    const avgProcessingTime =
      queue.stats.completed > 0 ? queue.stats.totalProcessingTime / queue.stats.completed : 0;

    return {
      accountId,
      queuedOperations: queue.operations.length,
      runningOperations: queue.running,
      completedOperations: queue.stats.completed,
      failedOperations: queue.stats.failed,
      avgProcessingTime,
    };
  }

  /**
   * Get stats for all accounts
   */
  getAllStats(): QueueStats[] {
    return Array.from(this.queues.keys())
      .map((accountId) => this.getStats(accountId))
      .filter((stats): stats is QueueStats => stats !== null);
  }

  /**
   * Set max concurrent operations for a specific account
   */
  setAccountConcurrency(accountId: string, maxConcurrent: number): void {
    const queue = this.queues.get(accountId);
    if (queue) {
      queue.maxConcurrent = maxConcurrent;
      console.log(`🎛️  Set max concurrency for account ${accountId} to ${maxConcurrent}`);
    }
  }

  /**
   * Clear all operations for an account (e.g., on account deletion)
   */
  clearAccount(accountId: string): void {
    const queue = this.queues.get(accountId);
    if (queue) {
      queue.operations = [];
      console.log(`🗑️  Cleared queue for account ${accountId}`);
    }
  }

  /**
   * Get total number of queued operations across all accounts
   */
  getTotalQueuedOperations(): number {
    return Array.from(this.queues.values()).reduce(
      (sum, queue) => sum + queue.operations.length,
      0
    );
  }

  /**
   * Get total number of running operations across all accounts
   */
  getTotalRunningOperations(): number {
    return Array.from(this.queues.values()).reduce((sum, queue) => sum + queue.running, 0);
  }
}

// Singleton instance
let instance: AccountWriteQueueManager | null = null;

/**
 * Get the singleton AccountWriteQueueManager instance
 */
export function getAccountWriteQueueManager(): AccountWriteQueueManager {
  if (!instance) {
    instance = new AccountWriteQueueManager(3, 100);
    instance.start();
  }
  return instance;
}

/**
 * Initialize the AccountWriteQueueManager with custom settings
 */
export function initializeAccountWriteQueueManager(
  maxConcurrentPerAccount: number = 3,
  processingIntervalMs: number = 100
): AccountWriteQueueManager {
  if (instance) {
    instance.stop();
  }
  instance = new AccountWriteQueueManager(maxConcurrentPerAccount, processingIntervalMs);
  instance.start();
  return instance;
}
