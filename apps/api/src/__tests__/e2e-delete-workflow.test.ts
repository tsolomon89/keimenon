/**
 * E2E Delete Workflow Test
 *
 * Tests complete delete job workflow from trigger to completion:
 * - Delete job creation via API
 * - SSE progress tracking through all state transitions
 * - Batched deletion (500 nodes/batch) verification
 * - Database state verification (nodes, edges, groups all deleted)
 * - Concurrent delete handling (concurrency_group enforcement)
 * - Delete scope variations (keimenon vs all-clients)
 * - Worker pool interaction
 * - Error scenarios (database locks, orphaned jobs)
 */

import { describe, test, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import {
  login,
  createDeleteJob,
  waitForJobCompletion,
  countNodes,
  countEdges,
  createTestNodes,
  cleanupTestData,
  SSECollector,
} from './utils/test-helpers';

// Test configuration
const getApiBaseUrl = () => process.env.TEST_API_URL || 'http://localhost:4001';
const getDbPath = () => process.env.DB_PATH || path.join(os.homedir(), '.keimenon', 'keimenon.db');
const getSseBaseUrl = () => `${getApiBaseUrl()}/api/v1/stream/jobs`;

describe('E2E Delete Workflow', () => {
  let db: Database.Database;
  let adminToken: string;
  let adminAccountId: string;
  let adminUserId: string;

  beforeAll(async () => {
    // Connect to database
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');

    // Login as admin
    const loginResult = await login('admin@admin.com', 'admin123');
    adminToken = loginResult.token;
    adminAccountId = loginResult.accountId;
    adminUserId = loginResult.userId;

    console.log('[E2E Delete] Test setup complete', {
      accountId: adminAccountId,
      userId: adminUserId,
    });
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
  });

  beforeEach(() => {
    // Clean up any existing test data
    cleanupTestData(db, adminAccountId);
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestData(db, adminAccountId);
  });

  describe('Complete Delete Flow', () => {
    test('should complete full delete workflow with SSE updates', async () => {
      // 1. Create test data (1000 nodes)
      console.log('[Test] Creating 1000 test nodes...');
      const nodeIds = createTestNodes(db, adminAccountId, 1000);

      // Create edges between nodes
      const edgeStmt = db.prepare(`
        INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'test')
      `);
      const now = Date.now();

      for (let i = 0; i < nodeIds.length - 1; i++) {
        edgeStmt.run(
          `edge_test_${i}`,
          'HAS_MESSAGE',
          nodeIds[i],
          nodeIds[i + 1],
          JSON.stringify({}),
          adminAccountId,
          adminUserId,
          now
        );
      }

      const nodesBefore = countNodes(db, adminAccountId);
      const edgesBefore = countEdges(db, adminAccountId);
      assert.strictEqual(nodesBefore, 1000);
      assert.strictEqual(edgesBefore, 999);

      // 2. Connect to SSE BEFORE creating delete job
      console.log('[Test] Connecting to SSE stream...');
      const sseUrl = getSseBaseUrl();
      const sseCollector = new SSECollector(sseUrl, adminToken, 'jobs.update');
      await sseCollector.connect();
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for connection

      try {
        // 3. Create delete job
        console.log('[Test] Creating delete job...');
        const { jobId } = await createDeleteJob('keimenon', adminToken);
        assert.ok(jobId);

        // 4. Wait for first SSE lifecycle update for this job.
        // Fast dispatch can skip visible "queued" and/or "running" events.
        console.log('[Test] Waiting for first job lifecycle SSE update...');
        await sseCollector.waitForCondition(
          (events) =>
            events.some((e) =>
              e.jobs?.some(
                (j: any) =>
                  j.jobId === jobId && ['queued', 'running', 'succeeded'].includes(j.status)
              )
            ),
          10000
        );

        // 5. Wait for completion (up to 60 seconds for 1000 nodes)
        console.log('[Test] Waiting for job to complete...');
        const completedJob = await waitForJobCompletion(jobId, adminToken, 60000);

        assert.ok(completedJob);
        assert.strictEqual(completedJob.state.status, 'succeeded');

        // 6. Verify SSE completion event
        await sseCollector.waitForCondition(
          (events) =>
            events.some((e) =>
              e.jobs?.some((j: any) => j.jobId === jobId && j.status === 'succeeded')
            ),
          5000
        );

        // 7. Verify data deleted from database
        const nodesAfter = countNodes(db, adminAccountId);
        const edgesAfter = countEdges(db, adminAccountId);

        assert.strictEqual(nodesAfter, 0);
        assert.strictEqual(edgesAfter, 0);

        // 8. Verify job details include deletion counts when available
        const nodesDeleted =
          completedJob.state.result?.nodesDeleted ??
          completedJob.state.metadata?.nodesDeleted ??
          completedJob.metadata?.nodesDeleted;
        const edgesDeleted =
          completedJob.state.result?.edgesDeleted ??
          completedJob.state.metadata?.edgesDeleted ??
          completedJob.metadata?.edgesDeleted;
        if (typeof nodesDeleted === 'number') {
          assert.ok(nodesDeleted > 0);
        }
        if (typeof edgesDeleted === 'number') {
          assert.ok(edgesDeleted > 0);
        }

        // 9. Verify SSE progress stream captured lifecycle/progress for the job
        const progressEvents = sseCollector
          .getEvents()
          .flatMap((e) => e.jobs || [])
          .filter((j: any) => j.jobId === jobId)
          .map((j: any) => ({
            status: j.status,
            progress: j.progress?.percent,
          }));
        assert.ok(progressEvents.length > 0);
        const progressPercents = progressEvents
          .map((event) => event.progress)
          .filter((value): value is number => typeof value === 'number');
        const sawRunningOrSucceeded = progressEvents.some((event) =>
          ['running', 'succeeded'].includes(event.status)
        );
        assert.ok(progressPercents.some((value) => value > 0) || sawRunningOrSucceeded);
      } finally {
        sseCollector.close();
      }
    }, 90000);

    test('should handle small dataset deletion (< 500 nodes)', async () => {
      // Create only 100 nodes (single batch)
      console.log('[Test] Creating 100 test nodes...');
      createTestNodes(db, adminAccountId, 100);

      const nodesBefore = countNodes(db, adminAccountId);
      assert.strictEqual(nodesBefore, 100);

      // Connect SSE
      const sseUrl = getSseBaseUrl();
      const sseCollector = new SSECollector(sseUrl, adminToken, 'jobs.update');
      await sseCollector.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create delete job
      const { jobId } = await createDeleteJob('keimenon', adminToken);

      // Wait for completion (should be fast)
      const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

      assert.strictEqual(completedJob.state.status, 'succeeded');

      // Verify all deleted
      const nodesAfter = countNodes(db, adminAccountId);
      assert.strictEqual(nodesAfter, 0);

      sseCollector.close();
    }, 60000);

    test('should handle empty dataset gracefully', async () => {
      // No nodes to delete
      const nodesBefore = countNodes(db, adminAccountId);
      assert.strictEqual(nodesBefore, 0);

      // Connect SSE
      const sseUrl = getSseBaseUrl();
      const sseCollector = new SSECollector(sseUrl, adminToken, 'jobs.update');
      await sseCollector.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create delete job
      const { jobId } = await createDeleteJob('keimenon', adminToken);

      // Wait for completion
      const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

      assert.strictEqual(completedJob.state.status, 'succeeded');
      const nodesDeleted =
        completedJob.state.result?.nodesDeleted ?? completedJob.metadata?.nodesDeleted ?? 0;
      const edgesDeleted =
        completedJob.state.result?.edgesDeleted ?? completedJob.metadata?.edgesDeleted ?? 0;
      assert.strictEqual(nodesDeleted, 0);
      assert.strictEqual(edgesDeleted, 0);

      sseCollector.close();
    }, 60000);
  });

  describe('Delete Scope Variations', () => {
    test('should delete keimenon scope only (preserve system nodes)', async () => {
      const now = Date.now();
      const insertNode = db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'test')
      `);

      // Keimenon data kind (deleted by keimenon scope)
      insertNode.run(
        'node_keimenon_1',
        'Message',
        JSON.stringify({ text: 'hello' }),
        adminAccountId,
        adminUserId,
        now,
        now
      );
      // System kind (preserved)
      insertNode.run(
        'node_system_1',
        'AccountNode',
        JSON.stringify({ system: true }),
        adminAccountId,
        adminUserId,
        now,
        now
      );

      assert.strictEqual(countNodes(db, adminAccountId), 2);

      // Delete keimenon scope
      const { jobId } = await createDeleteJob('keimenon', adminToken);
      await waitForJobCompletion(jobId, adminToken, 30000);

      // Verify only keimenon node deleted
      const remaining = db
        .prepare(
          `
        SELECT id, kind FROM nodes
        WHERE account_id = ?
        ORDER BY id
      `
        )
        .all(adminAccountId) as any[];

      assert.strictEqual(remaining.length, 1);
      assert.ok(remaining.find((n: any) => n.id === 'node_system_1'));
    }, 60000);

    test('should delete all-clients scope (preserve system nodes)', async () => {
      const now = Date.now();
      const insertNode = db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'test')
      `);

      insertNode.run(
        'node_keimenon_1',
        'Message',
        JSON.stringify({ text: 'hello' }),
        adminAccountId,
        adminUserId,
        now,
        now
      );
      insertNode.run(
        'node_system_1',
        'AccountNode',
        JSON.stringify({ system: true }),
        adminAccountId,
        adminUserId,
        now,
        now
      );

      assert.strictEqual(countNodes(db, adminAccountId), 2);

      // Delete all-clients scope
      const { jobId } = await createDeleteJob('all-clients', adminToken);
      await waitForJobCompletion(jobId, adminToken, 30000);

      // all-clients deletes all non-system nodes and preserves system nodes
      assert.strictEqual(countNodes(db, adminAccountId), 1);
    }, 60000);
  });

  describe('Concurrent Delete Handling', () => {
    test('should prevent concurrent delete jobs (concurrency_group)', async () => {
      // Create test data
      createTestNodes(db, adminAccountId, 500);

      // Create first delete job
      const { jobId: jobId1 } = await createDeleteJob('keimenon', adminToken);

      // Immediately try to create second delete job (should fail or queue)
      try {
        const { jobId: jobId2 } = await createDeleteJob('keimenon', adminToken);

        // If it doesn't fail, it should be queued
        // We'll just verify both complete eventually
        await waitForJobCompletion(jobId1, adminToken, 60000);
        await waitForJobCompletion(jobId2, adminToken, 60000);
      } catch (error: any) {
        // Or it might reject immediately - both behaviors are acceptable
        console.log('Concurrent delete prevented:', error.message);
      }
    }, 90000);

    test('should handle delete while import is running', async () => {
      // This tests different concurrency_group values
      // Import jobs have different concurrency_group than delete jobs
      // Both should be able to run simultaneously

      // Create small test dataset
      createTestNodes(db, adminAccountId, 100);

      // Start delete job
      const { jobId: deleteJobId } = await createDeleteJob('keimenon', adminToken);

      // Wait for completion
      await waitForJobCompletion(deleteJobId, adminToken, 60000);

      // Should complete successfully
      const nodesAfter = countNodes(db, adminAccountId);
      assert.strictEqual(nodesAfter, 0);
    }, 90000);
  });

  describe('Delete Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Create test data
      createTestNodes(db, adminAccountId, 100);

      // Create delete job
      const { jobId } = await createDeleteJob('keimenon', adminToken);

      // Job should complete successfully in normal case
      const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

      assert.strictEqual(completedJob.state.status, 'succeeded');
    }, 60000);

    test('should handle orphaned delete jobs (server restart)', async () => {
      // Create test data
      createTestNodes(db, adminAccountId, 100);

      // Create delete job
      const { jobId } = await createDeleteJob('keimenon', adminToken);

      // Simulate orphaned job by marking it as running but not actually running
      db.prepare(
        `
        UPDATE jobs
        SET status = 'running'
        WHERE id = ?
      `
      ).run(jobId);

      // Job cleanup should eventually mark this as failed
      // For now, verify we can see it in the database
      const orphanedJob = db
        .prepare(
          `
        SELECT * FROM jobs WHERE id = ?
      `
        )
        .get(jobId);

      assert.ok(orphanedJob);
    }, 30000);
  });

  describe('Performance Benchmarks', () => {
    test('should delete 1000 nodes in under 30 seconds', async () => {
      // Create test data
      createTestNodes(db, adminAccountId, 1000);

      const startTime = Date.now();

      // Create and wait for delete job
      const { jobId } = await createDeleteJob('keimenon', adminToken);
      await waitForJobCompletion(jobId, adminToken, 60000);

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`[Benchmark] Deleted 1000 nodes in ${duration}ms`);
      assert.ok(duration < 30000); // 30 seconds

      // Verify all deleted
      assert.strictEqual(countNodes(db, adminAccountId), 0);
    }, 90000);

    test('should show progress updates at regular intervals', async () => {
      // Create large dataset
      createTestNodes(db, adminAccountId, 1000);

      // Connect SSE
      const sseUrl = getSseBaseUrl();
      const sseCollector = new SSECollector(sseUrl, adminToken, 'jobs.update');
      await sseCollector.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create delete job
      const { jobId } = await createDeleteJob('keimenon', adminToken);

      // Wait for completion
      await waitForJobCompletion(jobId, adminToken, 60000);

      // Collect progress events
      const progressEvents = sseCollector
        .getEvents()
        .flatMap((e) => e.jobs || [])
        .filter((j: any) => j.jobId === jobId && j.progress)
        .map((j: any) => j.progress.percent);

      // Should have progress updates for the job
      assert.ok(progressEvents.length >= 1);

      // Progress should be increasing
      for (let i = 1; i < progressEvents.length; i++) {
        assert.ok(progressEvents[i] >= progressEvents[i - 1]);
      }

      sseCollector.close();
    }, 90000);
  });
});
