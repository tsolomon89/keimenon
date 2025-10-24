/**
 * UI INTEGRATION TEST SUITE
 *
 * Purpose: Test the complete end-to-end flow from browser upload to UI display
 * Complements: comprehensive-system-test.ts (backend pipeline tests)
 *
 * What This Tests:
 * ✅ Browser → Server API communication
 * ✅ Import modal → Backend persistence
 * ✅ Database → UI data transformation
 * ✅ Groups & Folders navigation tree
 * ✅ Multi-tenant data isolation
 *
 * What Backend Tests Cover:
 * ✅ Phase 1-3 processing pipeline
 * ✅ Content deduplication
 * ✅ Clustering & grouping
 * ✅ Graph integrity
 *
 * Together: Complete system validation from upload button to rendered UI
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import FormData from 'form-data';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';
import EventSourcePolyfill from 'eventsource';

// Handle both ESM and CommonJS imports
const EventSource = (EventSourcePolyfill as any).default || EventSourcePolyfill;

// Test Configuration
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const DB_PATH = process.env.DB_PATH || path.join(os.homedir(), '.canvas-memory', 'canvas.db');
const TEST_FILES_DIR = path.join(process.cwd(), '../../ai_context/chat_data/test-samples');

// Test Credentials (from migration 001_seed_admin.ts)
const ADMIN_CREDENTIALS = {
  email: 'admin@admin.com',
  password: 'admin123',
};

const CLIENT_CREDENTIALS = {
  email: 'client@client.com',
  password: 'client123',
};

// Global test state
let adminToken: string;
let clientToken: string;
let adminAccountId: string;
let clientAccountId: string;
let db: Database.Database;

/**
 * Setup: Authenticate and get tokens
 */
before(async () => {
  console.log('\n🔧 Setting up UI Integration Tests...\n');

  // Open database connection
  db = new Database(DB_PATH);

  // Login as admin
  const adminLoginRes = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN_CREDENTIALS),
  });

  if (!adminLoginRes.ok) {
    throw new Error(`Admin login failed: ${adminLoginRes.status}`);
  }

  const adminLoginData = await adminLoginRes.json();
  adminToken = adminLoginData.token;
  adminAccountId = adminLoginData.user.accountId;

  console.log(`✅ Admin authenticated (account: ${adminAccountId})`);

  // Login as client
  const clientLoginRes = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CLIENT_CREDENTIALS),
  });

  if (!clientLoginRes.ok) {
    throw new Error(`Client login failed: ${clientLoginRes.status}`);
  }

  const clientLoginData = await clientLoginRes.json();
  clientToken = clientLoginData.token;
  clientAccountId = clientLoginData.user.accountId;

  console.log(`✅ Client authenticated (account: ${clientAccountId})\n`);
});

/**
 * Cleanup: Close database
 */
after(() => {
  if (db) {
    db.close();
  }
  console.log('\n✅ UI Integration Tests Complete\n');
});

/**
 * Helper: Upload file via API
 */
async function uploadFile(filePath: string, token: string, config: any = {}) {
  const form = new FormData();
  form.append('files', fs.createReadStream(filePath));
  form.append('config', JSON.stringify(config));

  const response = await fetch(`${API_BASE_URL}/api/v1/import/enhanced`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  return response;
}

/**
 * Helper: Get groups/folders tree
 */
async function getGroupsTree(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/v1/groups`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get groups tree: ${response.status}`);
  }

  return response.json();
}

/**
 * Helper: Get nodes by account
 */
function getNodesByAccount(accountId: string) {
  return db
    .prepare(
      `
    SELECT kind, COUNT(*) as count
    FROM nodes
    WHERE account_id = ?
    GROUP BY kind
    ORDER BY kind
  `
    )
    .all(accountId);
}

/**
 * Helper: Clean up test data
 */
function cleanupTestData(accountId: string) {
  const deleteEdges = db.prepare('DELETE FROM edges WHERE account_id = ?');
  const deleteNodes = db.prepare('DELETE FROM nodes WHERE account_id = ?');

  deleteEdges.run(accountId);
  deleteNodes.run(accountId);
}

/**
 * ============================================================================
 * TEST SUITE 1: API Upload Endpoint
 * ============================================================================
 */
describe('API Upload Endpoint', () => {
  test('should accept multipart form data with files and config', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      console.warn(`⚠️  Test file not found: ${testFile}`);
      return;
    }

    const response = await uploadFile(testFile, adminToken, {
      export_code: true,
      code_min_chars: 50,
    });

    assert.strictEqual(response.ok, true);

    const data = await response.json();
    assert.strictEqual(data.success, true);
  }, 60000); // 60s timeout

  test('should reject unauthenticated requests', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      return;
    }

    const form = new FormData();
    form.append('files', fs.createReadStream(testFile));

    const response = await fetch(`${API_BASE_URL}/api/v1/import/enhanced`, {
      method: 'POST',
      body: form,
    });

    assert.strictEqual(response.status, 401);
  });

  test('should parse config from form fields', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      return;
    }

    const customConfig = {
      export_code: false,
      sources_min_chars_user: 300,
      duplicate_detection_enabled: true,
    };

    const response = await uploadFile(testFile, adminToken, customConfig);
    assert.strictEqual(response.ok, true);
  }, 60000);
});

/**
 * ============================================================================
 * TEST SUITE 2: Data Persistence & Multi-Tenancy
 * ============================================================================
 */
describe('Data Persistence & Multi-Tenancy', () => {
  before(() => {
    // Clean up any existing test data
    cleanupTestData(adminAccountId);
    cleanupTestData(clientAccountId);
  });

  test('should persist imported data with correct account_id', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      console.warn(`⚠️  Test file not found: ${testFile}`);
      return;
    }

    const beforeCounts = getNodesByAccount(adminAccountId);
    console.log('📊 Before import:', beforeCounts);

    const response = await uploadFile(testFile, adminToken);
    assert.strictEqual(response.ok, true);

    const afterCounts = getNodesByAccount(adminAccountId);
    console.log('📊 After import:', afterCounts);

    // Should have created nodes
    const totalBefore = beforeCounts.reduce((sum, row: any) => sum + row.count, 0);
    const totalAfter = afterCounts.reduce((sum, row: any) => sum + row.count, 0);

    assert.ok(totalAfter > totalBefore);

    // Should have Folder and Group nodes
    const folderCount = afterCounts.find((r: any) => r.kind === 'Folder')?.count || 0;
    const groupCount = afterCounts.find((r: any) => r.kind === 'Group')?.count || 0;

    assert.ok(folderCount > 0);
    assert.ok(groupCount > 0);
  }, 120000); // 2min timeout

  test('should isolate data between accounts', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      return;
    }

    // Upload as admin
    await uploadFile(testFile, adminToken);

    // Upload as client
    await uploadFile(testFile, clientToken);

    // Check admin data
    const adminNodes = db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?')
      .get(adminAccountId);

    // Check client data
    const clientNodes = db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?')
      .get(clientAccountId);

    // Both should have data
    assert.ok((adminNodes as any).count > 0);
    assert.ok((clientNodes as any).count > 0);

    // Check for data leakage
    const wrongAccountNodes = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM nodes
      WHERE account_id NOT IN (?, ?)
    `
      )
      .get(adminAccountId, clientAccountId);

    assert.strictEqual((wrongAccountNodes as any).count, 0);
  }, 120000);
});

/**
 * ============================================================================
 * TEST SUITE 3: Groups & Folders Navigation
 * ============================================================================
 */
describe('Groups & Folders Navigation', () => {
  before(async () => {
    // Ensure admin has some imported data
    const testFile = path.join(TEST_FILES_DIR, 'small.json');
    if (fs.existsSync(testFile)) {
      await uploadFile(testFile, adminToken);
    }
  });

  test('should return groups tree for authenticated user', async (_t) => {
    const response = await getGroupsTree(adminToken);

    assert.strictEqual(response.success, true);
    assert.ok(Array.isArray(response.groups));

    console.log(`📁 Admin has ${response.groups.length} root folders/groups`);
  });

  test('should return empty tree for user with no data', async (_t) => {
    // Create a new client without any imports
    cleanupTestData(clientAccountId);

    const response = await getGroupsTree(clientToken);

    assert.strictEqual(response.success, true);
    assert.strictEqual(response.groups.length, 0);
  });

  test('should include folder structure with groups', async (_t) => {
    const response = await getGroupsTree(adminToken);

    if (response.groups.length === 0) {
      console.warn('⚠️  No groups found - skipping structure test');
      return;
    }

    const folder = response.groups.find((g: any) => g.kind === 'Folder');

    if (folder) {
      assert.ok(folder.hasOwnProperty('id'));
      assert.ok(folder.hasOwnProperty('kind'));
      assert.ok(folder.hasOwnProperty('properties'));

      // Folders can have children
      if (folder.children) {
        assert.ok(Array.isArray(folder.children));
      }
    }
  });

  test('should only show data for the authenticated account', async (_t) => {
    // Get admin tree
    const adminTree = await getGroupsTree(adminToken);

    // Get client tree
    const clientTree = await getGroupsTree(clientToken);

    // Extract all node IDs from admin tree
    const adminNodeIds = new Set();
    function collectIds(nodes: any[]) {
      for (const node of nodes) {
        adminNodeIds.add(node.id);
        if (node.children) {
          collectIds(node.children);
        }
      }
    }
    collectIds(adminTree.groups);

    // Extract all node IDs from client tree
    const clientNodeIds = new Set();
    collectIds(clientTree.groups);

    // Should have NO overlap
    const overlap = Array.from(adminNodeIds).filter((id) => clientNodeIds.has(id));
    assert.strictEqual(overlap.length, 0);
  });
});

/**
 * ============================================================================
 * TEST SUITE 4: UI Data Transformation
 * ============================================================================
 */
describe('UI Data Transformation', () => {
  test('should parse node properties from JSON strings', async (_t) => {
    const response = await getGroupsTree(adminToken);

    if (response.groups.length === 0) {
      console.warn('⚠️  No groups found - skipping property test');
      return;
    }

    const node = response.groups[0];

    // Properties should be parsed objects, not JSON strings
    assert.strictEqual(typeof node.properties, 'object');
    assert.ok(node.properties !== null);
  });

  test('should include edge relationships in tree structure', async (_t) => {
    const response = await getGroupsTree(adminToken);

    // Check if we have FOLDS_INTO_FOLDER edges
    const foldsIntoEdges = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM edges
      WHERE kind = 'FOLDS_INTO_FOLDER'
      AND account_id = ?
    `
      )
      .get(adminAccountId);

    console.log(`📊 FOLDS_INTO_FOLDER edges: ${(foldsIntoEdges as any).count}`);

    // If we have edges, tree should reflect hierarchy
    if ((foldsIntoEdges as any).count > 0) {
      const hasChildren = response.groups.some((g: any) => g.children && g.children.length > 0);
      assert.strictEqual(hasChildren, true);
    }
  });
});

/**
 * ============================================================================
 * TEST SUITE 5: Error Handling
 * ============================================================================
 */
describe('Error Handling', () => {
  test('should handle invalid file formats gracefully', async (_t) => {
    const form = new FormData();
    form.append('files', Buffer.from('invalid json'), { filename: 'test.txt' });

    const response = await fetch(`${API_BASE_URL}/api/v1/import/enhanced`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    // Should either accept and handle, or reject cleanly
    assert.ok([200, 400].includes(response.status));
  });

  test('should validate authentication tokens', async (_t) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer invalid_token_12345',
      },
    });

    assert.strictEqual(response.status, 401);
  });

  test('should handle missing config gracefully', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      return;
    }

    const form = new FormData();
    form.append('files', fs.createReadStream(testFile));
    // Intentionally omit config field

    const response = await fetch(`${API_BASE_URL}/api/v1/import/enhanced`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    // Should use default config and succeed
    assert.strictEqual(response.ok, true);
  }, 60000);
});

/**
 * ============================================================================
 * TEST SUITE 6: Performance & Scale
 * ============================================================================
 */
describe('Performance & Scale', () => {
  test('should handle medium file (135MB) import', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'medium.json');

    if (!fs.existsSync(testFile)) {
      console.warn(`⚠️  Medium test file not found: ${testFile}`);
      return;
    }

    const startTime = Date.now();
    const response = await uploadFile(testFile, adminToken);
    const duration = Date.now() - startTime;

    assert.strictEqual(response.ok, true);

    console.log(`⏱️  Medium file import took: ${(duration / 1000).toFixed(1)}s`);

    if (duration < 30000) {
      console.log('⚡ Performance: Excellent (< 30s)');
    } else if (duration < 60000) {
      console.log('👍 Performance: Good (< 1min)');
    } else {
      console.log('⚠️  Performance: Slow (> 1min)');
    }
  }, 300000); // 5min timeout

  test('should fetch groups tree quickly even with large dataset', async (_t) => {
    const startTime = Date.now();
    await getGroupsTree(adminToken);
    const duration = Date.now() - startTime;

    console.log(`⏱️  Groups tree fetch took: ${duration}ms`);

    // Should be fast (< 1s)
    assert.ok(duration < 1000);
  });
});

/**
 * ============================================================================
 * TEST SUITE 7: SSE Job Streaming (Real-time Updates)
 * ============================================================================
 */
describe('SSE Job Streaming', () => {
  test('should connect to SSE stream with token authentication', async (_t) => {
    const sseUrl = `${API_BASE_URL}/api/v1/stream/jobs?token=${adminToken}`;
    const eventSource = new EventSource(sseUrl);

    // Wait for connection
    await new Promise((resolve, reject) => {
      eventSource.onopen = () => {
        console.log('✅ SSE connection established');
        resolve(true);
      };

      eventSource.onerror = (error) => {
        reject(new Error('SSE connection failed'));
      };

      // Timeout after 5s
      setTimeout(() => reject(new Error('SSE connection timeout')), 5000);
    });

    eventSource.close();
    assert.strictEqual(true, true); // If we got here, connection succeeded
  }, 10000);

  test('should receive real-time job updates via SSE', async (_t) => {
    const testFile = path.join(TEST_FILES_DIR, 'tiny.json');

    if (!fs.existsSync(testFile)) {
      console.warn('⚠️  Test file not found, skipping SSE test');
      return;
    }

    const sseUrl = `${API_BASE_URL}/api/v1/stream/jobs?token=${adminToken}`;
    const eventSource = new EventSource(sseUrl);
    const receivedEvents: any[] = [];

    // Listen for job updates
    eventSource.addEventListener('jobs.update', (event: any) => {
      const data = JSON.parse(event.data);
      receivedEvents.push(data);
      console.log(`📡 SSE event received: ${data.jobs?.length || 0} job(s)`);
    });

    // Wait for connection
    await new Promise((resolve) => {
      eventSource.onopen = resolve;
      setTimeout(resolve, 2000); // Fallback
    });

    // Create import job (job-based endpoint)
    const form = new FormData();
    form.append('files', fs.createReadStream(testFile));

    const response = await fetch(`${API_BASE_URL}/api/v1/jobs/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    assert.strictEqual(response.ok, true);
    const jobData = (await response.json()) as any;
    const jobId = jobData.jobId;

    console.log(`📋 Created job: ${jobId}`);

    // Wait for SSE events (up to 30s)
    await new Promise((resolve) => setTimeout(resolve, 30000));

    eventSource.close();

    // Verify we received events
    assert.ok(receivedEvents.length > 0);

    // Verify events contain our job
    const ourJobEvents = receivedEvents.filter((evt) =>
      evt.jobs?.some((j: any) => j.jobId === jobId)
    );

    assert.ok(ourJobEvents.length > 0);

    // Verify status progression
    const statuses = ourJobEvents.flatMap((evt) =>
      evt.jobs?.filter((j: any) => j.jobId === jobId).map((j: any) => j.status)
    );

    console.log(`📊 Job status progression: ${statuses.join(' → ')}`);

    // Should have progressed through states
    assert.ok(statuses.includes('queued'));
    // Should eventually succeed or fail
    const hasTerminalStatus = statuses.some((s) => ['succeeded', 'failed'].includes(s));
    assert.strictEqual(hasTerminalStatus, true);
  }, 60000);

  test('should isolate SSE streams by account', async (_t) => {
    // Connect as admin
    const adminSseUrl = `${API_BASE_URL}/api/v1/stream/jobs?token=${adminToken}`;
    const adminEventSource = new EventSource(adminSseUrl);
    const adminEvents: any[] = [];

    adminEventSource.addEventListener('jobs.update', (event: any) => {
      adminEvents.push(JSON.parse(event.data));
    });

    // Connect as client
    const clientSseUrl = `${API_BASE_URL}/api/v1/stream/jobs?token=${clientToken}`;
    const clientEventSource = new EventSource(clientSseUrl);
    const clientEvents: any[] = [];

    clientEventSource.addEventListener('jobs.update', (event: any) => {
      clientEvents.push(JSON.parse(event.data));
    });

    // Wait for connections
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create job for admin account (using legacy endpoint for simplicity)
    const testFile = path.join(TEST_FILES_DIR, 'tiny.json');
    if (fs.existsSync(testFile)) {
      await uploadFile(testFile, adminToken);
    }

    // Wait for events
    await new Promise((resolve) => setTimeout(resolve, 10000));

    adminEventSource.close();
    clientEventSource.close();

    // Admin should have received events
    assert.ok(adminEvents.length > 0);

    // Client should NOT have received admin's job events
    // (They might receive their own events from other tests, but not admin's)
    const adminJobIds = new Set(
      adminEvents.flatMap((evt) => evt.jobs?.map((j: any) => j.jobId) || [])
    );

    const clientHasAdminJobs = clientEvents.some((evt) =>
      evt.jobs?.some((j: any) => adminJobIds.has(j.jobId))
    );

    assert.strictEqual(clientHasAdminJobs, false);

    console.log(`✅ SSE streams correctly isolated by account`);
  }, 30000);

  test('should handle SSE reconnection', async (_t) => {
    const sseUrl = `${API_BASE_URL}/api/v1/stream/jobs?token=${adminToken}`;
    let eventSource = new EventSource(sseUrl);
    let connectionCount = 0;

    eventSource.onopen = () => {
      connectionCount++;
      console.log(`📡 SSE connection ${connectionCount}`);
    };

    // Wait for initial connection
    await new Promise((resolve) => {
      const check = () => {
        if (connectionCount > 0) {
          resolve(true);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    assert.strictEqual(connectionCount, 1);

    // Close and reconnect
    eventSource.close();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      connectionCount++;
      console.log(`📡 SSE reconnection ${connectionCount}`);
    };

    // Wait for reconnection
    await new Promise((resolve) => setTimeout(resolve, 3000));

    eventSource.close();

    assert.strictEqual(connectionCount, 2);

    console.log(`✅ SSE reconnection successful`);
  }, 10000);
});
