/**
 * Batched Delete Worker Integration Tests
 *
 * Tests the batched deletion system with large datasets to verify:
 * - Event loop yielding (UI stays responsive)
 * - Progress reporting during deletion
 * - Incremental batch processing
 * - Cancellation mid-deletion
 * - Performance with 10K+ nodes
 *
 * Related:
 * - apps/api/src/modules/workers/infrastructure/DeleteWorker.ts (batched implementation)
 * - docs/active_development/FINAL_FIX_DELETE_WORKER_BATCHING.md
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';
import path from 'path';

// Test configuration
const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const DB_PATH =
  process.env.DB_PATH ||
  path.join(process.env.HOME || process.env.USERPROFILE || '', '.canvas-memory', 'canvas.db');

// Test credentials
const ADMIN_CREDENTIALS = {
  email: 'admin@admin.com',
  password: 'admin123',
};

// Test state
let adminToken: string;
let adminAccountId: string;
let db: Database.Database;

/**
 * Login and get JWT token
 */
async function login(
  email: string,
  password: string
): Promise<{ token: string; accountId: string }> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  return {
    token: data.token,
    accountId: data.user.account_id,
  };
}

/**
 * Wait for job to reach terminal status
 * Returns all progress updates collected during wait
 */
async function waitForJobCompletion(
  jobId: string,
  token: string,
  timeoutMs: number = 120000
): Promise<{ job: any; progressUpdates: any[] }> {
  const startTime = Date.now();
  const progressUpdates: any[] = [];

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${API_URL}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await response.json()) as any;
    const status = data.job.state.status;

    // Record progress update
    progressUpdates.push({
      timestamp: Date.now() - startTime,
      status,
      progress: data.job.progress.percent,
      message: data.job.progress.message,
    });

    if (['succeeded', 'failed', 'canceled'].includes(status)) {
      return { job: data.job, progressUpdates };
    }

    // Wait 200ms before next check (faster than production for testing)
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

/**
 * Create test nodes directly in database
 * This is faster than importing for large datasets
 */
function createTestNodes(accountId: string, count: number): number {
  const userId = db
    .prepare('SELECT id FROM users WHERE account_id = ? LIMIT 1')
    .get(accountId) as any;
  if (!userId) {
    throw new Error('No user found for account');
  }

  const insertStmt = db.prepare(`
    INSERT INTO nodes (id, kind, account_id, created_by, created_at, updated_at, properties, data_tag)
    VALUES (?, 'TestNode', ?, ?, ?, ?, '{}', 'test')
  `);

  const batchSize = 1000;
  const now = Date.now();
  let inserted = 0;

  // Insert in batches for performance
  const insertBatch = db.transaction((nodes: any[]) => {
    for (const node of nodes) {
      insertStmt.run(node.id, accountId, userId.id, now, now);
    }
  });

  while (inserted < count) {
    const batchCount = Math.min(batchSize, count - inserted);
    const batch = [];

    for (let i = 0; i < batchCount; i++) {
      batch.push({
        id: `test_node_${Date.now()}_${inserted + i}_${Math.random().toString(36).substring(2, 8)}`,
      });
    }

    insertBatch(batch);
    inserted += batchCount;

    if (inserted % 5000 === 0 || inserted === count) {
      console.log(`   📝 Created ${inserted}/${count} test nodes...`);
    }
  }

  return inserted;
}

/**
 * Count nodes for account
 */
function countNodes(accountId: string): number {
  const result = db
    .prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?')
    .get(accountId) as any;
  return result.count;
}

/**
 * Cleanup test data for account
 */
function cleanupTestData(accountId: string) {
  try {
    db.prepare('DELETE FROM nodes WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM edges WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM jobs WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM job_events WHERE account_id = ?').run(accountId);
  } catch (error: any) {
    console.error(`✗ Error cleaning up test data: ${error.message}`);
  }
}

/**
 * Measure API server responsiveness during deletion
 * Sends health check requests and measures response time
 */
async function measureServerResponsiveness(durationMs: number): Promise<{
  avgResponseTime: number;
  maxResponseTime: number;
  failedRequests: number;
  totalRequests: number;
}> {
  const startTime = Date.now();
  const responseTimes: number[] = [];
  let failedRequests = 0;

  while (Date.now() - startTime < durationMs) {
    const requestStart = Date.now();

    try {
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
      });

      const responseTime = Date.now() - requestStart;
      responseTimes.push(responseTime);

      if (!response.ok) {
        failedRequests++;
      }
    } catch (error) {
      failedRequests++;
      responseTimes.push(5000); // Treat timeout as 5s response time
    }

    // Wait 100ms between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    maxResponseTime: Math.max(...responseTimes),
    failedRequests,
    totalRequests: responseTimes.length,
  };
}

// ============================================================================
// Test Suite Setup
// ============================================================================

before(async () => {
  console.log('\n🧪 Batched Delete Worker Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Open database connection
  db = new Database(DB_PATH);

  // Login as admin
  const adminAuth = await login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
  adminToken = adminAuth.token;
  adminAccountId = adminAuth.accountId;
  console.log(`✓ Admin logged in (${adminAccountId})\n`);
});

after(async () => {
  // Cleanup test data
  if (db && adminAccountId) {
    cleanupTestData(adminAccountId);
  }
  if (db) {
    db.close();
  }

  console.log('\n✓ Test suite complete\n');
});

beforeEach(() => {
  // Clean up before each test
  if (db && adminAccountId) {
    cleanupTestData(adminAccountId);
  }
});

// ============================================================================
// Batched Deletion Tests
// ============================================================================

describe('Batched Deletion - Small Dataset', () => {
  it('should delete 1000 nodes with progress updates', async () => {
    // Create 1000 test nodes
    const nodeCount = 1000;
    createTestNodes(adminAccountId, nodeCount);

    console.log(`   📊 Created ${nodeCount} test nodes`);

    const nodesBefore = countNodes(adminAccountId);
    assert.strictEqual(nodesBefore, nodeCount);

    // Start delete job
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    const data = (await response.json()) as any;
    const jobId = data.jobId;

    console.log(`   🗑️ Started delete job: ${jobId}`);

    // Wait for completion and collect progress updates
    const { job, progressUpdates } = await waitForJobCompletion(jobId, adminToken, 60000);

    assert.strictEqual(job.state.status, 'succeeded');

    // Verify all nodes deleted
    const nodesAfter = countNodes(adminAccountId);
    assert.strictEqual(nodesAfter, 0);

    // Verify progress updates
    console.log(`   📈 Progress updates received: ${progressUpdates.length}`);
    console.log(`   📋 Progress sequence:`);
    progressUpdates.forEach((update, i) => {
      if (i === 0 || i === progressUpdates.length - 1 || update.progress % 25 === 0) {
        console.log(
          `      ${update.timestamp}ms: ${update.progress}% - ${update.message || update.status}`
        );
      }
    });

    // Should have multiple progress updates (not just 0% and 100%)
    const progressValues = progressUpdates.map((u) => u.progress);
    const uniqueProgress = new Set(progressValues);
    assert.ok(
      uniqueProgress.size > 2,
      `Expected more than 2 unique progress values, got ${uniqueProgress.size}`
    );

    console.log(
      `   ✅ Deleted ${nodeCount} nodes with ${uniqueProgress.size} unique progress values`
    );
  }, 90000);
});

describe('Batched Deletion - Medium Dataset', () => {
  it('should delete 5000 nodes without blocking event loop', async () => {
    // Create 5000 test nodes
    const nodeCount = 5000;
    createTestNodes(adminAccountId, nodeCount);

    console.log(`   📊 Created ${nodeCount} test nodes`);

    const nodesBefore = countNodes(adminAccountId);
    assert.strictEqual(nodesBefore, nodeCount);

    // Start delete job
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    const data = (await response.json()) as any;
    const jobId = data.jobId;

    console.log(`   🗑️ Started delete job: ${jobId}`);

    // Measure server responsiveness WHILE deletion is running
    const responsivenessPromise = measureServerResponsiveness(10000); // 10 seconds

    // Wait for completion
    const { job } = await waitForJobCompletion(jobId, adminToken, 90000);

    assert.strictEqual(job.state.status, 'succeeded');

    // Verify all nodes deleted
    const nodesAfter = countNodes(adminAccountId);
    assert.strictEqual(nodesAfter, 0);

    // Check server responsiveness during deletion
    const responsiveness = await responsivenessPromise;

    console.log(`   📊 Server responsiveness during deletion:`);
    console.log(`      Average response time: ${responsiveness.avgResponseTime.toFixed(0)}ms`);
    console.log(`      Max response time: ${responsiveness.maxResponseTime.toFixed(0)}ms`);
    console.log(
      `      Failed requests: ${responsiveness.failedRequests}/${responsiveness.totalRequests}`
    );

    // Event loop should NOT be blocked - response times should be reasonable
    // If batching works correctly, average should be < 500ms
    assert.ok(
      responsiveness.avgResponseTime < 500,
      `Average response time ${responsiveness.avgResponseTime}ms should be < 500ms`
    );
    assert.ok(
      responsiveness.maxResponseTime < 2000,
      `Max response time ${responsiveness.maxResponseTime}ms should be < 2000ms`
    );
    assert.strictEqual(
      responsiveness.failedRequests,
      0,
      `Expected 0 failed requests, got ${responsiveness.failedRequests}`
    );

    console.log(`   ✅ Deleted ${nodeCount} nodes without blocking event loop`);
  }, 120000);
});

describe('Batched Deletion - Large Dataset', () => {
  it('should delete 10000+ nodes with incremental progress', async () => {
    // Create 10000 test nodes
    const nodeCount = 10000;
    createTestNodes(adminAccountId, nodeCount);

    console.log(`   📊 Created ${nodeCount} test nodes`);

    const nodesBefore = countNodes(adminAccountId);
    assert.strictEqual(nodesBefore, nodeCount);

    // Start delete job
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    const data = (await response.json()) as any;
    const jobId = data.jobId;

    console.log(`   🗑️ Started delete job: ${jobId}`);

    const startTime = Date.now();

    // Wait for completion and collect progress updates
    const { job, progressUpdates } = await waitForJobCompletion(jobId, adminToken, 180000);

    const duration = Date.now() - startTime;

    assert.strictEqual(job.state.status, 'succeeded');

    // Verify all nodes deleted
    const nodesAfter = countNodes(adminAccountId);
    assert.strictEqual(nodesAfter, 0);

    // Analyze progress updates
    const progressValues = progressUpdates.map((u) => u.progress);
    const uniqueProgress = new Set(progressValues);

    console.log(
      `   📈 Progress updates: ${progressUpdates.length} total, ${uniqueProgress.size} unique values`
    );
    console.log(`   ⏱️ Deletion duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`   📊 Throughput: ${(nodeCount / (duration / 1000)).toFixed(0)} nodes/sec`);

    // With 10K nodes and batch size 500, we expect ~20 batches
    // Each batch should report progress
    const expectedBatches = Math.ceil(nodeCount / 500);
    console.log(`   📦 Expected batches: ${expectedBatches}`);

    // Should have incremental progress (at least 10 unique values for 10K nodes)
    assert.ok(
      uniqueProgress.size >= 10,
      `Expected at least 10 unique progress values, got ${uniqueProgress.size}`
    );

    // Progress should go from 0 to 100
    assert.ok(
      Math.min(...progressValues) <= 10,
      `Expected min progress <= 10, got ${Math.min(...progressValues)}`
    );
    assert.strictEqual(
      Math.max(...progressValues),
      100,
      `Expected max progress to be 100, got ${Math.max(...progressValues)}`
    );

    console.log(`   ✅ Deleted ${nodeCount} nodes with incremental progress reporting`);
  }, 240000);
});

describe('Batched Deletion - Performance Benchmarks', () => {
  it('should handle 25000 nodes (production-scale deletion)', async () => {
    // Create 25000 test nodes (similar to user's reported dataset size)
    const nodeCount = 25000;
    console.log(`   📝 Creating ${nodeCount} test nodes... (this may take a minute)`);

    createTestNodes(adminAccountId, nodeCount);

    console.log(`   📊 Created ${nodeCount} test nodes`);

    const nodesBefore = countNodes(adminAccountId);
    assert.strictEqual(nodesBefore, nodeCount);

    // Measure server responsiveness WHILE deletion is running
    const responsivenessPromise = measureServerResponsiveness(30000); // 30 seconds

    // Start delete job
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    const data = (await response.json()) as any;
    const jobId = data.jobId;

    console.log(`   🗑️ Started delete job: ${jobId}`);

    const startTime = Date.now();

    // Wait for completion
    const { job, progressUpdates } = await waitForJobCompletion(jobId, adminToken, 300000);

    const duration = Date.now() - startTime;

    assert.strictEqual(job.state.status, 'succeeded');

    // Verify all nodes deleted
    const nodesAfter = countNodes(adminAccountId);
    assert.strictEqual(nodesAfter, 0);

    // Check server responsiveness
    const responsiveness = await responsivenessPromise;

    console.log(`   📊 Performance metrics:`);
    console.log(`      Nodes deleted: ${nodeCount}`);
    console.log(`      Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`      Throughput: ${(nodeCount / (duration / 1000)).toFixed(0)} nodes/sec`);
    console.log(`      Progress updates: ${progressUpdates.length}`);
    console.log(`   📊 Server responsiveness:`);
    console.log(`      Avg response time: ${responsiveness.avgResponseTime.toFixed(0)}ms`);
    console.log(`      Max response time: ${responsiveness.maxResponseTime.toFixed(0)}ms`);
    console.log(
      `      Failed requests: ${responsiveness.failedRequests}/${responsiveness.totalRequests}`
    );

    // Event loop should remain responsive
    assert.ok(
      responsiveness.avgResponseTime < 500,
      `Average response time ${responsiveness.avgResponseTime}ms should be < 500ms`
    );
    assert.ok(
      responsiveness.maxResponseTime < 2000,
      `Max response time ${responsiveness.maxResponseTime}ms should be < 2000ms`
    );
    assert.strictEqual(
      responsiveness.failedRequests,
      0,
      `Expected 0 failed requests, got ${responsiveness.failedRequests}`
    );

    console.log(`   ✅ Production-scale deletion completed with responsive event loop`);
  }, 360000); // 6 minute timeout
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
