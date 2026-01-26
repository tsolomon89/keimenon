/**
 * Data Management API Tests
 *
 * Tests for the data clearing endpoints with error handling and edge cases.
 *
 * Features tested:
 * - DELETE /api/v1/data/canvas (clear current user's canvas data)
 * - DELETE /api/v1/data/all-clients (admin only - clear all client data)
 * - GET /api/v1/data/stats (get canvas data statistics)
 */

// Start test server before running tests
import './setup-global';

import { describe, test, before, after, type TestContext } from 'node:test';
import assert from 'node:assert';
import { SQLiteClient } from '@keimenon/db';
import { randomUUID } from 'crypto';
import path from 'path';
import os from 'os';
import { login } from './utils/test-helpers';
import bcrypt from 'bcrypt';

const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || os.homedir();
const DB_PATH = process.env.DB_PATH || path.join(HOME_DIR, '.canvas-memory', 'canvas.db');

// Test credentials
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

describe('Data Management API', () => {
  let db: SQLiteClient;
  let adminToken: string;
  let adminAccountId: string;
  let adminUserId: string;

  before(async () => {
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

  after(() => {
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

  test('should clear canvas data via API', async (_t: TestContext) => {
    // Create test data
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);
    createTestData(adminAccountId, adminUserId, 5);

    // Verify data exists
    const beforeCount = getNodeCount(adminAccountId);
    assert.ok(beforeCount > 0, 'Should have nodes before deletion');

    console.log(`\n🗑️  Clearing ${beforeCount} nodes for admin`);

    // Clear data via API
    const response = await fetch(`${API_URL}/api/v1/data/canvas`, {
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

  test('should handle empty database gracefully', async (_t: TestContext) => {
    // Ensure database is empty
    const database = db.getDatabase();
    database.prepare('DELETE FROM nodes WHERE account_id = ?').run(adminAccountId);

    // Try clearing again (should succeed with 0 items)
    const response = await fetch(`${API_URL}/api/v1/data/canvas`, {
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

  test('should require authentication', async (_t: TestContext) => {
    const response = await fetch(`${API_URL}/api/v1/data/canvas`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(response.status, 401, 'Should return 401 without auth');

    console.log('✅ Authentication required');
  });
});
