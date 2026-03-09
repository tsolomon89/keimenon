/**
 * Integration Tests for Import-Enhanced Endpoint
 *
 * Tests the /api/v1/jobs/import endpoint with authentication,
 * organizational structure creation, and multi-tenant isolation.
 *
 * NOTE: This test requires the API server to be running on port 4001.
 * Run: npm run dev (in apps/api)
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import { SQLiteClient } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { login } from './utils/test-helpers';

const TEST_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../test-import-enhanced.db');
const SHOULD_DELETE_TEST_DB = !process.env.DB_PATH;
const getApiBaseUrl = (): string => process.env.TEST_API_URL || 'http://localhost:4001';
const getFixturePath = (filename: string) => path.join(__dirname, 'fixtures', filename);
const ADMIN_PASSWORD = 'adminpass123';
const CLIENT_PASSWORD = 'clientpass123';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  url: string,
  init: any,
  expectedStatus: number,
  maxAttempts = 3
): Promise<{ status: number; data: any }> {
  let lastStatus = 0;
  let lastData: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, init);
    const contentType = response.headers.get('content-type') || '';

    let data: any = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    lastStatus = response.status;
    lastData = data;

    if (response.status === expectedStatus) {
      return { status: response.status, data };
    }

    const retryable = response.status >= 500 || response.status === 429;
    if (!retryable || attempt === maxAttempts) {
      break;
    }

    await sleep(200 * attempt);
  }

  return { status: lastStatus, data: lastData };
}

async function postMultipartWithRetry(
  url: string,
  token: string,
  expectedStatus: number,
  buildForm: () => FormData,
  maxAttempts = 3
): Promise<{ status: number; data: any }> {
  let lastStatus = 0;
  let lastData: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const form = buildForm();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      body: form as any,
    });

    const contentType = response.headers.get('content-type') || '';
    let data: any = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    lastStatus = response.status;
    lastData = data;

    if (response.status === expectedStatus) {
      return { status: response.status, data };
    }

    const retryable = response.status >= 500 || response.status === 429;
    if (!retryable || attempt === maxAttempts) {
      break;
    }

    await sleep(250 * attempt);
  }

  return { status: lastStatus, data: lastData };
}

describe('Import-Enhanced Integration Tests', () => {
  let db: SQLiteClient;
  let authService: AuthService;
  let adminAccountId: string;
  let clientAccountId: string;
  let adminUserId: string;
  let clientUserId: string;
  let adminToken: string;
  let clientToken: string;

  beforeAll(async () => {
    console.log('⏳ Setting up test database and accounts...');

    // Setup test database
    if (SHOULD_DELETE_TEST_DB && fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    db = new SQLiteClient({ databasePath: TEST_DB_PATH });
    await db.connect();
    db.enableDirectWrites();
    authService = new AuthService(db);

    // Create admin account
    adminAccountId = randomUUID();
    const adminNow = Date.now();
    db.getDatabase()
      .prepare(
        `
      INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(adminAccountId, 'admin', 'business', 'admin@test.com', 'Admin Test', adminNow, adminNow);

    // Create admin user
    adminUserId = randomUUID();
    const adminPasswordHash = await authService.hashPassword(ADMIN_PASSWORD);
    db.getDatabase()
      .prepare(
        `
      INSERT INTO users (
        id, email, password_hash, google_id, name, permission_level, user_class, is_active,
        created_at, updated_at, primary_account_id, last_login_account_id, email_verified
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        adminUserId,
        'admin@test.com',
        adminPasswordHash,
        null,
        'Admin User',
        'admin',
        'person',
        1,
        adminNow,
        adminNow,
        adminAccountId,
        adminAccountId,
        1
      );
    db.getDatabase()
      .prepare(
        `
      INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        randomUUID(),
        adminUserId,
        adminAccountId,
        'admin',
        4,
        'active',
        adminNow,
        adminNow,
        adminNow
      );

    // Create client account
    clientAccountId = randomUUID();
    const clientNow = Date.now();
    db.getDatabase()
      .prepare(
        `
      INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        clientAccountId,
        'client',
        'free',
        'client@test.com',
        'Client Test',
        clientNow,
        clientNow
      );

    // Create client user
    clientUserId = randomUUID();
    const clientPasswordHash = await authService.hashPassword(CLIENT_PASSWORD);
    db.getDatabase()
      .prepare(
        `
      INSERT INTO users (
        id, email, password_hash, google_id, name, permission_level, user_class, is_active,
        created_at, updated_at, primary_account_id, last_login_account_id, email_verified
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        clientUserId,
        'client@test.com',
        clientPasswordHash,
        null,
        'Client User',
        'junior',
        'person',
        1,
        clientNow,
        clientNow,
        clientAccountId,
        clientAccountId,
        1
      );
    db.getDatabase()
      .prepare(
        `
      INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        randomUUID(),
        clientUserId,
        clientAccountId,
        'junior',
        1,
        'active',
        clientNow,
        clientNow,
        clientNow
      );

    // Use server-issued tokens so JWT/session handling always matches runtime behavior.
    const adminLogin = await login('admin@test.com', ADMIN_PASSWORD);
    adminToken = adminLogin.token;
    assert.strictEqual(
      adminLogin.accountId,
      adminAccountId,
      'Admin should resolve to seeded account'
    );
    assert.strictEqual(adminLogin.userId, adminUserId, 'Admin should resolve to seeded user');

    const clientLogin = await login('client@test.com', CLIENT_PASSWORD);
    clientToken = clientLogin.token;
    assert.strictEqual(
      clientLogin.accountId,
      clientAccountId,
      'Client should resolve to seeded account'
    );
    assert.strictEqual(clientLogin.userId, clientUserId, 'Client should resolve to seeded user');

    console.log('✅ Test setup complete');
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up test database...');
    if (db) {
      await db.disconnect();
    }
    if (SHOULD_DELETE_TEST_DB && fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    console.log('✅ Cleanup complete');
  });

  it('should import data with authentication and create organizational structure', async () => {
    const testFilePath = getFixturePath('tiny.json');

    if (!fs.existsSync(testFilePath)) {
      console.warn(`⚠️  Test file not found: ${testFilePath}, skipping test`);
      return;
    }

    console.log('📁 Uploading test file as admin...');

    const { status, data } = await postMultipartWithRetry(
      `${getApiBaseUrl()}/api/v1/jobs/import`,
      adminToken,
      200,
      () => {
        const form = new FormData();
        form.append('files', fs.createReadStream(testFilePath), 'tiny.json');
        form.append('config', JSON.stringify({ export_code: true }));
        return form;
      }
    );

    assert.strictEqual(status, 200, 'Import should succeed with 200 status');
    assert.ok(data.success, 'Response should indicate success');
    assert.ok(data.results, 'Response should include results');
    assert.ok(data.results.length > 0, 'Results should have at least one entry');

    console.log(`✅ Import successful: ${data.results.length} file(s) processed`);

    // Verify ChatThread nodes have account_id
    const chatThreads = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'ChatThread' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(chatThreads.length > 0, 'ChatThread nodes should be created');
    console.log(`   ✓ Created ${chatThreads.length} ChatThread nodes`);

    // Verify Message nodes have account_id
    const messages = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'Message' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(messages.length > 0, 'Message nodes should be created');
    console.log(`   ✓ Created ${messages.length} Message nodes`);

    // Verify Folder node created
    const folders = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'Folder' AND account_id = ?
    `
      )
      .all(adminAccountId) as any[];
    assert.strictEqual(folders.length, 1, 'Exactly one Folder should be created');
    const folderProps = JSON.parse(folders[0].properties);
    const folderMetadata =
      typeof folderProps.properties === 'string'
        ? JSON.parse(folderProps.properties)
        : folderProps.properties || folderProps;
    assert.strictEqual(
      folderMetadata.name,
      'Imported Conversations',
      'Folder should be named "Imported Conversations"'
    );
    console.log(`   ✓ Created folder: "${folderMetadata.name}"`);

    // Verify Group nodes created (one per conversation)
    const groups = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'Group' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.strictEqual(
      groups.length,
      chatThreads.length,
      'One Group should be created per ChatThread'
    );
    console.log(`   ✓ Created ${groups.length} Group nodes`);

    // Verify IN_GROUP edges link ChatThreads to Groups
    const inGroupEdges = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM edges
      WHERE kind = 'IN_GROUP' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.strictEqual(
      inGroupEdges.length,
      chatThreads.length,
      'Each ChatThread should have an IN_GROUP edge'
    );
    console.log(`   ✓ Created ${inGroupEdges.length} IN_GROUP edges`);

    // Verify FOLDS_INTO_FOLDER edges link Groups to Folder
    const foldsEdges = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM edges
      WHERE kind = 'FOLDS_INTO_FOLDER' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.strictEqual(foldsEdges.length, groups.length, 'Each Group should fold into the Folder');
    console.log(`   ✓ Created ${foldsEdges.length} FOLDS_INTO_FOLDER edges`);

    // Verify CONTAINS edges have account_id
    const containsEdges = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM edges
      WHERE kind = 'CONTAINS' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(containsEdges.length > 0, 'CONTAINS edges should be created');
    console.log(`   ✓ Created ${containsEdges.length} CONTAINS edges`);

    console.log('✅ All organizational structure verified');
  });

  it('should verify tenant isolation between admin and client accounts', async () => {
    // Verify admin has their data
    const adminChatThreads = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'ChatThread' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(adminChatThreads.length > 0, 'Admin should have ChatThreads');

    // Verify no cross-contamination (admin data created by admin user only)
    const crossContamination = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'ChatThread'
        AND account_id = ?
        AND created_by != ?
    `
      )
      .all(adminAccountId, adminUserId);
    assert.strictEqual(crossContamination.length, 0, 'No cross-contamination should exist');

    console.log('✅ Tenant isolation verified');
  });

  it('should return folders/groups via navigation API', async () => {
    console.log('🔍 Querying navigation API...');

    const { status, data } = await fetchJsonWithRetry(
      `${getApiBaseUrl()}/api/v1/groups`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      },
      200
    );

    assert.strictEqual(status, 200, 'Navigation API should return 200');
    assert.ok(data.success, 'Response should indicate success');
    assert.ok(data.groups, 'Response should include groups');
    assert.ok(data.groups.length > 0, 'Groups array should not be empty');

    // Verify folder structure
    const folder = data.groups.find((g: any) => g.kind === 'Folder');
    if (folder) {
      assert.ok(folder.badge > 0, 'Folder should have children (badge > 0)');
    }

    console.log(`✅ Navigation API returns ${data.groups.length} items (including folder)`);
  });

  it('should fetch group members for a specific group', async () => {
    console.log('🔍 Testing group member fetching...');

    // Get groups for admin account
    const groupsResult = await fetchJsonWithRetry(
      `${getApiBaseUrl()}/api/v1/groups`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      },
      200
    );

    assert.strictEqual(groupsResult.status, 200, 'Should fetch groups');
    const groupsData: any = groupsResult.data;
    assert.ok(Array.isArray(groupsData.groups), 'groups should be an array');

    const folder = groupsData.groups.find((g: any) => g.kind === 'Folder');
    let group: any = null;

    if (folder) {
      const childrenResult = await fetchJsonWithRetry(
        `${getApiBaseUrl()}/api/v1/groups/${folder.id}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        200
      );

      assert.strictEqual(childrenResult.status, 200, 'Should fetch folder children');
      const childrenData: any = childrenResult.data;
      assert.ok(childrenData.children, 'Should have children array');
      group = childrenData.children.find((c: any) => c.kind === 'Group');
    }

    if (!group) {
      group = groupsData.groups.find((g: any) => g.kind === 'Group');
    }

    assert.ok(group, 'Group should exist');

    // Fetch group members (node IDs)
    const membersResult = await fetchJsonWithRetry(
      `${getApiBaseUrl()}/api/v1/groups/${group.id}/nodes`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      },
      200
    );

    assert.strictEqual(membersResult.status, 200, 'Should fetch group members');
    const membersData: any = membersResult.data;
    assert.ok(membersData.success, 'Response should indicate success');
    assert.ok(membersData.node_ids, 'Should have node_ids array');
    assert.ok(membersData.node_ids.length > 0, 'Node IDs should not be empty');

    // Verify node IDs are ChatThread nodes
    const nodeId = membersData.node_ids[0];
    const node = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes WHERE id = ? AND account_id = ?
    `
      )
      .get(nodeId, adminAccountId) as any;
    assert.ok(node, 'Node should exist in database');
    assert.strictEqual(node.kind, 'ChatThread', 'Node should be a ChatThread');

    console.log(`✅ Successfully fetched ${membersData.node_ids.length} member(s) from group`);
  });

  it('[Job-Based] should create import job instead of processing synchronously', async () => {
    console.log('📋 Testing job-based import endpoint...');

    const testFilePath = getFixturePath('tiny.json');

    if (!fs.existsSync(testFilePath)) {
      console.warn(`⚠️  Test file not found: ${testFilePath}, skipping test`);
      return;
    }

    const { status, data } = await postMultipartWithRetry(
      `${getApiBaseUrl()}/api/v1/jobs/import`,
      adminToken,
      201,
      () => {
        const form = new FormData();
        form.append('files', fs.createReadStream(testFilePath), 'tiny.json');
        form.append(
          'config',
          JSON.stringify({
            exportCode: true,
            codeMinChars: 50,
          })
        );
        return form;
      }
    );

    assert.strictEqual(status, 201, 'Job creation should return 201');

    assert.ok(data.success, 'Response should indicate success');
    assert.ok(data.jobId, 'Response should include jobId');
    assert.strictEqual(data.job.type, 'import', 'Job type should be import');
    assert.strictEqual(data.job.state.status, 'queued', 'Initial status should be queued');
    assert.ok(data.job.config.files, 'Job config should include files');
    assert.strictEqual(data.job.config.files.length, 1, 'Should have one file');
    assert.ok(
      data.job.config.files[0].fileName.includes('tiny.json'),
      'File name should be preserved'
    );

    console.log(`✅ Job created: ${data.jobId}`);
    console.log(`   Status: ${data.job.state.status}`);
    console.log(`   Files: ${data.job.config.files.length}`);
  });

  it('[Job-Based] should process import job and verify completion', async () => {
    console.log('📋 Testing job execution and completion...');

    const testFilePath = getFixturePath('tiny.json');

    if (!fs.existsSync(testFilePath)) {
      console.warn(`⚠️  Test file not found: ${testFilePath}, skipping test`);
      return;
    }

    // Create job
    const createResult = await postMultipartWithRetry(
      `${getApiBaseUrl()}/api/v1/jobs/import`,
      adminToken,
      201,
      () => {
        const form = new FormData();
        form.append('files', fs.createReadStream(testFilePath), 'tiny.json');
        return form;
      }
    );

    assert.strictEqual(createResult.status, 201, 'Job creation should return 201');
    const createData: any = createResult.data;
    const jobId = createData.jobId;

    console.log(`   Job created: ${jobId}`);

    // Poll for completion (wait up to 30 seconds)
    const startTime = Date.now();
    let job: any = null;

    while (Date.now() - startTime < 30000) {
      const statusResult = await fetchJsonWithRetry(
        `${getApiBaseUrl()}/api/v1/jobs/${jobId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        },
        200
      );

      const statusData: any = statusResult.data;
      job = statusData?.job ?? null;

      if (job?.state && ['succeeded', 'failed'].includes(job.state.status)) {
        break;
      }

      // Wait 500ms before next check
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    assert.ok(job, 'Job should be found');
    assert.strictEqual(job.state.status, 'succeeded', 'Job should succeed');
    assert.strictEqual(job.progress.percent, 100, 'Progress should be 100%');

    console.log(`✅ Job completed successfully`);
    console.log(`   Duration: ${Date.now() - startTime}ms`);
    console.log(`   Status: ${job.state.status}`);
  });
});
