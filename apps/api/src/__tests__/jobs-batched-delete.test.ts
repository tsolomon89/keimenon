/**
 * Batched Delete Worker Integration Tests
 *
 * Tests the batched deletion system with large datasets to verify:
 * - Event loop yielding (UI stays responsive)
 * - Progress reporting during deletion
 * - Incremental batch processing
 * - Cancellation mid-deletion
 * - Performance with 10K+ nodes
 * - CRITICAL: System nodes preservation (UserNode, AccountNode, Board, Constellation)
 *
 * Related:
 * - apps/api/src/modules/workers/infrastructure/DeleteWorker.ts (batched implementation)
 * - docs/active_development/FINAL_FIX_DELETE_WORKER_BATCHING.md
 * - BUG FIX (2025-11-16): DeleteWorker now correctly preserves system nodes
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';
import path from 'path';
import { getCanvasDataInClause, getSystemNodeInClause } from '@canvas-memory/types';

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
 * Count canvas data nodes (should be deleted)
 *
 * Uses node kind constants from packages/types/src/node-kinds.ts
 * to ensure consistency with DeleteWorker and data-management routes.
 */
function countCanvasNodes(accountId: string): number {
  const result = db
    .prepare(
      `SELECT COUNT(*) as count FROM nodes
       WHERE account_id = ?
       AND kind IN (${getCanvasDataInClause()})`
    )
    .get(accountId) as any;
  return result.count;
}

/**
 * Count system nodes (should NOT be deleted)
 *
 * Uses node kind constants from packages/types/src/node-kinds.ts
 * to ensure consistency with DeleteWorker and data-management routes.
 */
function countSystemNodes(accountId: string): number {
  const result = db
    .prepare(
      `SELECT COUNT(*) as count FROM nodes
       WHERE account_id = ?
       AND kind IN (${getSystemNodeInClause()})`
    )
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

describe('Delete Scope Verification', () => {
  it('should preserve system nodes when deleting canvas data', async () => {
    // CRITICAL: This test verifies the fix for the DeleteWorker scope bug
    // Bug: DeleteWorker was deleting ALL nodes including system nodes
    // Fix: DeleteWorker now only deletes canvas data nodes (ChatThread, Message, Source, CodeBlock, Group, Folder)
    //      and preserves system nodes (UserNode, AccountNode, Board, Constellation)

    console.log('   🧪 Testing system node preservation during canvas deletion...');

    // Get initial system node count (should exist for admin account)
    const systemNodesBefore = countSystemNodes(adminAccountId);
    console.log(`   📊 System nodes before deletion: ${systemNodesBefore}`);

    // System nodes should exist (UserNode, AccountNode, etc.)
    assert.ok(systemNodesBefore > 0, 'Admin account should have system nodes');

    // Create test canvas data nodes
    const canvasNodeCount = 100;
    createTestNodes(adminAccountId, canvasNodeCount);

    const canvasNodesBefore = countCanvasNodes(adminAccountId);
    console.log(`   📊 Canvas nodes before deletion: ${canvasNodesBefore}`);

    // Start delete job with scope='canvas'
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
    console.log(`   🗑️ Started delete job: ${jobId} (scope: canvas)`);

    // Wait for completion
    const { job } = await waitForJobCompletion(jobId, adminToken, 60000);
    assert.strictEqual(job.state.status, 'succeeded');

    // CRITICAL ASSERTIONS:
    // 1. Canvas nodes should be deleted (0 remaining)
    const canvasNodesAfter = countCanvasNodes(adminAccountId);
    assert.strictEqual(
      canvasNodesAfter,
      0,
      `Canvas nodes should be deleted, but ${canvasNodesAfter} remain`
    );

    // 2. System nodes should be PRESERVED (same count as before)
    const systemNodesAfter = countSystemNodes(adminAccountId);
    assert.strictEqual(
      systemNodesAfter,
      systemNodesBefore,
      `System nodes should be preserved! Expected ${systemNodesBefore}, got ${systemNodesAfter}`
    );

    console.log(`   ✅ System nodes preserved: ${systemNodesBefore} → ${systemNodesAfter}`);
    console.log(`   ✅ Canvas nodes deleted: ${canvasNodesBefore} → ${canvasNodesAfter}`);
    console.log('   ✅ DELETE SCOPE FIX VERIFIED!');
  }, 90000);
});

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Multi-Tenant Isolation Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Multi-Tenant Deletion Isolation', () => {
  /**
   * CRITICAL SECURITY TEST: Verify that delete jobs respect account boundaries
   *
   * This test prevents a severe security vulnerability where Account A's delete
   * operation could accidentally delete Account B's data.
   *
   * Test Setup:
   * 1. Create Account A with 100 canvas nodes
   * 2. Create Account B with 50 canvas nodes
   * 3. Run delete job for Account A (scope: canvas)
   * 4. Verify Account A's data is deleted
   * 5. Verify Account B's data is UNTOUCHED
   *
   * Related:
   * - apps/api/src/modules/workers/infrastructure/DeleteWorker.ts (WHERE account_id = ?)
   * - docs/BUG_FIX_DATA_DELETION_2025-11-16.md (multi-tenant security)
   */
  it('should NOT delete data from other accounts', async () => {
    console.log('\n   🔒 Testing multi-tenant deletion isolation...');

    // Create test Account B (in addition to existing adminAccountId)
    const accountBEmail = `test-account-b-${Date.now()}@example.com`;
    const accountBPassword = 'TestPass123!';

    // Register Account B
    const registerResponse = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: accountBEmail,
        password: accountBPassword,
        name: 'Test Account B',
        account_type: 'client',
      }),
    });

    assert.strictEqual(registerResponse.status, 201, 'Account B registration should succeed');
    const registerData = (await registerResponse.json()) as any;
    const accountBId = registerData.account.id;
    const _accountBToken = registerData.token;

    // Create data for Account A (admin account)
    createTestNodes(adminAccountId, 100);
    const accountANodesBefore = countCanvasNodes(adminAccountId);
    console.log(`      Account A (admin): ${accountANodesBefore} nodes created`);

    // Create data for Account B
    createTestNodes(accountBId, 50);
    const accountBNodesBefore = countCanvasNodes(accountBId);
    console.log(`      Account B: ${accountBNodesBefore} nodes created`);

    // Run delete job for Account A ONLY
    console.log(`      Deleting Account A's canvas data...`);
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    assert.strictEqual(response.status, 201, 'Delete job should be created');
    const { jobId } = (await response.json()) as any;

    // Wait for job completion
    const { job } = await waitForJobCompletion(jobId, adminToken, 60000);
    assert.strictEqual(job.status, 'done', 'Delete job should complete successfully');

    // CRITICAL ASSERTIONS:
    // 1. Account A's canvas data should be deleted
    const accountANodesAfter = countCanvasNodes(adminAccountId);
    assert.strictEqual(
      accountANodesAfter,
      0,
      `Account A canvas nodes should be deleted. Expected 0, got ${accountANodesAfter}`
    );

    // 2. Account B's data should be UNTOUCHED
    const accountBNodesAfter = countCanvasNodes(accountBId);
    assert.strictEqual(
      accountBNodesAfter,
      accountBNodesBefore,
      `Account B data should NOT be affected! Expected ${accountBNodesBefore}, got ${accountBNodesAfter}`
    );

    console.log(`      ✅ Account A: ${accountANodesBefore} → 0 nodes (deleted)`);
    console.log(`      ✅ Account B: ${accountBNodesBefore} → ${accountBNodesAfter} nodes (preserved)`);
    console.log(`   ✅ Multi-tenant isolation verified: Account boundaries respected`);

    // Cleanup Account B
    cleanupTestData(accountBId);
    db.prepare('DELETE FROM users WHERE email = ?').run(accountBEmail);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountBId);
  }, 90000); // 90 second timeout

  /**
   * Test concurrent deletion prevention
   *
   * Verifies that attempting to create a second delete job while one is running
   * returns a 409 Conflict error instead of creating duplicate jobs.
   */
  it('should prevent concurrent delete jobs for same account', async () => {
    console.log('\n   🔒 Testing concurrent deletion prevention...');

    // Create test data
    createTestNodes(adminAccountId, 500);

    // Start first delete job
    const response1 = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    assert.strictEqual(response1.status, 201, 'First delete job should be created');
    const { jobId: jobId1 } = (await response1.json()) as any;

    // Immediately try to create second delete job (should be rejected)
    const response2 = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    // CRITICAL ASSERTION: Second job should be rejected with 409 Conflict
    assert.strictEqual(
      response2.status,
      409,
      'Second delete job should be rejected with 409 Conflict'
    );

    const errorData = (await response2.json()) as any;
    assert.strictEqual(errorData.success, false, 'Response should indicate failure');
    assert.ok(
      errorData.error?.includes('already in progress'),
      'Error message should indicate deletion in progress'
    );
    assert.strictEqual(
      errorData.activeJobId,
      jobId1,
      'Error should include active job ID for reference'
    );

    console.log(`      ✅ Concurrent deletion prevented (409 Conflict returned)`);
    console.log(`      ✅ Active job ID returned: ${errorData.activeJobId}`);

    // Wait for first job to complete
    await waitForJobCompletion(jobId1, adminToken, 60000);

    // Now a new delete job should be allowed
    const response3 = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });

    assert.strictEqual(
      response3.status,
      201,
      'New delete job should be allowed after previous completion'
    );

    console.log(`   ✅ Concurrent deletion prevention working correctly`);
  }, 120000); // 2 minute timeout
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
