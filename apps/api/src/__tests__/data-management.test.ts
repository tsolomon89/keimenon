/**
 * Data Management API Tests
 *
 * Tests for the data clearing endpoints with error handling and edge cases.
 *
 * Features tested:
 * - DELETE /api/v1/data/keimenon (clear current user's keimenon data)
 * - DELETE /api/v1/data/all-clients (admin only - clear all client data)
 * - GET /api/v1/data/stats (get keimenon data statistics)
 */

// Start test server before running tests
import './setup-global';

import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { SQLiteClient } from '@keimenon/db';
import { randomUUID } from 'crypto';
import path from 'path';
import os from 'os';
import { login } from './utils/test-helpers';
import bcrypt from 'bcrypt';

const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || os.homedir();
const DB_PATH = process.env.DB_PATH || path.join(HOME_DIR, '.keimenon', 'keimenon.db');

// Test credentials
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

describe('Data Management API', () => {
  let db: SQLiteClient;
  let adminToken: string;
  let adminAccountId: string;
  let adminUserId: string;

  beforeAll(async () => {
    // Initialize database connection
    db = new SQLiteClient({ databasePath: DB_PATH });
    await db.connect(); // Important: Must connect before use

    const sqliteDb = db.getDatabase();

    const ensureAdminAccount = (): { accountId: string; userId: string } => {
      const timestamp = Date.now();

      const accountRow = sqliteDb
        .prepare('SELECT id FROM accounts WHERE email = ?')
        .get(ADMIN_EMAIL) as { id: string } | undefined;

      const accountId = accountRow?.id ?? `acct_${randomUUID()}`;

      if (!accountRow) {
        sqliteDb
          .prepare(
            `INSERT INTO accounts (
              id, account_type, account_class, email, name,
              created_at, updated_at, allow_email_invites
            ) VALUES (?, 'admin', 'business', ?, 'System Admin', ?, ?, 1)`
          )
          .run(accountId, ADMIN_EMAIL, timestamp, timestamp);
      }

      const userRow = sqliteDb.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL) as
        | { id: string }
        | undefined;

      const userId = userRow?.id ?? `user_${randomUUID()}`;
      const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

      if (!userRow) {
        sqliteDb
          .prepare(
            `INSERT INTO users (
              id, email, password_hash, google_id, name, permission_level,
              user_class, is_active, created_at, updated_at,
              primary_account_id, last_login_account_id, global_preferences, email_verified
            ) VALUES (?, ?, ?, NULL, 'Admin', 'admin', 'person', 1, ?, ?, ?, ?, NULL, 1)`
          )
          .run(userId, ADMIN_EMAIL, passwordHash, timestamp, timestamp, accountId, accountId);
      } else {
        sqliteDb
          .prepare(
            `UPDATE users
             SET password_hash = ?,
                 primary_account_id = COALESCE(primary_account_id, ?),
                 last_login_account_id = COALESCE(last_login_account_id, ?),
                 email_verified = 1,
                 updated_at = ?
             WHERE id = ?`
          )
          .run(passwordHash, accountId, accountId, timestamp, userId);
      }

      const userAccountLink = sqliteDb
        .prepare('SELECT 1 FROM user_accounts WHERE user_id = ? AND account_id = ?')
        .get(userId, accountId);

      if (!userAccountLink) {
        sqliteDb
          .prepare(
            `INSERT INTO user_accounts (
              id, user_id, account_id, permission_level, role_rank, role_overrides,
              invited_by, status, invited_at, joined_at, last_accessed, created_at, updated_at
            ) VALUES (?, ?, ?, 'admin', 1, NULL, NULL, 'active', NULL, ?, NULL, ?, ?)`
          )
          .run(`ua_${randomUUID()}`, userId, accountId, timestamp, timestamp, timestamp);
      }

      return { accountId, userId };
    };

    const { accountId: ensuredAccountId } = ensureAdminAccount();

    // Login as admin
    try {
      const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
      console.log('🔍 Login response:', adminLogin); // DEBUG
      adminToken = adminLogin.token;
      adminAccountId = adminLogin.accountId || ensuredAccountId;
      adminUserId = adminLogin.userId;

      console.log('🔑 Admin authenticated');
      console.log(`   Account: ${adminAccountId}`);
      console.log(`   User: ${adminUserId}`);

      if (!adminAccountId) {
        throw new Error('adminAccountId is undefined - check test-helpers.ts login function');
      }
    } catch (err) {
      console.warn('⚠️  Admin login failed:', err);
      throw err;
    }
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
  });

  // Helper: Create test nodes for an account
  const createTestData = (accountId: string, userId: string, nodeCount: number = 5) => {
    const database = db.getDatabase();
    const now = Date.now();

    for (let i = 0; i < nodeCount; i++) {
      const nodeId = `node_${randomUUID()}`;
      database
        .prepare(
          `
        INSERT INTO nodes (
          id, account_id, kind, properties, created_by, created_at, updated_at, data_tag
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          nodeId,
          accountId,
          'ChatThread',
          JSON.stringify({ title: `Test Thread ${i + 1}` }),
          userId,
          now,
          now,
          'test' // Mark as test data
        );
    }

    console.log(`   Created ${nodeCount} test nodes for account ${accountId.substring(0, 8)}`);
  };

  // Helper: Get node count for an account
  const getNodeCount = (accountId: string): number => {
    const database = db.getDatabase();
    const result = database
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM nodes
      WHERE account_id = ?
        AND kind IN ('ChatThread', 'Message', 'Source', 'CodeBlock', 'Group', 'Folder')
    `
      )
      .get(accountId) as any;

    return result?.count || 0;
  };

  // Helper: Create deterministic export test node
  const createExportNode = (accountId: string, userId: string, nodeId: string, title: string) => {
    const database = db.getDatabase();
    const now = Date.now();

    database
      .prepare(
        `
      INSERT INTO nodes (
        id, account_id, kind, properties, created_by, created_at, updated_at, data_tag
      ) VALUES (?, ?, 'ChatThread', ?, ?, ?, ?, 'test')
    `
      )
      .run(nodeId, accountId, JSON.stringify({ title }), userId, now, now);
  };

  const createExportEdge = (
    accountId: string,
    userId: string,
    edgeId: string,
    fromId: string,
    toId: string
  ) => {
    const database = db.getDatabase();
    const now = Date.now();

    database
      .prepare(
        `
      INSERT INTO edges (
        id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
      ) VALUES (?, 'CONTAINS', ?, ?, ?, ?, ?, ?, 'test')
    `
      )
      .run(edgeId, fromId, toId, JSON.stringify({ weight: 1 }), accountId, userId, now);
  };

  test('should create test data successfully', () => {
    // Verify we have required IDs
    assert.ok(adminAccountId, 'adminAccountId should be set');
    assert.ok(adminUserId, 'adminUserId should be set');

    // Clean up first
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);

    // Create test data
    createTestData(adminAccountId, adminUserId, 3);

    // Verify
    const count = getNodeCount(adminAccountId);
    assert.strictEqual(count, 3, 'Should have created 3 nodes');

    console.log('✅ Test data creation verified');
  });

  test('should clear keimenon data via API', async () => {
    // Create test data
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);
    createTestData(adminAccountId, adminUserId, 5);

    // Verify data exists
    const beforeCount = getNodeCount(adminAccountId);
    assert.ok(beforeCount > 0, 'Should have nodes before deletion');

    console.log(`\n🗑️  Clearing ${beforeCount} nodes for admin`);

    // Clear data via API
    const response = await fetch(`${API_URL}/api/v1/data/keimenon`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(response.status, 200, 'Delete should return 200');

    const body = (await response.json()) as { success: boolean };
    assert.strictEqual(body.success, true, 'Response should indicate success');

    // Verify data deleted
    const afterCount = getNodeCount(adminAccountId);
    assert.strictEqual(afterCount, 0, 'All nodes should be deleted');

    console.log('✅ Data cleared successfully via API');
  });

  test('should handle empty database gracefully', async () => {
    // Ensure database is empty
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);

    // Try clearing again (should succeed with 0 items)
    const response = await fetch(`${API_URL}/api/v1/data/keimenon`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(response.status, 200, 'Should return 200 even when empty');

    const body = (await response.json()) as { success: boolean };
    assert.strictEqual(body.success, true, 'Should indicate success');

    console.log('✅ Empty database handled gracefully');
  });

  test('should require authentication', async () => {
    const response = await fetch(`${API_URL}/api/v1/data/keimenon`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(response.status, 401, 'Should return 401 without auth');

    console.log('✅ Authentication required');
  });
  test('should export JSON by default with backward-compatible payload shape', async () => {
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);

    createExportNode(adminAccountId, adminUserId, `export_json_${Date.now()}`, 'JSON Export Node');

    const response = await fetch(`${API_URL}/api/v1/data/export`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.strictEqual(response.status, 200, 'Export JSON should return 200');
    assert.ok(
      (response.headers.get('content-type') || '').includes('application/json'),
      'Content-Type should be JSON'
    );

    const body = (await response.json()) as any;
    assert.strictEqual(body.version, '1.0');
    assert.ok(typeof body.timestamp === 'string');
    assert.strictEqual(body.accountId, adminAccountId);
    assert.ok(Array.isArray(body.graph?.nodes), 'graph.nodes should be an array');
    assert.ok(Array.isArray(body.graph?.edges), 'graph.edges should be an array');
  });

  test('should export CSV when format=csv', async () => {
    const database = db.getDatabase();
    database.prepare('DELETE FROM edges WHERE account_id = ?').run(adminAccountId);
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);

    const sourceNodeId = `export_csv_source_${Date.now()}`;
    const targetNodeId = `export_csv_target_${Date.now()}`;
    const edgeId = `export_csv_edge_${Date.now()}`;

    createExportNode(adminAccountId, adminUserId, sourceNodeId, 'CSV Export Source');
    createExportNode(adminAccountId, adminUserId, targetNodeId, 'CSV Export Target');
    createExportEdge(adminAccountId, adminUserId, edgeId, sourceNodeId, targetNodeId);

    const response = await fetch(`${API_URL}/api/v1/data/export?format=csv`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.strictEqual(response.status, 200, 'Export CSV should return 200');
    assert.ok(
      (response.headers.get('content-type') || '').includes('text/csv'),
      'Content-Type should be CSV'
    );

    const csv = await response.text();
    assert.ok(csv.includes('record_type,id,kind,account_id'), 'CSV should include header row');
    assert.ok(csv.includes('node,'), 'CSV should include node records');
    assert.ok(csv.includes('source_id,target_id'), 'CSV should include canonical edge columns');
    assert.ok(
      csv.includes(`edge,${edgeId},CONTAINS,${adminAccountId},${sourceNodeId},${targetNodeId}`),
      'CSV edge rows should include non-empty source_id and target_id values'
    );
  });

  test('should export GraphML when format=graphml', async () => {
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);

    createExportNode(
      adminAccountId,
      adminUserId,
      `export_graphml_${Date.now()}`,
      'GraphML Export Node'
    );

    const response = await fetch(`${API_URL}/api/v1/data/export?format=graphml`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.strictEqual(response.status, 200, 'Export GraphML should return 200');
    assert.ok(
      (response.headers.get('content-type') || '').includes('application/graphml+xml'),
      'Content-Type should be GraphML'
    );

    const graphml = await response.text();
    assert.ok(graphml.includes('<graphml'), 'GraphML payload should include graphml root');
    assert.ok(graphml.includes('<graph id="keimenon-export"'), 'GraphML should include graph id');
  });

  test('should return 400 for unsupported export format', async () => {
    const response = await fetch(`${API_URL}/api/v1/data/export?format=xml`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.strictEqual(response.status, 400, 'Invalid format should return 400');
    const body = (await response.json()) as any;
    assert.strictEqual(body.error, 'Invalid export format');
  });

  test('should require authentication for export endpoint', async () => {
    const response = await fetch(`${API_URL}/api/v1/data/export`, {
      method: 'GET',
    });

    assert.strictEqual(response.status, 401, 'Export should return 401 without auth');
  });

  test('should export only current account data (account isolation)', async () => {
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);

    const accountBEmail = `export-isolation-${Date.now()}@example.com`;
    const accountBPassword = `S3curePass!${Date.now()}Aa`;

    const registerResponse = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: accountBEmail,
        password: accountBPassword,
        name: 'Export Isolation Account',
        accountType: 'client',
      }),
    });

    assert.strictEqual(registerResponse.status, 201, 'Account B registration should succeed');
    const registerData = (await registerResponse.json()) as any;
    const accountBId = registerData?.account?.id;
    assert.ok(accountBId, 'Account B ID should exist');

    const accountBUserRow = database
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(accountBEmail) as { id: string } | undefined;
    assert.ok(accountBUserRow?.id, 'Account B user should exist');

    const adminNodeId = `admin_export_${Date.now()}`;
    const accountBNodeId = `account_b_export_${Date.now()}`;
    createExportNode(adminAccountId, adminUserId, adminNodeId, 'Admin Export Node');
    createExportNode(accountBId, accountBUserRow!.id, accountBNodeId, 'Account B Export Node');

    const response = await fetch(`${API_URL}/api/v1/data/export`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.strictEqual(response.status, 200, 'Export should return 200');
    const body = (await response.json()) as any;
    const exportedNodeIds = new Set((body.graph?.nodes || []).map((node: any) => node.id));

    assert.ok(exportedNodeIds.has(adminNodeId), 'Admin node should be exported');
    assert.ok(!exportedNodeIds.has(accountBNodeId), 'Other account node must not be exported');
    assert.ok(
      (body.graph?.nodes || []).every((node: any) => node.account_id === adminAccountId),
      'All exported nodes must belong to current account'
    );
    assert.ok(
      (body.graph?.edges || []).every((edge: any) => edge.account_id === adminAccountId),
      'All exported edges must belong to current account'
    );

    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(accountBId);
    database.prepare('DELETE FROM user_accounts WHERE account_id = ?').run(accountBId);
    database.prepare('DELETE FROM users WHERE id = ?').run(accountBUserRow!.id);
    database.prepare('DELETE FROM accounts WHERE id = ?').run(accountBId);
  });
});
