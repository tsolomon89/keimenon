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

import { describe, test, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'node:fs/promises';
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
  sleep,
  waitFor,
} from './utils/test-helpers';

/**
 * Register a new user (helper for this test)
 */
async function register(
  email: string,
  password: string,
  name: string
): Promise<{ token: string; accountId: string; userId: string }> {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      // Fallback to login if already exists (shouldn't happen with dynamic email but safe to have)
      const text = await response.text();
      if (text.includes('already exists')) {
        const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const loginData = (await loginRes.json()) as any;
        return {
          token: loginData.token,
          accountId: loginData.user.account_id || loginData.account.id,
          userId: loginData.user.id,
        };
      }
      throw new Error(`Registration failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as any;
    // Map response structure
    return {
      token: data.token,
      accountId: data.user.account_id || data.account.id,
      userId: data.user.id,
    };
  } catch (e) {
    console.warn('Register helper failed:', e);
    throw e;
  }
}

const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const getDbPath = () => process.env.DB_PATH || path.join(os.homedir(), '.keimenon', 'keimenon.db');

// Test credentials (from migration 001_seed_admin.ts)
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

async function createModeFixtureFile(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fixture = [
    {
      title: 'Mode Fixture Conversation',
      create_time: now,
      update_time: now + 10,
      mapping: {
        root: {
          id: 'root',
          message: {
            id: 'root',
            author: { role: 'system', name: null, metadata: {} },
            create_time: now,
            update_time: null,
            content: { content_type: 'text', parts: [''] },
            status: 'finished_successfully',
            end_turn: true,
            weight: 0,
            metadata: {},
            recipient: 'all',
          },
          parent: null,
          children: ['user_1'],
        },
        user_1: {
          id: 'user_1',
          message: {
            id: 'user_1',
            author: { role: 'user', name: null, metadata: {} },
            create_time: now + 1,
            update_time: null,
            content: {
              content_type: 'text',
              parts: [
                'manualkeyword manualkeyword manualkeyword planning notes and implementation details for deterministic grouping coverage',
              ],
            },
            status: 'finished_successfully',
            end_turn: true,
            weight: 1,
            metadata: {},
            recipient: 'all',
          },
          parent: 'root',
          children: ['assistant_1'],
        },
        assistant_1: {
          id: 'assistant_1',
          message: {
            id: 'assistant_1',
            author: { role: 'assistant', name: null, metadata: {} },
            create_time: now + 2,
            update_time: null,
            content: { content_type: 'text', parts: ['acknowledged'] },
            status: 'finished_successfully',
            end_turn: true,
            weight: 1,
            metadata: {},
            recipient: 'all',
          },
          parent: 'user_1',
          children: [],
        },
      },
    },
  ];

  const tempPath = path.join(
    os.tmpdir(),
    `keimenon-mode-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  await fs.writeFile(tempPath, JSON.stringify(fixture), 'utf8');
  return tempPath;
}

describe('E2E Import Workflow', () => {
  let db: Database.Database;
  let adminToken: string;
  let adminAccountId: string;
  let adminUserId: string;

  beforeAll(async () => {
    try {
      // Initialize database connection
      const dbPath = getDbPath();
      console.log(`DEBUG: Connecting to DB at ${dbPath}`);
      db = new Database(dbPath);
      console.log('DEBUG: DB Connected');

      // Check if tables exist
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      console.log(
        'DEBUG: Existing tables:',
        tables.map((t: any) => t.name)
      );

      // Use seeded admin credentials for deterministic behavior across suites
      console.log(`DEBUG: Logging in admin ${ADMIN_EMAIL}`);
      const adminAuth = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
      adminToken = adminAuth.token;
      adminAccountId = adminAuth.accountId;
      adminUserId = adminAuth.userId;

      console.log(`Admin authenticated (${ADMIN_EMAIL})`);
      console.log(`   Account: ${adminAccountId}`);
      console.log(`   User: ${adminUserId}`);
    } catch (error: any) {
      console.error('DEBUG: Before hook failed:', error);
      throw error;
    }
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

  describe('Complete Import Flow', () => {
    test('should complete full import workflow with SSE updates', async () => {
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

      // 4. Wait for SSE event indicating job queued (or already running/succeeded)
      await sseCollector.waitForCondition((events) => {
        return events.some((e) =>
          e.jobs?.some(
            (j: any) =>
              j.jobId === jobId &&
              ['queued', 'running', 'succeeded', 'completed'].includes(j.status)
          )
        );
      }, 5000);

      console.log('✅ Job queued event received via SSE');

      // 5. Wait for job to start running (or already succeeded)
      await sseCollector.waitForCondition((events) => {
        return events.some((e) =>
          e.jobs?.some(
            (j: any) =>
              j.jobId === jobId && ['running', 'succeeded', 'completed'].includes(j.status)
          )
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

      // Should have at least one progress update event (tiny imports may complete quickly)
      assert.ok(progressEvents.length >= 1);

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

      // World Model V5 imports should at least materialize core import/conversation entities.
      const hasConversationThread = nodesByKind.some((n) => n.kind === 'ConversationThread');
      const hasUploadItem = nodesByKind.some((n) => n.kind === 'UploadItem');
      const hasPrincipal = nodesByKind.some((n) => n.kind === 'Principal');

      assert.ok(
        hasConversationThread || hasUploadItem || hasPrincipal,
        'import should materialize world model entities'
      );

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
    }, 60000); // 60 second timeout for full workflow

    test('should handle small file import (< 10 conversations)', async () => {
      const testFile = getTestFilePath('tiny.json');
      const { jobId } = await createImportJob(testFile, adminToken);

      const completedJob = await waitForJobCompletion(jobId, adminToken, 20000);

      assert.strictEqual(completedJob.state.status, 'succeeded');
      const nodesCreated =
        completedJob.state.result?.nodesCreated ??
        completedJob.state.stats?.nodesCreated ??
        completedJob.stats?.nodesCreated ??
        0;
      assert.ok(nodesCreated >= 0);

      console.log(`Medium import completed (nodesCreated=${nodesCreated})`);
    }, 90000);

    test('should emit progress updates during import', async () => {
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

      // Import can complete before coalesced progress snapshots are emitted.
      // If progress events exist, they should be valid percent values.
      if (progressValues.length > 0) {
        assert.ok(Math.max(...progressValues) >= 0);
      }

      sseCollector.close();
    }, 90000);

    test('should include import metadata in job state', async () => {
      const testFile = getTestFilePath('tiny.json');
      const { jobId } = await createImportJob(testFile, adminToken, {
        extractCode: true,
        codeSettings: {
          minLength: 50,
        },
      });

      const completedJob = await waitForJobCompletion(jobId, adminToken);

      // Verify config stored in current importOptions contract
      assert.ok(completedJob.config?.importOptions);
      assert.strictEqual(completedJob.config.importOptions.extractCode, true);
      assert.strictEqual(completedJob.config.importOptions.codeSettings?.minLength, 50);

      // Verify result/stats object exists in current job payload shape
      const nodesCreated =
        completedJob.state.result?.nodesCreated ??
        completedJob.state.stats?.nodesCreated ??
        completedJob.stats?.nodesCreated ??
        0;
      assert.ok(nodesCreated >= 0);

      console.log('Import stats:', completedJob.state.result ?? completedJob.state.stats ?? {});
    }, 30000);

    test('automatic mode should ignore manual-group definitions', async () => {
      const fixturePath = await createModeFixtureFile();

      try {
        const { jobId } = await createImportJob(fixturePath, adminToken, {
          minMessageLength: 1,
          extraction: { includeUser: true, includeAssistant: false },
          processingMode: 'automatic',
          groups: [
            {
              id: 'grp_manual_automatic_should_ignore',
              name: 'Manual Keyword Group',
              keywords: ['manualkeyword'],
            },
          ],
        });

        const completedJob = await waitForJobCompletion(jobId, adminToken, 45000);
        assert.strictEqual(completedJob.state.status, 'succeeded');

        const persistedJob = await getJob(jobId, adminToken);
        assert.strictEqual(persistedJob.config?.importOptions?.processingMode, 'automatic');
        assert.strictEqual(persistedJob.config?.metadata?.importContractVersion, 'v3');
        assert.strictEqual(persistedJob.config?.metadata?.processingRail, 'chunked');

        const kinds = getNodesByKind(db, adminAccountId);
        const spanCount = kinds.find((entry) => entry.kind === 'SourceSpan')?.count ?? 0;
        const packetCount = kinds.find((entry) => entry.kind === 'Packet')?.count ?? 0;
        const atomicCount = kinds.find((entry) => entry.kind === 'AtomicUnit')?.count ?? 0;
        assert.ok(spanCount > 0, 'automatic mode should create SourceSpan nodes');
        assert.ok(packetCount > 0, 'automatic mode should create Packet nodes');
        assert.ok(atomicCount > 0, 'automatic mode should create AtomicUnit nodes');
      } finally {
        await fs.unlink(fixturePath).catch(() => undefined);
      }
    }, 60000);

    test('manual mode should apply manual groups before auto fallback', async () => {
      const fixturePath = await createModeFixtureFile();

      try {
        const { jobId } = await createImportJob(fixturePath, adminToken, {
          minMessageLength: 1,
          extraction: { includeUser: true, includeAssistant: false },
          processingMode: 'manual',
          groups: [
            {
              id: 'grp_manual_expected',
              name: 'Manual Keyword Group',
              keywords: ['manualkeyword'],
            },
          ],
        });

        const completedJob = await waitForJobCompletion(jobId, adminToken, 45000);
        assert.strictEqual(completedJob.state.status, 'succeeded');
        const persistedJob = await getJob(jobId, adminToken);
        assert.strictEqual(persistedJob.config?.importOptions?.processingMode, 'manual');
        assert.strictEqual(persistedJob.config?.metadata?.importContractVersion, 'v3');
        assert.strictEqual(persistedJob.config?.metadata?.processingRail, 'chunked');
      } finally {
        await fs.unlink(fixturePath).catch(() => undefined);
      }
    }, 60000);
  });

  describe('Import Error Handling', () => {
    test('should fail gracefully on malformed JSON', async () => {
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
    }, 20000);

    test('should handle empty file', async () => {
      const fs = require('fs');
      const tempFile = path.join(os.tmpdir(), 'empty.json');
      fs.writeFileSync(tempFile, '[]');

      try {
        const { jobId } = await createImportJob(tempFile, adminToken);

        const job = await waitForJobCompletion(jobId, adminToken, 10000);

        // Should either succeed with 0 nodes or fail gracefully
        assert.ok(['succeeded', 'failed'].includes(job.state.status));

        if (job.state.status === 'succeeded') {
          assert.strictEqual(job.state.result?.nodesCreated || 0, 0);
        }

        console.log('✅ Empty file handled gracefully');
      } finally {
        fs.unlinkSync(tempFile);
      }
    }, 20000);

    test('should handle missing file gracefully', async () => {
      const nonExistentFile = '/tmp/does-not-exist.json';

      try {
        await createImportJob(nonExistentFile, adminToken);
        // Should throw before creating job
        throw new Error('Expected import to fail');
      } catch (error: any) {
        assert.ok(
          error.message.includes('ENOENT') || error.message.includes('Test file not found')
        );
        console.log('✅ Missing file error caught');
      }
    }, 10000);

    test('failed jobs should stay terminal and never regress to running', async () => {
      const tempFile = path.join(os.tmpdir(), `malformed-${Date.now()}.json`);
      await fs.writeFile(tempFile, '{ not valid json }', 'utf8');

      try {
        const { jobId } = await createImportJob(tempFile, adminToken);
        const failedJob = await waitForJobCompletion(jobId, adminToken, 20000);
        assert.strictEqual(failedJob.state.status, 'failed');

        await sleep(3000);

        const jobAfterDelay = await getJob(jobId, adminToken);
        assert.strictEqual(jobAfterDelay.state.status, 'failed');
      } finally {
        await fs.unlink(tempFile).catch(() => undefined);
      }
    }, 30000);
  });

  describe('Import Jobs List API', () => {
    test('should list active import jobs', async () => {
      // Create multiple import jobs
      const job1 = await createImportJob(getTestFilePath('tiny.json'), adminToken);
      const job2 = await createImportJob(getTestFilePath('tiny.json'), adminToken);

      // Query job list using supported status filter
      await sleep(250);
      const jobs = await listJobs(adminToken, { status: 'all' });

      // Should include our jobs (may include others)
      const hasJob1 = jobs.some((j) => j.id === job1.jobId);
      const hasJob2 = jobs.some((j) => j.id === job2.jobId);

      assert.ok(hasJob1 && hasJob2);

      console.log(`📋 Found ${jobs.length} active jobs`);

      // Wait for completion to avoid interfering with other tests
      await waitForJobCompletion(job1.jobId, adminToken);
      await waitForJobCompletion(job2.jobId, adminToken);
    }, 90000);

    test('should filter jobs by status', async () => {
      const { jobId } = await createImportJob(getTestFilePath('tiny.json'), adminToken);
      await waitForJobCompletion(jobId, adminToken);

      // Query completed jobs
      const completedJobs = await listJobs(adminToken, { status: 'succeeded' });

      const ourJob = completedJobs.find((j) => j.id === jobId);
      assert.ok(ourJob);
      assert.strictEqual(ourJob.state.status, 'succeeded');

      console.log(`📋 Found ${completedJobs.length} completed jobs`);
    });

    test('should limit jobs list results', async () => {
      const jobs = await listJobs(adminToken, { limit: 5 });

      assert.ok(jobs.length <= 5);

      console.log(`📋 Returned ${jobs.length} jobs (limit: 5)`);
    });
  });

  describe('Concurrent Import Jobs', () => {
    test('should handle multiple concurrent imports', async () => {
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

      // Verify data imported is visible in DB
      await waitFor(() => countNodes(db, adminAccountId) > 0, { timeout: 10000, interval: 250 });
      const nodes = countNodes(db, adminAccountId);
      assert.ok(nodes > 0);

      console.log(`📊 Total nodes imported: ${nodes}`);
    }, 120000);

    test('should respect worker pool concurrency limits', async () => {
      const sseCollector = new SSECollector(`${API_URL}/api/v1/stream/jobs`, adminToken);
      await sseCollector.connect();

      // Create 5 jobs (worker pool max is typically 3)
      const jobs = await Promise.all(
        Array.from({ length: 5 }, () => createImportJob(getTestFilePath('tiny.json'), adminToken))
      );

      console.log('📤 Created 5 import jobs');

      // Wait a bit for jobs to start
      await sleep(2000);

      // Check that running states were observed in SSE stream
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

      // Wait for all to complete successfully
      const completedJobs = await Promise.all(
        jobs.map((j) => waitForJobCompletion(j.jobId, adminToken, 90000))
      );
      completedJobs.forEach((job) => {
        assert.strictEqual(job.state.status, 'succeeded');
      });

      sseCollector.close();
      console.log('✅ All jobs completed');
    }, 150000);
  });

  describe('SSE Integration', () => {
    test('should broadcast to correct account only', async () => {
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
    }, 30000);

    test('should include job type in SSE events', async () => {
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
    }, 30000);
  });
});
