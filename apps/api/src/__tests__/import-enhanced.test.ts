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
import { login, createImportJob, waitForJobCompletion } from './utils/test-helpers';

const TEST_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../test-import-enhanced.db');
const SHOULD_DELETE_TEST_DB = !process.env.DB_PATH;
const getApiBaseUrl = (): string => process.env.TEST_API_URL || 'http://localhost:4001';
const getFixturePath = (filename: string) => path.join(__dirname, 'fixtures', filename);
const ADMIN_PASSWORD = 'adminpass123';
const CLIENT_PASSWORD = 'clientpass123';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNodeProperties(row: { properties?: unknown } | undefined): Record<string, any> {
  if (!row) {
    return {};
  }
  if (typeof row.properties === 'string') {
    return JSON.parse(row.properties);
  }
  if (row.properties && typeof row.properties === 'object') {
    return row.properties as Record<string, any>;
  }
  return {};
}

function buildSingleConversationFixture(
  title: string,
  userContent: string,
  assistantContent: string
): unknown[] {
  const base = randomUUID().replace(/-/g, '');
  const systemId = `sys_${base}`;
  const userId = `usr_${base}`;
  const assistantId = `ast_${base}`;

  return [
    {
      title,
      create_time: 1700000000,
      update_time: 1700000010,
      mapping: {
        [systemId]: {
          id: systemId,
          message: {
            id: systemId,
            author: { role: 'system', name: null, metadata: {} },
            create_time: 1700000000,
            update_time: null,
            content: { content_type: 'text', parts: [''] },
            status: 'finished_successfully',
            end_turn: true,
            weight: 0,
            metadata: {},
            recipient: 'all',
          },
          parent: null,
          children: [userId],
        },
        [userId]: {
          id: userId,
          message: {
            id: userId,
            author: { role: 'user', name: null, metadata: {} },
            create_time: 1700000001,
            update_time: null,
            content: { content_type: 'text', parts: [userContent] },
            status: 'finished_successfully',
            end_turn: true,
            weight: 1,
            metadata: {},
            recipient: 'all',
          },
          parent: systemId,
          children: [assistantId],
        },
        [assistantId]: {
          id: assistantId,
          message: {
            id: assistantId,
            author: { role: 'assistant', name: null, metadata: {} },
            create_time: 1700000002,
            update_time: null,
            content: { content_type: 'text', parts: [assistantContent] },
            status: 'finished_successfully',
            end_turn: true,
            weight: 1,
            metadata: {},
            recipient: 'all',
          },
          parent: userId,
          children: [],
        },
      },
    },
  ];
}

function writeFixtureFile(payload: unknown, namePrefix: string): string {
  const filePath = path.join(path.dirname(TEST_DB_PATH), `${namePrefix}-${randomUUID()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return filePath;
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
    console.log('â³ Setting up test database and accounts...');

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

    console.log('âœ… Test setup complete');
  });

  afterAll(async () => {
    console.log('ðŸ§¹ Cleaning up test database...');
    if (db) {
      await db.disconnect();
    }
    if (SHOULD_DELETE_TEST_DB && fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    console.log('âœ… Cleanup complete');
  });

  it('should import data with authentication and create organizational structure', async () => {
    const testFilePath = getFixturePath('tiny.json');

    if (!fs.existsSync(testFilePath)) {
      console.warn(`[WARN] Test file not found: ${testFilePath}, skipping test`);
      return;
    }

    console.log('ðŸ“ Uploading test file as admin...');

    const { jobId } = await createImportJob(testFilePath, adminToken, {
      extraction: { includeUser: true, includeAssistant: true },
      minMessageLength: 0,
      processingMode: 'automatic',
      branches: 'merged',
    });

    assert.ok(jobId, 'Response should include jobId');

    const job = await waitForJobCompletion(jobId, adminToken);
    assert.strictEqual(job.state.status, 'succeeded', 'Import job should succeed');

    // Verify ConversationThread nodes have account_id
    const conversationThreads = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'ConversationThread' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(conversationThreads.length > 0, 'ConversationThread nodes should be created');

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

    // Verify Group nodes created
    const groups = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'Group' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(groups.length > 0, 'Group nodes should be created');

    // Verify IN_GROUP edges link Source members to Groups
    const inGroupEdges = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM edges
      WHERE kind = 'IN_GROUP' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(inGroupEdges.length > 0, 'IN_GROUP edges should be created');

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
    console.log(`   âœ“ Created ${containsEdges.length} CONTAINS edges`);

    console.log('âœ… All organizational structure verified');
  });

  it('should verify tenant isolation between admin and client accounts', async () => {
    // Verify admin has their data
    const adminChatThreads = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'ConversationThread' AND account_id = ?
    `
      )
      .all(adminAccountId);
    assert.ok(adminChatThreads.length > 0, 'Admin should have ConversationThread nodes');

    // Verify no cross-contamination (admin data created by admin user only)
    const crossContamination = db
      .getDatabase()
      .prepare(
        `
      SELECT * FROM nodes
      WHERE kind = 'ConversationThread'
        AND account_id = ?
        AND created_by != ?
    `
      )
      .all(adminAccountId, adminUserId);
    assert.strictEqual(crossContamination.length, 0, 'No cross-contamination should exist');

    console.log('âœ… Tenant isolation verified');
  });

  it('should return folders/groups via navigation API', async () => {
    console.log('ðŸ” Querying navigation API...');

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

    console.log(`âœ… Navigation API returns ${data.groups.length} items (including folder)`);
  });

  it('should fetch group members for a specific group', async () => {
    console.log('ðŸ” Testing group member fetching...');

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

    // Verify node IDs are Source nodes
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
    assert.strictEqual(node.kind, 'Source', 'Node should be a Source');

    console.log(`âœ… Successfully fetched ${membersData.node_ids.length} member(s) from group`);
  });

  it('[Job-Based] should create import job instead of processing synchronously', async () => {
    console.log('ðŸ“‹ Testing job-based import endpoint...');

    const testFilePath = getFixturePath('tiny.json');

    if (!fs.existsSync(testFilePath)) {
      console.warn(`[WARN] Test file not found: ${testFilePath}, skipping test`);
      return;
    }

    const { jobId } = await createImportJob(testFilePath, adminToken, {
      extractCode: true,
      codeSettings: {
        minLength: 50,
      },
    });

    assert.ok(jobId, 'Response should include jobId');

    // Wait for the job to complete to verify config fidelity
    const job = await waitForJobCompletion(jobId, adminToken);

    assert.strictEqual(job.type, 'import', 'Job type should be import');
    assert.ok(job.config.files, 'Job config should include files');
    assert.strictEqual(job.config.files.length, 1, 'Should have one file');
    assert.ok(job.config.files[0].fileName.includes('tiny.json'), 'File name should be preserved');

    console.log(`âœ… Job created: ${jobId}`);
    console.log(`   Status: ${job.state.status}`);
    console.log(`   Files: ${job.config.files.length}`);
  });

  it('[Job-Based] should process import job and verify completion', async () => {
    console.log('ðŸ“‹ Testing job execution and completion...');

    const testFilePath = getFixturePath('tiny.json');

    if (!fs.existsSync(testFilePath)) {
      console.warn(`[WARN] Test file not found: ${testFilePath}, skipping test`);
      return;
    }

    // Create job
    const { jobId } = await createImportJob(testFilePath, adminToken);
    assert.ok(jobId, 'Job creation should return jobId');

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

    console.log(`âœ… Job completed successfully`);
    console.log(`   Duration: ${Date.now() - startTime}ms`);
    console.log(`   Status: ${job.state.status}`);
  });

  it('[Fidelity] should materialize separate role branches with discourse lineage', async () => {
    const title = `Branch Fidelity ${Date.now()}`;
    const fixturePath = writeFixtureFile(
      buildSingleConversationFixture(
        title,
        'User branch message for deterministic branch test.',
        'Assistant branch response for deterministic branch test.'
      ),
      'branch-fidelity'
    );

    try {
      const { jobId } = await createImportJob(fixturePath, adminToken, {
        extraction: { includeUser: true, includeAssistant: true },
        minMessageLength: 0,
        processingMode: 'automatic',
        branches: 'separate',
        extractCode: false,
        codeSettings: {
          minLength: 0,
          languages: [],
          groupBy: 'language',
          deduplicate: true,
          sourceHandling: 'keep_inline',
        },
      });

      assert.ok(jobId, 'Job creation should return jobId');
      const job = await waitForJobCompletion(jobId, adminToken);
      assert.strictEqual(job.state.status, 'succeeded', 'Branch fidelity import should succeed');

      const conversationRows = db
        .getDatabase()
        .prepare(
          `SELECT id, properties FROM nodes WHERE kind = 'ConversationThread' AND account_id = ?`
        )
        .all(adminAccountId) as Array<{ id: string; properties: string }>;
      const conversation = conversationRows.find((row) => parseNodeProperties(row).title === title);
      assert.ok(conversation, 'Expected imported conversation thread to exist');

      const conversationId = conversation!.id;
      const sourceRows = db
        .getDatabase()
        .prepare(`SELECT id, properties FROM nodes WHERE kind = 'Source' AND account_id = ?`)
        .all(adminAccountId) as Array<{ id: string; properties: string }>;

      const branchSources = sourceRows.filter(
        (row) => parseNodeProperties(row).metadata?.conversation_id === conversationId
      );
      assert.strictEqual(
        branchSources.length,
        2,
        'Separate branch mode should materialize user and assistant sources'
      );

      const branches = branchSources
        .map((row) => String(parseNodeProperties(row).metadata?.branch || ''))
        .sort();
      assert.deepStrictEqual(branches, ['assistant', 'user']);
      assert.ok(
        branchSources.every(
          (row) => parseNodeProperties(row).metadata?.branches_mode === 'separate'
        ),
        'Every source should record branches_mode=separate'
      );

      const userSource = branchSources.find(
        (row) => parseNodeProperties(row).metadata?.branch === 'user'
      );
      const assistantSource = branchSources.find(
        (row) => parseNodeProperties(row).metadata?.branch === 'assistant'
      );
      assert.ok(userSource && assistantSource, 'Expected both user and assistant branch sources');

      const discourseEdge = db
        .getDatabase()
        .prepare(
          `
          SELECT id
          FROM edges
          WHERE kind = 'DISCOURSE'
            AND account_id = ?
            AND (
              (from_id = ? AND to_id = ?)
              OR (from_id = ? AND to_id = ?)
            )
        `
        )
        .get(
          adminAccountId,
          userSource!.id,
          assistantSource!.id,
          assistantSource!.id,
          userSource!.id
        );

      assert.ok(discourseEdge, 'Separate branch mode should create discourse lineage edge');
    } finally {
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
    }
  });

  it('[Fidelity] should keep raw messages invariant while applying sourceHandling modes', async () => {
    const userWithCode =
      'Shared raw message with code.\n```ts\nconst fidelity = 42;\n```\nCode block should remain in raw.';
    const assistantReply = 'Assistant response for source handling fidelity.';

    const importWithMode = async (
      title: string,
      sourceHandling: 'keep_inline' | 'extract_and_remove'
    ): Promise<{ sourceId: string; userMessageId: string }> => {
      const fixturePath = writeFixtureFile(
        buildSingleConversationFixture(title, userWithCode, assistantReply),
        `source-handling-${sourceHandling}`
      );

      try {
        const { jobId } = await createImportJob(fixturePath, adminToken, {
          extraction: { includeUser: true, includeAssistant: true },
          minMessageLength: 0,
          processingMode: 'automatic',
          branches: 'merged',
          extractCode: true,
          codeSettings: {
            minLength: 0,
            languages: ['ts'],
            groupBy: 'language',
            deduplicate: true,
            sourceHandling,
          },
        });

        const job = await waitForJobCompletion(jobId, adminToken);
        assert.strictEqual(
          job.state.status,
          'succeeded',
          `${sourceHandling} import should succeed`
        );

        const conversationRows = db
          .getDatabase()
          .prepare(
            `SELECT id, properties FROM nodes WHERE kind = 'ConversationThread' AND account_id = ?`
          )
          .all(adminAccountId) as Array<{ id: string; properties: string }>;
        const conversation = conversationRows.find(
          (row) => parseNodeProperties(row).title === title
        ) as { id: string; properties: string } | undefined;
        assert.ok(conversation, `Expected conversation thread for ${sourceHandling}`);

        const conversationId = conversation!.id;
        const sourceRows = db
          .getDatabase()
          .prepare(`SELECT id, properties FROM nodes WHERE kind = 'Source' AND account_id = ?`)
          .all(adminAccountId) as Array<{ id: string; properties: string }>;
        const source = sourceRows.find(
          (row) => parseNodeProperties(row).metadata?.conversation_id === conversationId
        );
        assert.ok(source, `Expected merged source node for ${sourceHandling}`);

        const messageRows = db
          .getDatabase()
          .prepare(`SELECT id, properties FROM nodes WHERE kind = 'Message' AND account_id = ?`)
          .all(adminAccountId) as Array<{ id: string; properties: string }>;
        const userMessage = messageRows.find((row) => {
          const props = parseNodeProperties(row);
          return props.thread_id === conversationId && props.role === 'user';
        });
        assert.ok(userMessage, `Expected raw user message node for ${sourceHandling}`);

        return {
          sourceId: source!.id,
          userMessageId: userMessage!.id,
        };
      } finally {
        if (fs.existsSync(fixturePath)) {
          fs.unlinkSync(fixturePath);
        }
      }
    };

    const keepInline = await importWithMode(
      `Source Handling Keep Inline ${Date.now()}`,
      'keep_inline'
    );
    const extractAndRemove = await importWithMode(
      `Source Handling Extract Remove ${Date.now()}`,
      'extract_and_remove'
    );

    const inlineSourceContent = await fetchJsonWithRetry(
      `${getApiBaseUrl()}/api/v1/content/source/${keepInline.sourceId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      200
    );
    const extractedSourceContent = await fetchJsonWithRetry(
      `${getApiBaseUrl()}/api/v1/content/source/${extractAndRemove.sourceId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      200
    );

    assert.ok(
      String(inlineSourceContent.data.content).includes('```ts'),
      'keep_inline source should retain fenced code'
    );
    assert.ok(
      !String(extractedSourceContent.data.content).includes('```'),
      'extract_and_remove source should remove fenced code from derived content'
    );

    const inlineSourceRow = db
      .getDatabase()
      .prepare(`SELECT properties FROM nodes WHERE id = ? AND account_id = ?`)
      .get(keepInline.sourceId, adminAccountId) as { properties: string };
    const extractedSourceRow = db
      .getDatabase()
      .prepare(`SELECT properties FROM nodes WHERE id = ? AND account_id = ?`)
      .get(extractAndRemove.sourceId, adminAccountId) as { properties: string };

    const inlineSourceProps = parseNodeProperties(inlineSourceRow);
    const extractedSourceProps = parseNodeProperties(extractedSourceRow);
    assert.deepStrictEqual(
      inlineSourceProps.metadata?.code_removed_ranges || [],
      [],
      'keep_inline should not emit removed code ranges'
    );
    assert.ok(
      Array.isArray(extractedSourceProps.metadata?.code_removed_ranges) &&
        extractedSourceProps.metadata.code_removed_ranges.length > 0,
      'extract_and_remove should emit removed code ranges'
    );

    const inlineRawMessage = await fetchJsonWithRetry(
      `${getApiBaseUrl()}/api/v1/content/message/${keepInline.userMessageId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      200
    );
    const extractedRawMessage = await fetchJsonWithRetry(
      `${getApiBaseUrl()}/api/v1/content/message/${extractAndRemove.userMessageId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      200
    );

    assert.ok(
      String(inlineRawMessage.data.content).includes('```ts'),
      'Raw message content should preserve fenced code in keep_inline import'
    );
    assert.ok(
      String(extractedRawMessage.data.content).includes('```ts'),
      'Raw message content should preserve fenced code in extract_and_remove import'
    );
    assert.strictEqual(
      inlineRawMessage.data.content,
      extractedRawMessage.data.content,
      'Raw content must remain invariant across sourceHandling modes'
    );
  });
});
