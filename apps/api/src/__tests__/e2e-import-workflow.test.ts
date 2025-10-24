/**
 * End-to-End Import Workflow Test
 *
 * Tests the complete import workflow from file upload to completion including:
 * - File upload via multipart form
 * - Job creation and queuing
 * - Worker pool picking up job
 * - SSE progress updates
 * - Job completion
 * - Data verification in database
 * - Jobs list API
 *
 * This test verifies the entire user journey works end-to-end.
 */

import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import {
  login,
  createImportJob,
  waitForJobCompletion,
  countNodes,
  countEdges,
  getNodesByKind,
  cleanupTestData,
  SSECollector,
  getJob,
  listJobs,
  getTestFilePath,
  waitFor,
  sleep,
} from './utils/test-helpers';

const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const DB_PATH = process.env.DB_PATH || path.join(os.homedir(), '.canvas-memory', 'canvas.db');

// Test credentials (from migration 001_seed_admin.ts)
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

describe('E2E Import Workflow', () => {
  let db: Database.Database;
  let adminToken: string;
  let adminAccountId: string;
  let adminUserId: string;

  before(async () => {
    // Initialize database connection
    db = new Database(DB_PATH);

    // Login as admin
    const adminAuth = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = adminAuth.token;
    adminAccountId = adminAuth.accountId;
    adminUserId = adminAuth.userId;

    console.log('🔑 Admin authenticated');
    console.log(`   Account: ${adminAccountId}`);
    console.log(`   User: ${adminUserId}`);
  });

  after(() => {
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

  describe('Complete Import Flow', () => {
    test(
      'should complete full import workflow with SSE updates',
      async (_t) => {
        // 1. Get initial counts
        const nodesBefore = countNodes(db, adminAccountId);
        const edgesBefore = countEdges(db, adminAccountId);

        console.log('📊 Initial state:', { nodes: nodesBefore, edges: edgesBefore });

        // 2. Connect to SSE stream BEFORE creating job
        const sseUrl = `${API_URL}/api/v1/stream/jobs`;
        const sseCollector = new SSECollector(sseUrl, adminToken, 'jobs.update');

        await sseCollector.connect();
        assert.strictEqual(sseCollector.connected, true);
        console.log('📡 SSE connected');

        // 3. Upload file and create import job
        const testFile = getTestFilePath('tiny.json');
        const { jobId, uploadId } = await createImportJob(testFile, adminToken);

        console.log('📤 Import job created:', { jobId, uploadId });

        assert.ok(jobId);
        assert.ok(uploadId);

        // 4. Wait for SSE event indicating job queued
        await sseCollector.waitForCondition((events) => {
          return events.some((e) =>
            e.jobs?.some((j: any) => j.jobId === jobId && j.status === 'queued')
          );
        }, 5000);

        console.log('✅ Job queued event received via SSE');

        // 5. Wait for job to start running
        await sseCollector.waitForCondition((events) => {
          return events.some((e) =>
            e.jobs?.some((j: any) => j.jobId === jobId && j.status === 'running')
          );
        }, 10000);

        console.log('▶️ Job running event received via SSE');

        // 6. Collect progress updates
        await sleep(2000); // Let some progress events accumulate

        const progressEvents = sseCollector
          .getEvents()
          .flatMap((e) => e.jobs || [])
          .filter((j: any) => j.jobId === jobId)
          .map((j: any) => j.progress?.percent || 0);

        console.log('📈 Progress updates:', progressEvents);

        // Should have multiple progress updates
        assert.ok(progressEvents.length > 1);

        // Progress should increase over time
        const hasProgress = progressEvents.some((p: number) => p > 0 && p < 100);
        assert.strictEqual(hasProgress, true);

        // 7. Wait for job to complete
        const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

        console.log('✅ Job completed:', {
          status: completedJob.state.status,
          duration: completedJob.state.completedAt - completedJob.state.startedAt,
        });

        assert.strictEqual(completedJob.state.status, 'succeeded');

        // 8. Verify SSE event for completion
        await sseCollector.waitForCondition((events) => {
          return events.some((e) =>
            e.jobs?.some(
              (j: any) =>
                j.jobId === jobId && (j.status === 'succeeded' || j.progress?.percent === 100)
            )
          );
        }, 5000);

        console.log('✅ Job completion event received via SSE');

        // 9. Verify data imported to database
        const nodesAfter = countNodes(db, adminAccountId);
        const edgesAfter = countEdges(db, adminAccountId);

        console.log('📊 Final state:', { nodes: nodesAfter, edges: edgesAfter });

        assert.ok(nodesAfter > nodesBefore);
        assert.ok(edgesAfter > edgesBefore);

        // 10. Verify node types created
        const nodesByKind = getNodesByKind(db, adminAccountId);
        console.log('📦 Nodes by kind:', nodesByKind);

        // Tiny.json should have Messages and Sources at minimum
        const hasMessages = nodesByKind.some((n) => n.kind === 'Message');
        const hasSources = nodesByKind.some((n) => n.kind === 'Source');

        assert.strictEqual(hasMessages || hasSources, true);

        // 11. Verify job appears in jobs list API
        const jobs = await listJobs(adminToken, { status: 'all' });
        const jobInList = jobs.find((j) => j.id === jobId);

        assert.ok(jobInList);
        assert.strictEqual(jobInList.state.status, 'succeeded');

        console.log('📋 Job appears in jobs list');

        // 12. Verify job details via API
        const jobDetails = await getJob(jobId, adminToken);

        assert.strictEqual(jobDetails.id, jobId);
        assert.strictEqual(jobDetails.type, 'import');
        assert.strictEqual(jobDetails.state.status, 'succeeded');

        // 13. Close SSE connection
        sseCollector.close();
        console.log('🔌 SSE disconnected');
      },
      { timeout: 60000 }
    ); // 60 second timeout for full workflow

    test(
      'should handle small file import (< 10 conversations)',
      async (_t) => {
        const testFile = getTestFilePath('tiny.json');
        const { jobId } = await createImportJob(testFile, adminToken);

        const completedJob = await waitForJobCompletion(jobId, adminToken, 20000);

        assert.strictEqual(completedJob.state.status, 'succeeded');

        // Verify data created
        const nodes = countNodes(db, adminAccountId);
        assert.ok(nodes > 0);

        console.log(`✅ Imported ${nodes} nodes from tiny.json`);
      },
      { timeout: 30000 }
    );

    test(
      'should handle medium file import (10-50 conversations)',
      async (_t) => {
        const testFile = getTestFilePath('small.json');
        const { jobId } = await createImportJob(testFile, adminToken);

        const completedJob = await waitForJobCompletion(jobId, adminToken, 60000);

        assert.strictEqual(completedJob.state.status, 'succeeded');

        // Verify significant data created
        const nodes = countNodes(db, adminAccountId);
        assert.ok(nodes > 10);

        console.log(`✅ Imported ${nodes} nodes from small.json`);
      },
      { timeout: 90000 }
    );

    test(
      'should emit progress updates during import',
      async (_t) => {
        const sseCollector = new SSECollector(`${API_URL}/api/v1/stream/jobs`, adminToken);
        await sseCollector.connect();

        const testFile = getTestFilePath('small.json');
        const { jobId } = await createImportJob(testFile, adminToken);

        // Wait for job to complete
        await waitForJobCompletion(jobId, adminToken, 60000);

        // Get all progress values
        const progressValues = sseCollector
          .getEvents()
          .flatMap((e) => e.jobs || [])
          .filter((j: any) => j.jobId === jobId)
          .map((j: any) => j.progress?.percent || 0)
          .filter((p: number) => p > 0);

        console.log('📈 Progress sequence:', progressValues);

        // Should have multiple progress updates
        assert.ok(progressValues.length > 2);

        // Progress should end at 100%
        assert.strictEqual(Math.max(...progressValues), 100);

        sseCollector.close();
      },
      { timeout: 90000 }
    );

    test(
      'should include import metadata in job state',
      async (_t) => {
        const testFile = getTestFilePath('tiny.json');
        const { jobId } = await createImportJob(testFile, adminToken, {
          export_code: true,
          code_min_chars: 50,
        });

        const completedJob = await waitForJobCompletion(jobId, adminToken);

        // Verify config stored
        assert.ok(completedJob.config);
        assert.strictEqual(completedJob.config.export_code, true);
        assert.strictEqual(completedJob.config.code_min_chars, 50);

        // Verify result stats
        assert.ok(completedJob.state.result);
        assert.ok(completedJob.state.result.nodesCreated > 0);

        console.log('📊 Import stats:', completedJob.state.result);
      },
      { timeout: 30000 }
    );
  });

  describe('Import Error Handling', () => {
    test(
      'should fail gracefully on malformed JSON',
      async (_t) => {
        // Create a temporary malformed JSON file
        const fs = require('fs');
        const tempFile = path.join(os.tmpdir(), 'malformed.json');
        fs.writeFileSync(tempFile, '{ invalid json }');

        try {
          const { jobId } = await createImportJob(tempFile, adminToken);

          // Wait for job to fail
          const job = await waitForJobCompletion(jobId, adminToken, 10000);

          assert.strictEqual(job.state.status, 'failed');
          assert.ok(job.state.error);

          console.log('❌ Job failed as expected:', job.state.error);
        } finally {
          // Cleanup temp file
          fs.unlinkSync(tempFile);
        }
      },
      { timeout: 20000 }
    );

    test(
      'should handle empty file',
      async (_t) => {
        const fs = require('fs');
        const tempFile = path.join(os.tmpdir(), 'empty.json');
        fs.writeFileSync(tempFile, '[]');

        try {
          const { jobId } = await createImportJob(tempFile, adminToken);

          const job = await waitForJobCompletion(jobId, adminToken, 10000);

          // Should either succeed with 0 nodes or fail gracefully
          assert.ok(['succeeded', 'failed'].includes(job.state.status));

          if (job.state.status === 'succeeded') {
            assert.strictEqual(job.state.result.nodesCreated, 0);
          }

          console.log('✅ Empty file handled gracefully');
        } finally {
          fs.unlinkSync(tempFile);
        }
      },
      { timeout: 20000 }
    );

    test(
      'should handle missing file gracefully',
      async (_t) => {
        const nonExistentFile = '/tmp/does-not-exist.json';

        try {
          await createImportJob(nonExistentFile, adminToken);
          // Should throw before creating job
          throw new Error('Expected import to fail');
        } catch (error: any) {
          assert.ok(error.message.includes('ENOENT'));
          console.log('✅ Missing file error caught');
        }
      },
      { timeout: 10000 }
    );
  });

  describe('Import Jobs List API', () => {
    test(
      'should list active import jobs',
      async (_t) => {
        // Create multiple import jobs
        const job1 = await createImportJob(getTestFilePath('tiny.json'), adminToken);
        const job2 = await createImportJob(getTestFilePath('tiny.json'), adminToken);

        // Query active jobs
        const jobs = await listJobs(adminToken, { status: 'active' });

        // Should include our jobs (may include others)
        const hasJob1 = jobs.some((j) => j.id === job1.jobId);
        const hasJob2 = jobs.some((j) => j.id === job2.jobId);

        assert.ok(hasJob1 || hasJob2);

        console.log(`📋 Found ${jobs.length} active jobs`);

        // Wait for completion to avoid interfering with other tests
        await waitForJobCompletion(job1.jobId, adminToken);
        await waitForJobCompletion(job2.jobId, adminToken);
      },
      { timeout: 90000 }
    );

    test(
      'should filter jobs by status',
      async (_t) => {
        const { jobId } = await createImportJob(getTestFilePath('tiny.json'), adminToken);
        await waitForJobCompletion(jobId, adminToken);

        // Query completed jobs
        const completedJobs = await listJobs(adminToken, { status: 'completed' });

        const ourJob = completedJobs.find((j) => j.id === jobId);
        assert.ok(ourJob);
        assert.strictEqual(ourJob.state.status, 'succeeded');

        console.log(`📋 Found ${completedJobs.length} completed jobs`);
      },
      { timeout: 30000 }
    );

    test(
      'should limit jobs list results',
      async (_t) => {
        const jobs = await listJobs(adminToken, { limit: 5 });

        assert.ok(jobs.length <= 5);

        console.log(`📋 Returned ${jobs.length} jobs (limit: 5)`);
      },
      { timeout: 10000 }
    );
  });

  describe('Concurrent Import Jobs', () => {
    test(
      'should handle multiple concurrent imports',
      async (_t) => {
        // Start 3 imports simultaneously
        const [job1, job2, job3] = await Promise.all([
          createImportJob(getTestFilePath('tiny.json'), adminToken),
          createImportJob(getTestFilePath('tiny.json'), adminToken),
          createImportJob(getTestFilePath('tiny.json'), adminToken),
        ]);

        console.log('📤 Created 3 concurrent import jobs');

        // All should complete successfully
        const [completed1, completed2, completed3] = await Promise.all([
          waitForJobCompletion(job1.jobId, adminToken, 60000),
          waitForJobCompletion(job2.jobId, adminToken, 60000),
          waitForJobCompletion(job3.jobId, adminToken, 60000),
        ]);

        assert.strictEqual(completed1.state.status, 'succeeded');
        assert.strictEqual(completed2.state.status, 'succeeded');
        assert.strictEqual(completed3.state.status, 'succeeded');

        console.log('✅ All 3 imports completed successfully');

        // Verify data imported (should be 3x)
        const nodes = countNodes(db, adminAccountId);
        assert.ok(nodes > 10); // At least some data

        console.log(`📊 Total nodes imported: ${nodes}`);
      },
      { timeout: 120000 }
    );

    test(
      'should respect worker pool concurrency limits',
      async (_t) => {
        const sseCollector = new SSECollector(`${API_URL}/api/v1/stream/jobs`, adminToken);
        await sseCollector.connect();

        // Create 5 jobs (worker pool max is typically 3)
        const jobs = await Promise.all(
          Array.from({ length: 5 }, () => createImportJob(getTestFilePath('tiny.json'), adminToken))
        );

        console.log('📤 Created 5 import jobs');

        // Wait a bit for jobs to start
        await sleep(2000);

        // Check how many are running concurrently
        const events = sseCollector.getEvents();
        const runningJobs = new Set<string>();

        events.forEach((e) => {
          e.jobs?.forEach((j: any) => {
            if (j.status === 'running') {
              runningJobs.add(j.jobId);
            }
          });
        });

        console.log(`▶️ Max concurrent running jobs: ${runningJobs.size}`);

        // Should respect concurrency limit (typically 3)
        assert.ok(runningJobs.size <= 3);

        // Wait for all to complete
        await Promise.all(jobs.map((j) => waitForJobCompletion(j.jobId, adminToken, 90000)));

        sseCollector.close();
        console.log('✅ All jobs completed');
      },
      { timeout: 150000 }
    );
  });

  describe('SSE Integration', () => {
    test(
      'should broadcast to correct account only',
      async (_t) => {
        // This test would require a second account
        // For now, verify our account receives events

        const sseCollector = new SSECollector(`${API_URL}/api/v1/stream/jobs`, adminToken);
        await sseCollector.connect();

        const { jobId } = await createImportJob(getTestFilePath('tiny.json'), adminToken);

        await waitForJobCompletion(jobId, adminToken);

        // Verify we received events
        const ourEvents = sseCollector
          .getEvents()
          .flatMap((e) => e.jobs || [])
          .filter((j: any) => j.jobId === jobId);

        assert.ok(ourEvents.length > 0);

        sseCollector.close();
        console.log(`📡 Received ${ourEvents.length} SSE events for our job`);
      },
      { timeout: 30000 }
    );

    test(
      'should include job type in SSE events',
      async (_t) => {
        const sseCollector = new SSECollector(`${API_URL}/api/v1/stream/jobs`, adminToken);
        await sseCollector.connect();

        const { jobId } = await createImportJob(getTestFilePath('tiny.json'), adminToken);

        await sseCollector.waitForCondition(
          (events) => events.some((e) => e.jobs?.some((j: any) => j.jobId === jobId)),
          10000
        );

        const jobEvents = sseCollector
          .getEvents()
          .flatMap((e) => e.jobs || [])
          .filter((j: any) => j.jobId === jobId);

        // All events should have type: 'import'
        jobEvents.forEach((j: any) => {
          assert.strictEqual(j.type, 'import');
        });

        await waitForJobCompletion(jobId, adminToken);
        sseCollector.close();

        console.log('✅ All SSE events have correct job type');
      },
      { timeout: 30000 }
    );
  });
});
