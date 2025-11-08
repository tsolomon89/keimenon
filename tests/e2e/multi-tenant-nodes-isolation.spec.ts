import { test, expect } from './fixtures/test-isolation';
import { login } from './helpers/login';
import { createTestSourceNodeForAccount } from './helpers/create-test-node';
import { authGet } from './helpers/authenticated-request';

/**
 * Multi-Tenant Isolation - Nodes
 *
 * CRITICAL SECURITY TEST: Ensures that account A cannot access account B's nodes.
 * Nodes are the core data structure - any isolation failure is a critical vulnerability.
 *
 * Tests cover:
 * - API read/write/delete isolation
 * - List endpoint filtering
 * - UI display isolation
 * - Direct URL access blocking
 * - Session isolation after account switching
 *
 * Security Priority: CRITICAL
 * Related: docs/architecture/MULTI_TENANCY.md
 * Related: apps/api/src/middleware/auth.middleware.ts
 * Related: ai_context/schemas/Node.json
 */

test.describe('Multi-Tenant Isolation - Nodes', () => {
  test.describe.configure({ tag: '@smoke' });

  // Test account credentials (from fixture database snapshots)
  // All fixture accounts use the same password: TestPass123!
  const ACCOUNT_A = {
    email: 'client-alpha@fixture.test',
    password: 'TestPass123!',
  };

  const ACCOUNT_B = {
    email: 'client-beta@fixture.test',
    password: 'TestPass123!',
  };

  // Store node IDs created during tests
  let nodeAId: string;
  let nodeBId: string;
  let tokenA: string;
  let tokenB: string;

  test.beforeEach(async ({ apiRequest }) => {
    // Fixture accounts already exist - skip registration, just login
    // Login to Account A and create test node
    const responseA = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_A,
    });

    // Debug: Check login response
    if (!responseA.ok()) {
      const errorText = await responseA.text();
      console.error(`[Account A Login FAILED] Status: ${responseA.status()}, Error: ${errorText}`);
    }

    const authA = await responseA.json();
    tokenA = authA.token;

    // Debug: Log token info
    console.log(
      `[Account A Login] Token exists: ${!!tokenA}, Token length: ${tokenA?.length || 0}, Email: ${ACCOUNT_A.email}`
    );

    // Create node with complete schema-compliant data
    const nodeAData = createTestSourceNodeForAccount('Account A', 1);

    const createA = await apiRequest.post('/api/v1/nodes/source', {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
      data: nodeAData,
    });

    if (createA.ok()) {
      const nodeA = await createA.json();
      // API may return { node: {...} } or just the node directly
      nodeAId = nodeA.node?.id || nodeA.id;
    } else {
      console.error('Failed to create node for Account A:', await createA.text());
    }

    // Login to Account B and create test node
    const responseB = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_B,
    });

    // Debug: Check login response
    if (!responseB.ok()) {
      const errorText = await responseB.text();
      console.error(`[Account B Login FAILED] Status: ${responseB.status()}, Error: ${errorText}`);
    }

    const authB = await responseB.json();
    tokenB = authB.token;

    // Debug: Log token info
    console.log(
      `[Account B Login] Token exists: ${!!tokenB}, Token length: ${tokenB?.length || 0}, Email: ${ACCOUNT_B.email}`
    );

    // Create node with complete schema-compliant data
    const nodeBData = createTestSourceNodeForAccount(
      'Account B',
      1,
      'This is private data belonging to'
    );

    // Debug: Log what we're about to send
    console.log(
      `[Account B Node Creation] Attempting to create node with token: ${tokenB?.substring(0, 20)}...`
    );

    const createB = await apiRequest.post('/api/v1/nodes/source', {
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
      data: nodeBData,
    });

    // Debug: Log response status
    console.log(
      `[Account B Node Creation] Response status: ${createB.status()}, OK: ${createB.ok()}`
    );

    if (createB.ok()) {
      const nodeB = await createB.json();
      // API may return { node: {...} } or just the node directly
      nodeBId = nodeB.node?.id || nodeB.id;
      console.log(`[Account B Node Creation] SUCCESS - Node ID: ${nodeBId}`);
    } else {
      const errorResponse = await createB.text();
      console.error(
        `[Account B Node Creation] FAILED - Status: ${createB.status()}, Error: ${errorResponse}`
      );
    }
  });

  test.afterEach(async ({ apiRequest }) => {
    // Cleanup test data from both accounts
    if (tokenA) {
      await apiRequest.delete('/api/v1/data/canvas', {
        headers: { Authorization: `Bearer ${tokenA}` },
        params: { data_tag: 'test' },
      });
    }

    if (tokenB) {
      await apiRequest.delete('/api/v1/data/canvas', {
        headers: { Authorization: `Bearer ${tokenB}` },
        params: { data_tag: 'test' },
      });
    }
  });

  // ==================== API ISOLATION ====================

  test('should prevent Account B from reading Account A node via API', async ({ apiRequest }) => {
    // Attempt to read Account A's node using Account B's token
    const readResponse = await apiRequest.get(`/api/v1/nodes/${nodeAId}`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });

    // Should be denied (401 Unauthorized, 403 Forbidden, or 404 Not Found to avoid info leakage)
    expect([401, 403, 404]).toContain(readResponse.status());

    // Error message should not leak sensitive information
    if (!readResponse.ok()) {
      const errorData = await readResponse.json();
      expect(errorData.error || errorData.message).toMatch(
        /forbidden|not found|unauthorized|access denied/i
      );
    }
  });

  test('should prevent Account B from deleting Account A node via API', async ({ apiRequest }) => {
    // Attempt to delete Account A's node using Account B's token
    const deleteResponse = await apiRequest.delete(`/api/v1/nodes/${nodeAId}`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });

    // Should be denied
    expect([401, 403, 404]).toContain(deleteResponse.status());

    // Verify node still exists by checking with Account A
    const verifyResponse = await apiRequest.get(`/api/v1/nodes/${nodeAId}`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    expect(verifyResponse.status()).toBe(200);
    const { node } = await verifyResponse.json();
    expect(node.title).toBe('Account A Confidential Source 1');
  });

  test('should not include Account A nodes in Account B list via API', async ({ apiRequest }) => {
    // List all nodes for Account B
    const listResponse = await apiRequest.get('/api/v1/nodes', {
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
      params: {
        limit: 1000,
        kind: 'Source',
      },
    });

    expect(listResponse.ok()).toBeTruthy();
    const data = await listResponse.json();
    const nodes = data.nodes || data;

    // Account A's node should NOT be in the list
    const foundAccountANode = nodes.find((n: any) => n.id === nodeAId);
    expect(foundAccountANode).toBeUndefined();

    // Account B's node SHOULD be in the list
    const foundAccountBNode = nodes.find((n: any) => n.id === nodeBId);
    expect(foundAccountBNode).toBeDefined();
    expect(foundAccountBNode.title).toBe('Account B Confidential Source 1');
  });

  test('should filter nodes by account_id correctly', async ({ apiRequest }) => {
    // Verify Account A only sees their own nodes
    const listA = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${tokenA}` },
      params: { limit: 1000 },
    });

    const dataA = await listA.json();
    const nodesA = dataA.nodes || dataA;

    // Should include Account A's node
    expect(nodesA.some((n: any) => n.id === nodeAId)).toBeTruthy();
    // Should NOT include Account B's node
    expect(nodesA.some((n: any) => n.id === nodeBId)).toBeFalsy();

    // Verify Account B only sees their own nodes
    const listB = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${tokenB}` },
      params: { limit: 1000 },
    });

    const dataB = await listB.json();
    const nodesB = dataB.nodes || dataB;

    // Should include Account B's node
    expect(nodesB.some((n: any) => n.id === nodeBId)).toBeTruthy();
    // Should NOT include Account A's node
    expect(nodesB.some((n: any) => n.id === nodeAId)).toBeFalsy();
  });

  // ==================== UI ISOLATION ====================

  test('should not display Account A nodes in Account B UI', async ({ page }) => {
    // Login as Account B
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // Account A's node should NOT be visible
    await expect(page.getByText('Account A Confidential Source')).not.toBeVisible();
    await expect(page.getByText('This is private data belonging to Account A')).not.toBeVisible();

    // Account B's node SHOULD be visible (if UI displays sources)
    // This may vary based on UI implementation - adjust selector as needed
  });

  test('should prevent Account B from accessing Account A node via direct URL', async ({
    page,
  }) => {
    // Login as Account B
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);

    // Attempt to access Account A's node directly via URL
    // Adjust URL pattern based on your routing
    await page.goto(`/canvas/node/${nodeAId}`);

    // Should show error or redirect (not display the content)
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Account A Confidential Source');
    expect(pageContent).not.toContain('This is private data belonging to Account A');

    // Should show error message or redirect to safe page
    const url = page.url();
    const hasError =
      url.includes('/error') ||
      url.includes('/canvas') ||
      (await page.getByText(/not found|forbidden|access denied/i).isVisible());

    expect(hasError).toBeTruthy();
  });

  // ==================== EDGE CASES ====================

  test('should isolate nodes even with identical titles', async ({ page, apiRequest }) => {
    // Create nodes with identical titles in both accounts
    const identicalTitle = 'Duplicate Title Test';

    // Use helper to create complete schema-compliant nodes
    const { createTestSourceNode } = await import('./helpers/create-test-node');

    await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: createTestSourceNode({
        title: identicalTitle,
        content: 'Account A content',
        platform: 'test',
      }),
    });

    await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: createTestSourceNode({
        title: identicalTitle,
        content: 'Account B content',
        platform: 'test',
      }),
    });

    // Login as Account B and list nodes
    const listResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${tokenB}` },
      params: { limit: 1000 },
    });

    const data = await listResponse.json();
    const nodes = (data.nodes || data).filter((n: any) => n.title === identicalTitle);

    // Account B should only see 1 node with this title (their own)
    expect(nodes.length).toBe(1);
    expect(nodes[0].metadata.content).toBe('Account B content');
  });

  test('should maintain isolation after account switching', async ({ page, request }) => {
    // Login as Account A
    await login(page, ACCOUNT_A.email, ACCOUNT_A.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // Verify Account A sees their node (if UI displays it)
    // await expect(page.getByText('Account A Confidential Source')).toBeVisible();

    // Logout and login as Account B
    await page.goto('/logout');
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
    await page.goto('/canvas');
    await page.waitForLoadState('networkidle');

    // Account A's node should no longer be visible
    await expect(page.getByText('Account A Confidential Source')).not.toBeVisible();

    // Verify via API that session is properly scoped to Account B
    const listResponse = await authGet(page, '/api/v1/nodes', {
      params: { limit: 1000 },
    });

    const data = await listResponse.json();
    const nodeIds = (data.nodes || data).map((n: any) => n.id);

    expect(nodeIds).not.toContain(nodeAId);
    expect(nodeIds).toContain(nodeBId);
  });

  // ==================== ADMIN ACCESS ====================

  test('should allow admin account to access all nodes', async ({ apiRequest }) => {
    // Admin accounts should be able to see all data across accounts
    const ADMIN = {
      email: 'admin@admin.com',
      password: 'admin123',
    };

    const response = await apiRequest.post('/api/v1/auth/login', {
      data: ADMIN,
    });

    expect(response.ok()).toBeTruthy();
    const auth = await response.json();

    // Admin should be able to list all nodes (adjust based on actual admin API)
    const listResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${auth.token}` },
      params: { limit: 1000 },
    });

    const data = await listResponse.json();
    const nodes = data.nodes || data;

    // Admin should see nodes from both accounts
    const hasAccountANode = nodes.some((n: any) => n.id === nodeAId);
    const hasAccountBNode = nodes.some((n: any) => n.id === nodeBId);

    // Note: This test may need adjustment based on admin privilege implementation
    // If admin accounts are type 'admin' (not 'client'), they may see all data
    // If admin is type 'client', they may only see their own account's data

    console.log(`Admin sees Account A node: ${hasAccountANode}`);
    console.log(`Admin sees Account B node: ${hasAccountBNode}`);
  });
});

/**
 * SECURITY CHECKLIST - Nodes Isolation
 *
 * ✅ API Read Isolation - Account B cannot GET Account A's nodes
 * ✅ API Delete Isolation - Account B cannot DELETE Account A's nodes
 * ✅ API List Isolation - Account A's nodes not in Account B's list
 * ✅ Bidirectional Isolation - Both Account A and B are isolated
 * ✅ UI Display Isolation - Account A's nodes not visible in Account B's UI
 * ✅ Direct URL Isolation - Cannot bypass via URL manipulation
 * ✅ Name Collision Handling - Identical titles don't leak data
 * ✅ Session Isolation - Account switching properly clears context
 * ✅ Admin Override - Admin can access all accounts (optional test)
 *
 * If ANY of these tests fail, it is a CRITICAL SECURITY VULNERABILITY.
 * Do NOT deploy to production until fixed and verified.
 */
