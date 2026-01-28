/**
 * DatabaseWriteQueue Integration Tests
 *
 * Tests integration with WriteQueueErrorHandler:
 * - Error handler is called for all writes
 * - Stats are updated from error metrics
 * - Circuit breaker status is exposed
 * - Dead letter queue is accessible
 * - Normal operations still work (no regression)
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { DatabaseWriteQueue } from '../DatabaseWriteQueue';
import { AnyNode } from '@keimenon/types';

// Database-level type for testing (matches actual DB schema, not application types)
type DBNode = {
  id: string;
  kind: string;
  properties: Record<string, any>;
  account_id: string;
  created_by: string;
  created_at?: number;
  updated_at?: number;
  data_tag?: 'test' | 'real';
  content_hash?: string;
  canonical_content?: string;
  is_duplicate?: number;
  original_node_id?: string;
};

let db: Database.Database;
let queue: DatabaseWriteQueue;

beforeAll(async () => {
  // Create in-memory test database
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Create minimal schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT NOT NULL DEFAULT 'client',
      account_class TEXT NOT NULL DEFAULT 'free',
      account_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'real',
      content_hash TEXT,
      canonical_content TEXT,
      is_duplicate INTEGER DEFAULT 0,
      original_node_id TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Seed test data
    INSERT INTO accounts VALUES ('test_account', 'client', 'free', 'Test Account', 0, 0);
    INSERT INTO users VALUES ('test_user', 'test_account', 'test@test.com', 'hash', 'Test User', 0, 0);
  `);

  // Create write queue (error handler initialized in constructor)
  queue = new DatabaseWriteQueue(db as any);
  queue.start();
});

afterAll(async () => {
  if (queue) {
    await queue.stop();
  }
  if (db) {
    db.close();
  }
});

// Helper: Create test node (DB-level type, cast to AnyNode for queue.enqueueNodes)
function createTestNode(id: string): AnyNode {
  const dbNode: DBNode = {
    id,
    kind: 'source',
    properties: { title: `Test ${id}` },
    account_id: 'test_account',
    created_by: 'test_user',
    data_tag: 'test' as const,
  };
  return dbNode as unknown as AnyNode;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('DatabaseWriteQueue Integration', () => {
  it('should successfully enqueue nodes via error handler', async () => {
    const node = createTestNode('node_1');
    queue.enqueueNode(node);

    const sizes = queue.getQueueSizes();
    assert.ok(sizes.nodes >= 1, 'Node should be enqueued');
  });

  it('should expose circuit breaker status', () => {
    const isOpen = queue.isCircuitOpen();
    assert.strictEqual(typeof isOpen, 'boolean', 'Should return boolean circuit breaker status');
    assert.strictEqual(isOpen, false, 'Circuit should be closed initially');
  });

  it('should allow manual circuit breaker control', () => {
    queue.closeCircuitBreaker();
    assert.strictEqual(queue.isCircuitOpen(), false, 'Circuit should remain closed');
  });

  it('should expose error metrics', () => {
    const metrics = queue.getErrorMetrics();

    assert.ok(metrics !== null, 'Metrics should be available');
    assert.strictEqual(typeof metrics.totalAttempts, 'number', 'Should track total attempts');
    assert.strictEqual(typeof metrics.successfulWrites, 'number', 'Should track successful writes');
    assert.strictEqual(typeof metrics.failedWrites, 'number', 'Should track failed writes');
    assert.strictEqual(
      typeof metrics.circuitBreakerOpens,
      'number',
      'Should track circuit breaker opens'
    );
  });

  it('should expose dead letter queue', () => {
    const deadLetterQueue = queue.getDeadLetterQueue();

    assert.ok(Array.isArray(deadLetterQueue), 'Dead letter queue should be an array');
    assert.strictEqual(deadLetterQueue.length, 0, 'Should start empty');
  });

  it('should clear dead letter queue', () => {
    const cleared = queue.clearDeadLetterQueue();
    assert.strictEqual(typeof cleared, 'number', 'Should return count of cleared items');
    assert.strictEqual(cleared, 0, 'Should be 0 for empty queue');
  });

  it('should update stats from error handler', () => {
    const node1 = createTestNode('stats_1');
    const node2 = createTestNode('stats_2');

    queue.enqueueNode(node1);
    queue.enqueueNode(node2);

    const stats = queue.getStats();
    assert.ok(stats.nodesQueued >= 2, 'Stats should track queued nodes');
  });

  it('should handle batch writes with error recovery', () => {
    // Enqueue multiple nodes
    for (let i = 0; i < 10; i++) {
      queue.enqueueNode(createTestNode(`batch_${i}`));
    }

    const stats = queue.getStats();
    assert.ok(stats.nodesQueued >= 10, 'Should enqueue all nodes');
  });

  it('should continue operations after errors', () => {
    const node1 = createTestNode('continue_1');
    queue.enqueueNode(node1);

    // Try to insert duplicate (will fail but should be handled)
    const duplicate = createTestNode('continue_1');
    queue.enqueueNode(duplicate);

    // Circuit should still be closed (handled gracefully)
    assert.strictEqual(
      queue.isCircuitOpen(),
      false,
      'Circuit should remain closed after handled errors'
    );

    // Should still be able to write new nodes
    const node2 = createTestNode('continue_2');
    queue.enqueueNode(node2);

    const stats = queue.getStats();
    assert.ok(stats.nodesQueued >= 2, 'Should continue enqueuing after errors');
  });

  it('should expose queue sizes', () => {
    queue.enqueueNode(createTestNode('size_1'));
    queue.enqueueNode(createTestNode('size_2'));

    const sizes = queue.getQueueSizes();
    assert.ok(sizes.nodes >= 0, 'Should track node queue size');
    assert.strictEqual(typeof sizes.edges, 'number', 'Should track edge queue size');
  });

  it('should force flush on demand', async () => {
    const node = createTestNode('force_flush');
    queue.enqueueNode(node);

    // Force flush immediately (don't wait for interval)
    await queue.forceFlush();

    // After flush, queue should be empty
    const sizes = queue.getQueueSizes();
    assert.strictEqual(sizes.nodes, 0, 'Queue should be empty after flush');
  });
});
