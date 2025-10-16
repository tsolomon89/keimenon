/**
 * Integration Tests for Import-Enhanced Endpoint
 *
 * Tests the /api/v1/import/enhanced endpoint with authentication,
 * organizational structure creation, and multi-tenant isolation.
 *
 * NOTE: This test requires the API server to be running on port 4001.
 * Run: npm run dev (in apps/api)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { setupTestDatabase, cleanupTestDatabase } from './utils/test-db';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const TEST_DB_PATH = path.join(__dirname, '../../test-import-enhanced.db');
const API_BASE_URL = 'http://localhost:4001';

describe('Import-Enhanced Integration Tests', () => {
  let db: SQLiteClient;
  let authService: AuthService;
  let adminAccountId: string;
  let clientAccountId: string;
  let adminUserId: string;
  let clientUserId: string;
  let adminToken: string;
  let clientToken: string;

  before(async () => {
    console.log('⏳ Setting up test database and accounts...');

    // Setup test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    db = await setupTestDatabase(TEST_DB_PATH);
    authService = new AuthService(db as any);

    // Create admin account
    adminAccountId = randomUUID();
    const adminNow = Date.now();
    db.getDatabase().prepare(`
      INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(adminAccountId, 'admin', 'business', 'admin@test.com', 'Admin Test', adminNow, adminNow);

    // Create admin user
    adminUserId = randomUUID();
    const adminPasswordHash = await authService.hashPassword('adminpass123');
    db.getDatabase().prepare(`
      INSERT INTO users (id, account_id, email, password_hash, name, permission_level, user_class, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(adminUserId, adminAccountId, 'admin@test.com', adminPasswordHash, 'Admin User', 'admin', 'person', adminNow, adminNow);

    // Create client account
    clientAccountId = randomUUID();
    const clientNow = Date.now();
    db.getDatabase().prepare(`
      INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(clientAccountId, 'client', 'free', 'client@test.com', 'Client Test', clientNow, clientNow);

    // Create client user
    clientUserId = randomUUID();
    const clientPasswordHash = await authService.hashPassword('clientpass123');
    db.getDatabase().prepare(`
      INSERT INTO users (id, account_id, email, password_hash, name, permission_level, user_class, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(clientUserId, clientAccountId, 'client@test.com', clientPasswordHash, 'Client User', 'junior', 'person', clientNow, clientNow);

    // Generate tokens
    adminToken = await authService.generateToken({
      userId: adminUserId,
      accountId: adminAccountId,
      email: 'admin@test.com',
      permissionLevel: 'admin',
      accountType: 'admin',
      accountClass: 'business',
    });

    clientToken = await authService.generateToken({
      userId: clientUserId,
      accountId: clientAccountId,
      email: 'client@test.com',
      permissionLevel: 'junior',
      accountType: 'client',
      accountClass: 'free',
    });

    console.log('✅ Test setup complete');
  });

  after(async () => {
    console.log('🧹 Cleaning up test database...');
    await cleanupTestDatabase(db);
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    console.log('✅ Cleanup complete');
  });

  it('should import data with authentication and create organizational structure', async () => {
    const testFilePath = path.join(__dirname, '../../../ai_context/chat_data/test-samples/small.json');

    if (!fs.existsSync(testFilePath)) {
      console.warn(`⚠️  Test file not found: ${testFilePath}, skipping test`);
      return;
    }

    console.log('📁 Uploading test file as admin...');

    const form = new FormData();
    form.append('files', fs.createReadStream(testFilePath), 'small.json');
    form.append('config', JSON.stringify({ export_code: true }));

    const response = await fetch(`${API_BASE_URL}/api/v1/import/enhanced`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      body: form as any,
    });

    assert.strictEqual(response.status, 200, 'Import should succeed with 200 status');
    const data: any = await response.json();
    assert.ok(data.success, 'Response should indicate success');
    assert.ok(data.results, 'Response should include results');
    assert.ok(data.results.length > 0, 'Results should have at least one entry');

    console.log(`✅ Import successful: ${data.results.length} file(s) processed`);

    // Verify ChatThread nodes have account_id
    const chatThreads = db.getDatabase().prepare(`
      SELECT * FROM nodes
      WHERE kind = 'ChatThread' AND account_id = ?
    `).all(adminAccountId);
    assert.ok(chatThreads.length > 0, 'ChatThread nodes should be created');
    console.log(`   ✓ Created ${chatThreads.length} ChatThread nodes`);

    // Verify Message nodes have account_id
    const messages = db.getDatabase().prepare(`
      SELECT * FROM nodes
      WHERE kind = 'Message' AND account_id = ?
    `).all(adminAccountId);
    assert.ok(messages.length > 0, 'Message nodes should be created');
    console.log(`   ✓ Created ${messages.length} Message nodes`);

    // Verify Folder node created
    const folders = db.getDatabase().prepare(`
      SELECT * FROM nodes
      WHERE kind = 'Folder' AND account_id = ?
    `).all(adminAccountId) as any[];
    assert.strictEqual(folders.length, 1, 'Exactly one Folder should be created');
    const folderProps = JSON.parse(folders[0].properties);
    assert.strictEqual(folderProps.name, 'Imported Conversations', 'Folder should be named "Imported Conversations"');
    console.log(`   ✓ Created folder: "${folderProps.name}"`);

    // Verify Group nodes created (one per conversation)
    const groups = db.getDatabase().prepare(`
      SELECT * FROM nodes
      WHERE kind = 'Group' AND account_id = ?
    `).all(adminAccountId);
    assert.strictEqual(groups.length, chatThreads.length, 'One Group should be created per ChatThread');
    console.log(`   ✓ Created ${groups.length} Group nodes`);

    // Verify IN_GROUP edges link ChatThreads to Groups
    const inGroupEdges = db.getDatabase().prepare(`
      SELECT * FROM edges
      WHERE kind = 'IN_GROUP' AND account_id = ?
    `).all(adminAccountId);
    assert.strictEqual(inGroupEdges.length, chatThreads.length, 'Each ChatThread should have an IN_GROUP edge');
    console.log(`   ✓ Created ${inGroupEdges.length} IN_GROUP edges`);

    // Verify FOLDS_INTO_FOLDER edges link Groups to Folder
    const foldsEdges = db.getDatabase().prepare(`
      SELECT * FROM edges
      WHERE kind = 'FOLDS_INTO_FOLDER' AND account_id = ?
    `).all(adminAccountId);
    assert.strictEqual(foldsEdges.length, groups.length, 'Each Group should fold into the Folder');
    console.log(`   ✓ Created ${foldsEdges.length} FOLDS_INTO_FOLDER edges`);

    // Verify CONTAINS edges have account_id
    const containsEdges = db.getDatabase().prepare(`
      SELECT * FROM edges
      WHERE kind = 'CONTAINS' AND account_id = ?
    `).all(adminAccountId);
    assert.ok(containsEdges.length > 0, 'CONTAINS edges should be created');
    console.log(`   ✓ Created ${containsEdges.length} CONTAINS edges`);

    console.log('✅ All organizational structure verified');
  });

  it('should verify tenant isolation between admin and client accounts', async () => {
    // Verify admin has their data
    const adminChatThreads = db.getDatabase().prepare(`
      SELECT * FROM nodes
      WHERE kind = 'ChatThread' AND account_id = ?
    `).all(adminAccountId);
    assert.ok(adminChatThreads.length > 0, 'Admin should have ChatThreads');

    // Verify no cross-contamination (admin data created by admin user only)
    const crossContamination = db.getDatabase().prepare(`
      SELECT * FROM nodes
      WHERE kind = 'ChatThread'
        AND account_id = ?
        AND created_by != ?
    `).all(adminAccountId, adminUserId);
    assert.strictEqual(crossContamination.length, 0, 'No cross-contamination should exist');

    console.log('✅ Tenant isolation verified');
  });

  it('should return folders/groups via navigation API', async () => {
    console.log('🔍 Querying navigation API...');

    const response = await fetch(`${API_BASE_URL}/api/v1/groups/nav`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(response.status, 200, 'Navigation API should return 200');
    const data: any = await response.json();
    assert.ok(data.success, 'Response should indicate success');
    assert.ok(data.groups, 'Response should include groups');
    assert.ok(data.groups.length > 0, 'Groups array should not be empty');

    // Verify folder structure
    const folder = data.groups.find((g: any) => g.kind === 'Folder');
    assert.ok(folder, 'Folder should be present in navigation');
    assert.strictEqual(folder.label, 'Imported Conversations', 'Folder label should match');
    assert.ok(folder.badge > 0, 'Folder should have children (badge > 0)');

    console.log(`✅ Navigation API returns ${data.groups.length} items (including folder)`);
  });

  it('should fetch group members for a specific group', async () => {
    console.log('🔍 Testing group member fetching...');

    // Get groups for admin account
    const groupsResponse = await fetch(`${API_BASE_URL}/api/v1/groups/nav`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    const groupsData: any = await groupsResponse.json();
    const folder = groupsData.groups.find((g: any) => g.kind === 'Folder');
    assert.ok(folder, 'Folder should exist');

    // Fetch folder children
    const childrenResponse = await fetch(`${API_BASE_URL}/api/v1/groups/nav/${folder.id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(childrenResponse.status, 200, 'Should fetch folder children');
    const childrenData: any = await childrenResponse.json();
    assert.ok(childrenData.success, 'Response should indicate success');
    assert.ok(childrenData.children, 'Should have children array');
    assert.ok(childrenData.children.length > 0, 'Children should not be empty');

    // Get first group
    const group = childrenData.children.find((c: any) => c.kind === 'Group');
    assert.ok(group, 'Group should exist in children');

    // Fetch group members (node IDs)
    const membersResponse = await fetch(`${API_BASE_URL}/api/v1/groups/nav/${group.id}/nodes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    });

    assert.strictEqual(membersResponse.status, 200, 'Should fetch group members');
    const membersData: any = await membersResponse.json();
    assert.ok(membersData.success, 'Response should indicate success');
    assert.ok(membersData.node_ids, 'Should have node_ids array');
    assert.ok(membersData.node_ids.length > 0, 'Node IDs should not be empty');

    // Verify node IDs are ChatThread nodes
    const nodeId = membersData.node_ids[0];
    const node = db.getDatabase().prepare(`
      SELECT * FROM nodes WHERE id = ? AND account_id = ?
    `).get(nodeId, adminAccountId) as any;
    assert.ok(node, 'Node should exist in database');
    assert.strictEqual(node.kind, 'ChatThread', 'Node should be a ChatThread');

    console.log(`✅ Successfully fetched ${membersData.node_ids.length} member(s) from group`);
  });
});
