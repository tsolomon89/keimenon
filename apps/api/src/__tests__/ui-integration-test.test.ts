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

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import Database from 'better-sqlite3';

// Test Configuration
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const DB_PATH = process.env.DB_PATH || path.join(require('os').homedir(), '.canvas-memory', 'canvas.db');
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
beforeAll(async () => {
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
afterAll(() => {
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
      'Authorization': `Bearer ${token}`,
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
      'Authorization': `Bearer ${token}`,
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
  return db.prepare(`
    SELECT kind, COUNT(*) as count
    FROM nodes
    WHERE account_id = ?
    GROUP BY kind
    ORDER BY kind
  `).all(accountId);
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
  it('should accept multipart form data with files and config', async () => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      console.warn(`⚠️  Test file not found: ${testFile}`);
      return;
    }

    const response = await uploadFile(testFile, adminToken, {
      export_code: true,
      code_min_chars: 50,
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.success).toBe(true);
  }, 60000); // 60s timeout

  it('should reject unauthenticated requests', async () => {
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

    expect(response.status).toBe(401);
  });

  it('should parse config from form fields', async () => {
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
    expect(response.ok).toBe(true);
  }, 60000);
});

/**
 * ============================================================================
 * TEST SUITE 2: Data Persistence & Multi-Tenancy
 * ============================================================================
 */
describe('Data Persistence & Multi-Tenancy', () => {
  beforeAll(() => {
    // Clean up any existing test data
    cleanupTestData(adminAccountId);
    cleanupTestData(clientAccountId);
  });

  it('should persist imported data with correct account_id', async () => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      console.warn(`⚠️  Test file not found: ${testFile}`);
      return;
    }

    const beforeCounts = getNodesByAccount(adminAccountId);
    console.log('📊 Before import:', beforeCounts);

    const response = await uploadFile(testFile, adminToken);
    expect(response.ok).toBe(true);

    const afterCounts = getNodesByAccount(adminAccountId);
    console.log('📊 After import:', afterCounts);

    // Should have created nodes
    const totalBefore = beforeCounts.reduce((sum, row: any) => sum + row.count, 0);
    const totalAfter = afterCounts.reduce((sum, row: any) => sum + row.count, 0);

    expect(totalAfter).toBeGreaterThan(totalBefore);

    // Should have Folder and Group nodes
    const folderCount = afterCounts.find((r: any) => r.kind === 'Folder')?.count || 0;
    const groupCount = afterCounts.find((r: any) => r.kind === 'Group')?.count || 0;

    expect(folderCount).toBeGreaterThan(0);
    expect(groupCount).toBeGreaterThan(0);
  }, 120000); // 2min timeout

  it('should isolate data between accounts', async () => {
    const testFile = path.join(TEST_FILES_DIR, 'small.json');

    if (!fs.existsSync(testFile)) {
      return;
    }

    // Upload as admin
    await uploadFile(testFile, adminToken);

    // Upload as client
    await uploadFile(testFile, clientToken);

    // Check admin data
    const adminNodes = db.prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?').get(adminAccountId);

    // Check client data
    const clientNodes = db.prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?').get(clientAccountId);

    // Both should have data
    expect((adminNodes as any).count).toBeGreaterThan(0);
    expect((clientNodes as any).count).toBeGreaterThan(0);

    // Check for data leakage
    const wrongAccountNodes = db.prepare(`
      SELECT COUNT(*) as count FROM nodes
      WHERE account_id NOT IN (?, ?)
    `).get(adminAccountId, clientAccountId);

    expect((wrongAccountNodes as any).count).toBe(0);
  }, 120000);
});

/**
 * ============================================================================
 * TEST SUITE 3: Groups & Folders Navigation
 * ============================================================================
 */
describe('Groups & Folders Navigation', () => {
  beforeAll(async () => {
    // Ensure admin has some imported data
    const testFile = path.join(TEST_FILES_DIR, 'small.json');
    if (fs.existsSync(testFile)) {
      await uploadFile(testFile, adminToken);
    }
  });

  it('should return groups tree for authenticated user', async () => {
    const response = await getGroupsTree(adminToken);

    expect(response.success).toBe(true);
    expect(Array.isArray(response.groups)).toBe(true);

    console.log(`📁 Admin has ${response.groups.length} root folders/groups`);
  });

  it('should return empty tree for user with no data', async () => {
    // Create a new client without any imports
    cleanupTestData(clientAccountId);

    const response = await getGroupsTree(clientToken);

    expect(response.success).toBe(true);
    expect(response.groups.length).toBe(0);
  });

  it('should include folder structure with groups', async () => {
    const response = await getGroupsTree(adminToken);

    if (response.groups.length === 0) {
      console.warn('⚠️  No groups found - skipping structure test');
      return;
    }

    const folder = response.groups.find((g: any) => g.kind === 'Folder');

    if (folder) {
      expect(folder).toHaveProperty('id');
      expect(folder).toHaveProperty('kind');
      expect(folder).toHaveProperty('properties');

      // Folders can have children
      if (folder.children) {
        expect(Array.isArray(folder.children)).toBe(true);
      }
    }
  });

  it('should only show data for the authenticated account', async () => {
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
    const overlap = Array.from(adminNodeIds).filter(id => clientNodeIds.has(id));
    expect(overlap.length).toBe(0);
  });
});

/**
 * ============================================================================
 * TEST SUITE 4: UI Data Transformation
 * ============================================================================
 */
describe('UI Data Transformation', () => {
  it('should parse node properties from JSON strings', async () => {
    const response = await getGroupsTree(adminToken);

    if (response.groups.length === 0) {
      console.warn('⚠️  No groups found - skipping property test');
      return;
    }

    const node = response.groups[0];

    // Properties should be parsed objects, not JSON strings
    expect(typeof node.properties).toBe('object');
    expect(node.properties).not.toBe(null);
  });

  it('should include edge relationships in tree structure', async () => {
    const response = await getGroupsTree(adminToken);

    // Check if we have FOLDS_INTO_FOLDER edges
    const foldsIntoEdges = db.prepare(`
      SELECT COUNT(*) as count FROM edges
      WHERE kind = 'FOLDS_INTO_FOLDER'
      AND account_id = ?
    `).get(adminAccountId);

    console.log(`📊 FOLDS_INTO_FOLDER edges: ${(foldsIntoEdges as any).count}`);

    // If we have edges, tree should reflect hierarchy
    if ((foldsIntoEdges as any).count > 0) {
      const hasChildren = response.groups.some((g: any) => g.children && g.children.length > 0);
      expect(hasChildren).toBe(true);
    }
  });
});

/**
 * ============================================================================
 * TEST SUITE 5: Error Handling
 * ============================================================================
 */
describe('Error Handling', () => {
  it('should handle invalid file formats gracefully', async () => {
    const form = new FormData();
    form.append('files', Buffer.from('invalid json'), { filename: 'test.txt' });

    const response = await fetch(`${API_BASE_URL}/api/v1/import/enhanced`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    // Should either accept and handle, or reject cleanly
    expect([200, 400]).toContain(response.status);
  });

  it('should validate authentication tokens', async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/groups`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid_token_12345',
      },
    });

    expect(response.status).toBe(401);
  });

  it('should handle missing config gracefully', async () => {
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
        'Authorization': `Bearer ${adminToken}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    // Should use default config and succeed
    expect(response.ok).toBe(true);
  }, 60000);
});

/**
 * ============================================================================
 * TEST SUITE 6: Performance & Scale
 * ============================================================================
 */
describe('Performance & Scale', () => {
  it('should handle medium file (135MB) import', async () => {
    const testFile = path.join(TEST_FILES_DIR, 'medium.json');

    if (!fs.existsSync(testFile)) {
      console.warn(`⚠️  Medium test file not found: ${testFile}`);
      return;
    }

    const startTime = Date.now();
    const response = await uploadFile(testFile, adminToken);
    const duration = Date.now() - startTime;

    expect(response.ok).toBe(true);

    console.log(`⏱️  Medium file import took: ${(duration / 1000).toFixed(1)}s`);

    if (duration < 30000) {
      console.log('⚡ Performance: Excellent (< 30s)');
    } else if (duration < 60000) {
      console.log('👍 Performance: Good (< 1min)');
    } else {
      console.log('⚠️  Performance: Slow (> 1min)');
    }
  }, 300000); // 5min timeout

  it('should fetch groups tree quickly even with large dataset', async () => {
    const startTime = Date.now();
    await getGroupsTree(adminToken);
    const duration = Date.now() - startTime;

    console.log(`⏱️  Groups tree fetch took: ${duration}ms`);

    // Should be fast (< 1s)
    expect(duration).toBeLessThan(1000);
  });
});
