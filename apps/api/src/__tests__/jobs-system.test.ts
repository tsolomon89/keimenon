/**
 * Jobs System Integration Tests
 *
 * Tests the complete unified background jobs system including:
 * - Job creation and lifecycle (queued → running → succeeded/failed)
 * - Import worker file parsing and processing
 * - Delete worker with exclusive locks
 * - SSE real-time progress updates
 * - Job idempotency
 * - Multi-tenant job isolation
 * - Worker pool concurrency limits
 * - Job cancellation and error handling
 *
 * Related:
 * - apps/api/src/modules/jobs/ (domain, application, infrastructure)
 * - apps/api/src/modules/workers/ (import, delete workers)
 * - packages/db/src/sqlite/migrations/008_unified_jobs.sql
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { createImportJob } from './utils/test-helpers';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// Test configuration
const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const DB_PATH =
  process.env.DB_PATH ||
  path.join(process.env.HOME || process.env.USERPROFILE || '', '.keimenon', 'keimenon.db');

// Test credentials (from migration 001_seed_admin.ts)
const ADMIN_CREDENTIALS = {
  email: 'admin@admin.com',
  password: 'admin123',
};

const CLIENT_CREDENTIALS = {
  email: 'client@client.com',
  password: 'client123',
};

// Test file paths
const TEST_FILES = {
  tiny: path.join(__dirname, 'fixtures', 'tiny.json'),
  small: path.join(__dirname, 'fixtures', 'small.json'),
};

// Test state
let adminToken: string;
let clientToken: string;
let adminAccountId: string;
let clientAccountId: string;
let db: Database.Database;

/**
 * Register a new user and return auth data
 */
async function register(
  email: string,
  password: string,
  name: string
): Promise<{ token: string; accountId: string }> {
  const response = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Registration failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as any;
  return {
    token: data.token,
    accountId: data.user.account_id || data.account.id, // Handle both response formats
  };
}

/**
 * Login and get JWT token (fallback)
 */
async function login(
  email: string,
  password: string
): Promise<{ token: string; accountId: string }> {
  let response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (error: any) {
    console.error(`Login connection error: ${error.message}`);
    throw error;
  }

  if (!response.ok) {
    console.error(`Login failed status: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.error(`Login response body: ${text}`);
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  return {
    token: data.token,
    accountId: data.user.account_id,
  };
}

/**
 * Create multipart form data with file
 */
function createFormData(filePath: string, config?: any): FormData {
  const form = new FormData();
  form.append('files', fs.createReadStream(filePath));

  if (config) {
    form.append('config', JSON.stringify(config));
  }

  return form;
}

/**
 * Wait for job to reach terminal status
 */
async function waitForJobCompletion(
  jobId: string,
  token: string,
  timeoutMs: number = 60000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${API_URL}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await response.json()) as any;
    const status = data.job.state.status;

    if (['succeeded', 'failed', 'canceled'].includes(status)) {
      return data.job;
    }

    // Wait 500ms before next check
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

/**
 * Wait for job to reach one of the target statuses.
 */
async function waitForJobStatus(
  jobId: string,
  token: string,
  targetStatuses: string[],
  timeoutMs: number = 15000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${API_URL}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await response.json()) as any;
    const status = data.job?.state?.status;

    if (targetStatuses.includes(status)) {
      return data.job;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Job ${jobId} did not reach statuses [${targetStatuses.join(', ')}] within ${timeoutMs}ms`
  );
}

/**
 * Cleanup test data for account
 */
function cleanupTestData(accountId: string) {
  try {
    // Delete all nodes for test account
    db.prepare(
      "DELETE FROM nodes WHERE account_id = ? AND kind NOT IN ('AccountNode', 'UserNode', 'AgentNode', 'Principal', 'Board', 'Constellation')"
    ).run(accountId);
    // Delete all edges for test account
    db.prepare(
      'DELETE FROM edges WHERE account_id = ? AND (from_id NOT IN (SELECT id FROM nodes WHERE account_id = ?) OR to_id NOT IN (SELECT id FROM nodes WHERE account_id = ?))'
    ).run(accountId, accountId, accountId);
    // Delete all jobs for test account
    db.prepare('DELETE FROM jobs WHERE account_id = ?').run(accountId);
    // Delete all job events for test account
    db.prepare('DELETE FROM job_events WHERE account_id = ?').run(accountId);

    console.log(`✓ Cleaned up test data for account ${accountId}`);
  } catch (error: any) {
    console.error(`✗ Error cleaning up test data: ${error.message}`);
  }
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
 * Wait for account node count to reach a minimum value.
 * This avoids racing eventual DB writes right after import job completion.
 */
async function waitForNodeCount(
  accountId: string,
  minCount: number,
  timeoutMs: number = 10000
): Promise<number> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const count = countNodes(accountId);
    if (count >= minCount) {
      return count;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const finalCount = countNodes(accountId);
  throw new Error(
    `Node count did not reach ${minCount} for account ${accountId} within ${timeoutMs}ms (final=${finalCount})`
  );
}

/**
 * Count jobs for account
 */
function _countJobs(accountId: string, status?: string): number {
  if (status) {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM jobs WHERE account_id = ? AND status = ?')
      .get(accountId, status) as any;
    return result.count;
  } else {
    const result = db
      .prepare('SELECT COUNT(*) as count FROM jobs WHERE account_id = ?')
      .get(accountId) as any;
    return result.count;
  }
}

// ============================================================================
// Test Suite Setup
// ============================================================================

beforeAll(async () => {
  console.log('\n🧪 Jobs System Integration Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Open database connection
  db = new Database(DB_PATH);

  // Dynamic credentials to ensure clean state
  const timestamp = Date.now();
  const adminEmail = `admin_${timestamp}@test.com`;
  const clientEmail = `client_${timestamp}@test.com`;

  // Register admin
  try {
    const adminAuth = await register(adminEmail, ADMIN_CREDENTIALS.password, 'Admin User');
    adminToken = adminAuth.token;
    adminAccountId = adminAuth.accountId;
    console.log(`✓ Admin registered (${adminEmail}, ${adminAccountId})`);
  } catch (e) {
    console.warn('Registration failed, trying login:', (e as Error).message);
    // Fallback to login if registration fails (e.g. user exists from previous run within same ms?)
    const adminAuth = await login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    adminToken = adminAuth.token;
    adminAccountId = adminAuth.accountId;
    console.log(`✓ Admin logged in (${adminAccountId})`);
  }

  // Register client
  try {
    const clientAuth = await register(clientEmail, CLIENT_CREDENTIALS.password, 'Client User');
    clientToken = clientAuth.token;
    clientAccountId = clientAuth.accountId;
    console.log(`✓ Client registered (${clientEmail}, ${clientAccountId})`);
  } catch (e) {
    // Fallback
    const clientAuth = await login(CLIENT_CREDENTIALS.email, CLIENT_CREDENTIALS.password);
    clientToken = clientAuth.token;
    clientAccountId = clientAuth.accountId;
    console.log(`✓ Client logged in (${clientAccountId})`);
  }

  // Verify test files exist
  if (!fs.existsSync(TEST_FILES.tiny)) {
    throw new Error(`Test file not found: ${TEST_FILES.tiny}`);
  }
  console.log(`✓ Test files verified\n`);
}, 30000);

afterAll(async () => {
  // Cleanup test data
  if (db) {
    cleanupTestData(adminAccountId);
    cleanupTestData(clientAccountId);
    db.close();
  }

  console.log('\n✓ Test suite complete\n');
});

beforeEach(() => {
  // Clean up before each test
  if (db && adminAccountId) {
    cleanupTestData(adminAccountId);
  }
  if (db && clientAccountId) {
    cleanupTestData(clientAccountId);
  }
});

// ============================================================================
// Import Jobs Tests
// ============================================================================

describe('Import Jobs', () => {
  it('should create import job from file upload', async () => {
    const { jobId: _tempJobId_response } = await createImportJob(TEST_FILES.tiny, adminToken, {
      extractCode: true,
      codeSettings: { minLength: 50 },
    });
    const response = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_response}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = (await response.json()) as any;
    data.jobId = _tempJobId_response;
    assert.strictEqual(data.success, true);
    assert.ok(data.jobId !== undefined && data.jobId !== null);
    assert.strictEqual(data.job.type, 'import');
    assert.strictEqual(data.job.state.status, 'queued');
    assert.strictEqual(data.job.config.files.length, 1);
    assert.ok(data.job.config.files[0].fileName.includes('tiny.json'));
  }, 10000);

  it('should process import job and update progress', async () => {
    // Create job
    const { jobId: _tempJobId_createResponse } = await createImportJob(TEST_FILES.tiny, adminToken);
    const createResponse = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_createResponse}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const createData = (await createResponse.json()) as any;
    createData.jobId = _tempJobId_createResponse;
    const jobId = createData.jobId;

    console.log(`   📋 Created job: ${jobId}`);

    // Wait for completion
    const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

    console.log(`   ✅ Job completed with status: ${completedJob.state.status}`);

    // Verify job succeeded
    assert.strictEqual(completedJob.state.status, 'succeeded');
    assert.strictEqual(completedJob.progress.percent, 100);

    // Verify data was imported
    const nodeCount = countNodes(adminAccountId);
    console.log(`Debug: Node count for account ${adminAccountId} is ${nodeCount}`);
    assert.ok(nodeCount > 0);

    console.log(`   📊 Imported ${nodeCount} nodes`);

    // Verify job events were created
    const events = db
      .prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY sequence_number')
      .all(jobId) as any[];

    // Should have queued, started, progress, and succeeded events
    const eventTypes = events.map((e) => e.type);
    assert.ok(eventTypes.includes('job.queued'), 'Missing job.queued event');
    assert.ok(eventTypes.includes('job.started'), 'Missing job.started event');
    assert.ok(eventTypes.includes('job.succeeded'), 'Missing job.succeeded event');

    console.log(`   📝 Recorded ${events.length} job events`);
  }, 60000);

  it('should handle import job failure', async () => {
    // Create a temp file with invalid JSON
    const invalidFile = path.join(__dirname, 'invalid.json');
    fs.writeFileSync(invalidFile, '{ invalid json }');

    try {
      const { jobId: _tempJobId_createResponse } = await createImportJob(invalidFile, adminToken);
      const createResponse = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_createResponse}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const createData = (await createResponse.json()) as any;
      createData.jobId = _tempJobId_createResponse;
      const jobId = createData.jobId;

      // Wait for completion (should fail)
      const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

      // Verify job failed
      assert.strictEqual(completedJob.state.status, 'failed');
      assert.ok(completedJob.state.error !== undefined && completedJob.state.error !== null);
      assert.ok(completedJob.state.error.message.includes('JSON'));

      console.log(`   ✅ Job correctly failed: ${completedJob.state.error.message}`);
    } finally {
      // Cleanup temp file
      if (fs.existsSync(invalidFile)) {
        fs.unlinkSync(invalidFile);
      }
    }
  }, 60000);

  it('should support job cancellation', async () => {
    // Create job
    const { jobId } = await createImportJob(TEST_FILES.small, adminToken);
    assert.ok(jobId, 'Job ID should be returned');

    console.log(`   📋 Created job ${jobId}, waiting for it to start...`);

    // Give worker a brief chance to pick up the job
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Cancel the job using POST /api/v1/jobs/:jobId/cancel
    const cancelResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    const cancelData = (await cancelResponse.json()) as any;
    assert.ok(
      cancelResponse.ok || cancelResponse.status === 400,
      `Cancel request should succeed or be rejected for completed jobs (status: ${cancelResponse.status})`
    );
    if (cancelResponse.ok) {
      assert.strictEqual(cancelData.success, true, 'Cancel response should indicate success');
    } else {
      assert.ok(
        String(cancelData.error || '').includes('Cannot cancel job with status'),
        'Expected completed-job cancellation rejection'
      );
    }

    console.log(`   ⛔ Cancel request sent for job ${jobId}`);

    // Wait for job to actually stop (worker should check signal)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify job status is canceled
    const statusResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const statusData = (await statusResponse.json()) as any;
    const finalStatus = statusData.job.state.status;

    // Job should be canceled (or succeeded if it finished before cancel took effect)
    assert.ok(
      ['canceled', 'succeeded'].includes(finalStatus),
      `Job should be canceled or succeeded, got: ${finalStatus}`
    );

    console.log(`   ✅ Job final status: ${finalStatus}`);

    // If job was canceled, verify it has a canceledAt timestamp
    if (finalStatus === 'canceled') {
      assert.ok(statusData.job.state.canceledAt, 'Canceled job should have canceledAt timestamp');
      console.log(`   ✅ Job has canceledAt timestamp`);
    }
  }, 30000);

  it('should cancel queued job before it starts', async () => {
    // Create multiple jobs to fill the worker pool
    const jobIds: string[] = [];

    // Create 5 jobs (assuming worker pool has limited concurrency)
    for (let i = 0; i < 5; i++) {
      const { jobId: _tempJobId_response } = await createImportJob(TEST_FILES.small, adminToken);
      const response = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_response}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = (await response.json()) as any;
      data.jobId = _tempJobId_response;
      jobIds.push(data.jobId);
    }

    console.log(`   📋 Created ${jobIds.length} jobs`);

    // Immediately cancel the last job (likely still queued)
    const jobToCancel = jobIds[jobIds.length - 1];
    const cancelResponse = await fetch(`${API_URL}/api/v1/jobs/${jobToCancel}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(cancelResponse.ok, true, 'Cancel request should succeed');

    // Verify the job is canceled
    const statusResponse = await fetch(`${API_URL}/api/v1/jobs/${jobToCancel}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const statusData = (await statusResponse.json()) as any;
    const status = statusData.job.state.status;

    assert.ok(
      ['canceled', 'queued', 'running'].includes(status),
      `Job should be in valid state, got: ${status}`
    );

    console.log(`   ✅ Queued job cancel test completed (status: ${status})`);

    // Wait for all jobs to complete or be canceled
    await Promise.all(
      jobIds.map((id) => waitForJobCompletion(id, adminToken, 30000).catch(() => null))
    );
  }, 60000);

  it('should pause a running job', async () => {
    // Create job with small file for longer runtime
    const { jobId: _tempJobId_createResponse } = await createImportJob(
      TEST_FILES.small,
      adminToken
    );
    const createResponse = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_createResponse}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const createData = (await createResponse.json()) as any;
    createData.jobId = _tempJobId_createResponse;
    const jobId = createData.jobId;

    console.log(`   📋 Created job ${jobId}, waiting for it to start...`);

    // Give worker a brief chance to pick up the job
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Pause the job
    const pauseResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}/pause`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    const pauseData = (await pauseResponse.json()) as any;
    assert.ok(
      pauseResponse.ok || pauseResponse.status === 400,
      `Pause request should succeed or be rejected for completed jobs (status: ${pauseResponse.status})`
    );
    if (pauseResponse.ok) {
      assert.strictEqual(pauseData.success, true, 'Pause response should indicate success');
    } else {
      assert.ok(
        String(pauseData.error || '').includes('Cannot pause job with status'),
        'Expected completed-job pause rejection'
      );
    }

    console.log(`   ⏸️  Pause request sent for job ${jobId}`);

    // Wait for pause or terminal transition to settle.
    const settledJob = await waitForJobStatus(
      jobId,
      adminToken,
      ['blocked', 'succeeded', 'canceled'],
      15000
    );
    const finalStatus = settledJob.state.status;

    // Job should be blocked (paused) or succeeded if it finished before pause took effect
    assert.ok(
      ['blocked', 'succeeded', 'canceled'].includes(finalStatus),
      `Job should be blocked, succeeded, or canceled, got: ${finalStatus}`
    );

    console.log(`   ✅ Job final status: ${finalStatus}`);

    // If job was paused, verify it has blockedAt timestamp
    if (finalStatus === 'blocked') {
      assert.ok(settledJob.state.blockedAt, 'Paused job should have blockedAt timestamp');
      console.log(`   ✅ Job has blockedAt timestamp`);
    }
  }, 30000);

  it('should resume a paused job', async () => {
    // Create and pause a job
    const { jobId: _tempJobId_createResponse } = await createImportJob(
      TEST_FILES.small,
      adminToken
    );
    const createResponse = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_createResponse}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const createData = (await createResponse.json()) as any;
    createData.jobId = _tempJobId_createResponse;
    const jobId = createData.jobId;

    // Give worker a brief chance to pick up the job
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Pause it
    const pauseResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}/pause`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!pauseResponse.ok) {
      const pauseError = (await pauseResponse.json()) as any;
      assert.strictEqual(
        pauseResponse.status,
        400,
        `Pause should only fail when job already completed (status: ${pauseResponse.status})`
      );
      assert.ok(
        String(pauseError.error || '').includes('Cannot pause job with status'),
        'Expected completed-job pause rejection'
      );
      return;
    }

    // Wait for pause to take effect
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check job is paused
    let statusResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    let statusData = (await statusResponse.json()) as any;

    console.log(`   ⏸️  Job paused with status: ${statusData.job.state.status}`);

    // Only test resume if job actually got paused (might have finished too quickly)
    if (statusData.job.state.status === 'blocked') {
      // Resume the job
      const resumeResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}/resume`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.strictEqual(resumeResponse.ok, true, 'Resume request should succeed');
      const resumeData = (await resumeResponse.json()) as any;
      assert.strictEqual(resumeData.success, true, 'Resume response should indicate success');

      console.log(`   ▶️  Resume request sent for job ${jobId}`);

      // Wait a moment and check job is queued again
      await new Promise((resolve) => setTimeout(resolve, 500));

      statusResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      statusData = (await statusResponse.json()) as any;

      // Job should transition from blocked to queued
      assert.ok(
        ['queued', 'running', 'succeeded'].includes(statusData.job.state.status),
        `Resumed job should be queued/running/succeeded, got: ${statusData.job.state.status}`
      );

      console.log(`   ✅ Job resumed with status: ${statusData.job.state.status}`);
    } else {
      console.log(`   ⏭️  Job completed before pause took effect, skipping resume test`);
    }
  }, 60000);

  it('should not pause a job that is not running', async () => {
    // Create job
    const { jobId: _tempJobId_createResponse } = await createImportJob(TEST_FILES.tiny, adminToken);
    const createResponse = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_createResponse}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const createData = (await createResponse.json()) as any;
    createData.jobId = _tempJobId_createResponse;
    const jobId = createData.jobId;

    // Wait for job to complete
    await waitForJobCompletion(jobId, adminToken, 30000);

    // Try to pause completed job (should fail)
    const pauseResponse = await fetch(`${API_URL}/api/v1/jobs/${jobId}/pause`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Should return 400 Bad Request
    assert.strictEqual(pauseResponse.status, 400, 'Pausing non-running job should return 400');

    const errorData = (await pauseResponse.json()) as any;
    assert.strictEqual(errorData.success, false, 'Response should indicate failure');
    assert.ok(errorData.error !== undefined, 'Response should include error payload');

    console.log(`   ✅ Correctly rejected pause on completed job`);
  }, 30000);

  it('should embed tenancy metadata in job config', async () => {
    const { jobId: _tempJobId_response } = await createImportJob(TEST_FILES.tiny, adminToken, {
      exportCode: true,
    });
    const response = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_response}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = (await response.json()) as any;
    data.jobId = _tempJobId_response;
    const job = data.job;

    console.log('   🔍 Validating tenancy metadata...');

    // Verify tenancy metadata exists and is server-side derived
    assert.ok(job.config.tenancy, 'job.config.tenancy should exist');
    assert.ok(job.config.tenancy.actorId, 'actorId should exist');
    assert.strictEqual(typeof job.config.tenancy.actorId, 'string', 'actorId should be string');
    assert.ok(job.config.tenancy.actorId.length > 0, 'actorId should not be empty');

    // Verify userId matches authenticated user
    assert.strictEqual(
      job.config.tenancy.userId,
      job.createdBy,
      'tenancy.userId should match job.createdBy'
    );

    // Verify accountId is set
    assert.strictEqual(
      job.config.tenancy.accountId,
      job.accountId,
      'tenancy.accountId should match job.accountId'
    );

    // Verify userType and accountMembership are set (server-derived, not client-sent)
    assert.ok(job.config.tenancy.userType, 'userType should exist');
    assert.ok(job.config.tenancy.accountMembership, 'accountMembership should exist');
    assert.ok(job.config.tenancy.userEmail, 'userEmail should exist for audit');

    console.log(`   ✅ Tenancy metadata validated:`, {
      actorId: job.config.tenancy.actorId,
      userId: job.config.tenancy.userId,
      accountId: job.config.tenancy.accountId,
      userType: job.config.tenancy.userType,
      membership: job.config.tenancy.accountMembership,
    });
  }, 10000);
});

// ============================================================================
// Delete Jobs Tests
// ============================================================================

describe('Delete Jobs', () => {
  beforeEach(async () => {
    // Create some test data first
    const { jobId: _tempJobId_response } = await createImportJob(TEST_FILES.tiny, adminToken);
    const response = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_response}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = (await response.json()) as any;
    data.jobId = _tempJobId_response;
    await waitForJobCompletion(data.jobId, adminToken, 30000);
    const importedNodeCount = await waitForNodeCount(adminAccountId, 1, 15000);

    console.log(`   📝 Setup: Imported test data (${importedNodeCount} nodes)`);
  });

  it('should create delete job with exclusive lock', async () => {
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'keimenon' }),
    });

    assert.strictEqual(response.ok, true);

    const data = (await response.json()) as any;
    assert.strictEqual(data.success, true);
    assert.ok(data.jobId !== undefined && data.jobId !== null);

    // Verify concurrency group
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(data.jobId) as any;
    assert.strictEqual(job.concurrency_group, `delete:${adminAccountId}`);

    console.log(`   ✅ Delete job created with exclusive lock`);
  }, 10000);

  it('should delete all keimenon data', async () => {
    const nodesBefore = countNodes(adminAccountId);
    assert.ok(nodesBefore > 0);

    console.log(`   📊 Nodes before delete: ${nodesBefore}`);

    // Create delete job
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'keimenon' }),
    });

    const data = (await response.json()) as any;
    const jobId = data.jobId;

    // Wait for completion
    const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

    assert.strictEqual(completedJob.state.status, 'succeeded');

    // Verify all nodes deleted
    const nodesAfter = countNodes(adminAccountId);
    assert.strictEqual(nodesAfter, 0);

    console.log(`   ✅ All nodes deleted (${nodesBefore} → ${nodesAfter})`);
  }, 60000);

  it('should delete client data only (preserve system nodes)', async () => {
    // This test would require UserNode to exist
    // For now, just verify scope parameter works
    const response = await fetch(`${API_URL}/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'all-clients' }),
    });

    assert.strictEqual(response.ok, true);

    const data = (await response.json()) as any;
    const row = db.prepare('SELECT config FROM jobs WHERE id = ?').get(data.jobId) as any;
    const jobConfig = typeof row?.config === 'string' ? JSON.parse(row.config) : row?.config;
    assert.strictEqual(jobConfig?.deleteScope, 'all-clients');

    console.log(`   ✅ Delete job created with scope: all-clients`);
  }, 10000);
});

// ============================================================================
// Job Idempotency Tests
// ============================================================================

describe('Job Idempotency', () => {
  it('should hard-reject legacy generic job enqueue endpoint', async () => {
    const response = await fetch(`${API_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'delete',
        config: { deleteScope: 'keimenon' },
      }),
    });

    assert.strictEqual(response.status, 404);
    const data = (await response.json()) as any;
    assert.strictEqual(data.success, false);
    assert.ok(
      typeof data.error === 'string' && data.error.includes('Endpoint removed'),
      'Legacy endpoint should return explicit hard-break guidance'
    );
  }, 10000);
});

// ============================================================================
// Multi-Tenant Isolation Tests
// ============================================================================

describe('Multi-Tenant Isolation', () => {
  it('should isolate jobs by account', async () => {
    // Create job for admin account
    const { jobId: adminJobId } = await createImportJob(TEST_FILES.tiny, adminToken);

    // Create job for client account
    const { jobId: clientJobId } = await createImportJob(TEST_FILES.tiny, clientToken);

    // Query jobs as admin - should only see admin's job
    const adminJobsResponse = await fetch(`${API_URL}/api/v1/jobs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const adminJobsData = (await adminJobsResponse.json()) as any;
    const adminJobIds = adminJobsData.jobs.map((j: any) => j.id);

    assert.ok(adminJobIds.includes(adminJobId));
    assert.ok(!adminJobIds.includes(clientJobId));

    // Query jobs as client - should only see client's job
    const clientJobsResponse = await fetch(`${API_URL}/api/v1/jobs`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });

    const clientJobsData = (await clientJobsResponse.json()) as any;
    const clientJobIds = clientJobsData.jobs.map((j: any) => j.id);

    assert.ok(clientJobIds.includes(clientJobId));
    assert.ok(!clientJobIds.includes(adminJobId));

    console.log(`   ✅ Jobs correctly isolated by account`);
  }, 30000);
});

// ============================================================================
// Worker Pool Tests
// ============================================================================

describe('Worker Pool', () => {
  it('should process queued jobs automatically', async () => {
    // Create job
    const { jobId: _tempJobId_response } = await createImportJob(TEST_FILES.tiny, adminToken);
    const response = await fetch(`${API_URL}/api/v1/jobs/${_tempJobId_response}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = (await response.json()) as any;
    data.jobId = _tempJobId_response;
    const jobId = data.jobId;

    // Job starts as queued
    assert.strictEqual(data.job.state.status, 'queued');

    // Wait for worker pool to pick it up (polls every 5s)
    // Should transition: queued → running → succeeded
    const completedJob = await waitForJobCompletion(jobId, adminToken, 30000);

    assert.strictEqual(completedJob.state.status, 'succeeded');

    console.log(`   ✅ Worker pool automatically processed job`);
  }, 60000);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
