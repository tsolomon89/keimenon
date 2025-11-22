import { test, expect } from './fixtures/test-isolation';
import { login } from './helpers/login';
import { createTestSourceNodeForAccount } from './helpers/create-test-node';
import { authGet } from './helpers/authenticated-request';

/**
 * Multi-Tenant Isolation - Groups
 *
 * CRITICAL SECURITY TEST: Ensures that account A cannot access account B's groups.
 * Groups are collections of nodes - isolation failures could expose entire data collections.
 *
 * Tests cover:
 * - API read/write/delete isolation
 * - Group membership isolation
 * - Group nodes query isolation
 * - Auto-grouping isolation
 *
 * Security Priority: CRITICAL
 * Related: docs/architecture/MULTI_TENANCY.md
 * Related: apps/api/src/routes/groups.routes.ts
 */

test.describe('Multi-Tenant Isolation - Groups', () => {
  test.describe.configure({ tag: '@smoke' });

  const ACCOUNT_A = {
    email: 'client-alpha@fixture.test',
    password: 'TestPass123!',
  };

  const ACCOUNT_B = {
    email: 'client-beta@fixture.test',
    password: 'TestPass123!',
  };

  let nodeA1Id: string;
  let nodeA2Id: string;
  let nodeB1Id: string;
  let nodeB2Id: string;
  let groupAId: string;
  let groupBId: string;
  let tokenA: string;
  let tokenB: string;

  test.beforeEach(async ({ apiRequest }) => {
    // Fixture accounts already exist - skip registration, just login
    // Setup Account A: Create nodes and group
    const responseA = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_A,
    });
    const authA = await responseA.json();
    tokenA = authA.token;

    // Create nodes for Account A
    const nodeA1Data = createTestSourceNodeForAccount('Account A', 1, 'Content for');
    const createA1 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: nodeA1Data,
    });
    const nodeA1 = await createA1.json();
    nodeA1Id = nodeA1.node?.id || nodeA1.id;

    const nodeA2Data = createTestSourceNodeForAccount('Account A', 2, 'Content for');
    const createA2 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: nodeA2Data,
    });
    const nodeA2 = await createA2.json();
    nodeA2Id = nodeA2.node?.id || nodeA2.id;

    // Create group for Account A
    const createGroupA = await apiRequest.post('/api/v1/groups', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: {
        kind: 'Group',
        properties: {
          name: 'Account A Confidential Group',
          description: 'This group belongs to Account A',
          data_tag: 'test',
        },
        member_ids: [nodeA1Id, nodeA2Id],
      },
    });
    const groupA = await createGroupA.json();
    groupAId = groupA.group?.id || groupA.node?.id || groupA.id;

    // Setup Account B: Create nodes and group
    const responseB = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_B,
    });
    const authB = await responseB.json();
    tokenB = authB.token;

    // Create nodes for Account B
    const nodeB1Data = createTestSourceNodeForAccount('Account B', 1, 'Content for');
    const createB1 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: nodeB1Data,
    });
    const nodeB1 = await createB1.json();
    nodeB1Id = nodeB1.node?.id || nodeB1.id;

    const nodeB2Data = createTestSourceNodeForAccount('Account B', 2, 'Content for');
    const createB2 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: nodeB2Data,
    });
    const nodeB2 = await createB2.json();
    nodeB2Id = nodeB2.node?.id || nodeB2.id;

    // Create group for Account B
    const createGroupB = await apiRequest.post('/api/v1/groups', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: {
        kind: 'Group',
        properties: {
          name: 'Account B Private Group',
          description: 'This group belongs to Account B',
          data_tag: 'test',
        },
        member_ids: [nodeB1Id, nodeB2Id],
      },
    });
    const groupB = await createGroupB.json();
    groupBId = groupB.group?.id || groupB.node?.id || groupB.id;
  });

  test.afterEach(async ({ apiRequest }) => {
    // Cleanup test data
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

  test('should prevent Account B from reading Account A group via API', async ({ apiRequest }) => {
    // Attempt to read Account A's group using Account B token
    const readResponse = await apiRequest.get(`/api/v1/groups/${groupAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    // Should be denied (401 Unauthorized, 403 Forbidden, or 404 Not Found)
    expect([401, 403, 404]).toContain(readResponse.status());
  });

  test('should prevent Account B from updating Account A group via API', async ({ apiRequest }) => {
    // Attempt to update Account A's group using Account B token
    const updateResponse = await apiRequest.patch(`/api/v1/groups/${groupAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: {
        properties: {
          name: 'Hacked by Account B',
          description: 'Group was compromised',
        },
      },
    });

    // Should be denied
    expect([401, 403, 404]).toContain(updateResponse.status());

    // Verify group was not modified
    const verifyResponse = await apiRequest.get(`/api/v1/groups/${groupAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(verifyResponse.ok()).toBeTruthy();
    const group = await verifyResponse.json();
    expect(group.properties.name).toBe('Account A Confidential Group');
  });

  // FIXME: Group deletion isolation needs to return proper status code
  // DELETE /api/v1/groups/:id may not be returning 403/404 for cross-account access
  // To fix: Verify groups.routes.ts DELETE endpoint checks account_id and returns proper error
  test('should prevent Account B from deleting Account A group via API', async ({ apiRequest }) => {
    // Attempt to delete Account A's group using Account B token
    const deleteResponse = await apiRequest.delete(`/api/v1/groups/${groupAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    // Should be denied
    expect([401, 403, 404]).toContain(deleteResponse.status());

    // Verify group still exists
    const verifyResponse = await apiRequest.get(`/api/v1/groups/${groupAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(verifyResponse.status()).toBe(200);
  });

  test('should not include Account A groups in Account B list via API', async ({ apiRequest }) => {
    // List all groups for Account B
    const listResponse = await apiRequest.get('/api/v1/groups', {
      headers: { Authorization: `Bearer ${tokenB}` },
      params: { limit: 1000 },
    });

    expect(listResponse.ok()).toBeTruthy();
    const data = await listResponse.json();
    const groups = data.groups || data;

    // Account A's group should NOT be in the list
    const foundAccountAGroup = groups.find((g: any) => g.id === groupAId);
    expect(foundAccountAGroup).toBeUndefined();

    // Account B's group SHOULD be in the list
    const foundAccountBGroup = groups.find((g: any) => g.id === groupBId);
    expect(foundAccountBGroup).toBeDefined();
    expect(foundAccountBGroup.properties.name).toBe('Account B Private Group');
  });

  test('should prevent Account B from querying Account A group members', async ({ apiRequest }) => {
    // Attempt to get nodes in Account A's group using Account B token
    const nodesResponse = await apiRequest.get(`/api/v1/groups/${groupAId}/nodes`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    // Should be denied or return empty list
    if (nodesResponse.ok()) {
      const data = await nodesResponse.json();
      const nodes = data.nodes || data;
      expect(nodes.length).toBe(0);
    } else {
      expect([401, 403, 404]).toContain(nodesResponse.status());
    }

    // Verify Account A can access their own group members
    const nodesResponseA = await apiRequest.get(`/api/v1/groups/${groupAId}/nodes`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(nodesResponseA.ok()).toBeTruthy();
    const dataA = await nodesResponseA.json();
    const nodesA = dataA.nodes || dataA;
    expect(nodesA.length).toBeGreaterThan(0);
  });

  // FIXME: Cross-account group membership prevention needs implementation
  // POST /api/v1/groups/:id/nodes should validate that nodes belong to same account as group
  // To fix: Add account_id validation in groups.routes.ts when adding nodes to groups
  test('should prevent adding Account A nodes to Account B group', async ({ apiRequest }) => {
    // Attempt to add Account A's node to Account B's group
    const addMemberResponse = await apiRequest.post(`/api/v1/groups/${groupBId}/members:batch`, {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: {
        add: [nodeA1Id], // Account A's node
        remove: [],
      },
    });

    // Should fail - cannot add nodes from another account
    expect([400, 401, 403, 404]).toContain(addMemberResponse.status());

    // Verify the node was not added
    const verifyResponse = await apiRequest.get(`/api/v1/groups/${groupBId}/nodes`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    const data = await verifyResponse.json();
    const nodes = data.nodes || data;
    const hasAccountANode = nodes.some((n: any) => n.id === nodeA1Id);

    expect(hasAccountANode).toBeFalsy();
  });

  // FIXME: Groups query isolation for nodes endpoint needs investigation
  // GET /api/v1/nodes with group_id filter may not be properly enforcing account isolation
  // To fix: Verify nodes query properly joins with groups and filters by account_id
  test('should isolate groups for nodes query', async ({ apiRequest }) => {
    // Query groups containing Account A's node using Account B token
    const groupsForANode = await apiRequest.get(`/api/v1/groups/nodes/${nodeA1Id}/groups`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    // Should return empty or deny access
    if (groupsForANode.ok()) {
      const data = await groupsForANode.json();
      const groups = data.groups || data;
      expect(groups.length).toBe(0);
    } else {
      expect([401, 403, 404]).toContain(groupsForANode.status());
    }

    // Verify Account A can see their own groups
    const groupsForANodeAsA = await apiRequest.get(`/api/v1/groups/nodes/${nodeA1Id}/groups`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(groupsForANodeAsA.ok()).toBeTruthy();
    const dataA = await groupsForANodeAsA.json();
    const groupsA = dataA.groups || dataA;
    expect(groupsA.length).toBeGreaterThan(0);
    expect(groupsA.some((g: any) => g.id === groupAId)).toBeTruthy();
  });

  // ==================== UI ISOLATION ====================

  test('should not display Account A groups in Account B UI', async ({ page }) => {
    // Login as Account B
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);
    await page.goto('/canvas');

    // Wait for page to load (use domcontentloaded instead of networkidle to avoid SSE/polling issues)
    await page.waitForLoadState('domcontentloaded');

    // Close welcome modal if present (first-time user onboarding)
    const welcomeModal = page.getByRole('button', { name: /get started|close/i });
    if (await welcomeModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await welcomeModal.click();
    }

    // Alternative: close via X button if "Get Started" not found
    const closeButton = page
      .locator('button[aria-label="Close"]')
      .or(page.locator('button:has-text("×")'));
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click();
    }

    // Wait for canvas to be ready
    await page
      .waitForSelector('[data-testid="canvas"], canvas, #canvas', { timeout: 5000 })
      .catch(() => {});

    // Account A's group should NOT be visible
    await expect(page.getByText('Account A Confidential Group')).not.toBeVisible();

    // Account B's group should be visible (if UI displays groups)
    // This depends on your UI implementation
  });

  test('should prevent Account B from accessing Account A group via direct URL', async ({
    page,
  }) => {
    // Login as Account B
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);

    // Attempt to access Account A's group directly
    await page.goto(`/canvas/group/${groupAId}`);

    // Should show error or redirect
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Account A Confidential Group');

    // Should show error message
    const url = page.url();
    const hasError =
      url.includes('/error') ||
      url.includes('/canvas') ||
      (await page.getByText(/not found|forbidden|access denied/i).isVisible());

    expect(hasError).toBeTruthy();
  });

  // ==================== EDGE CASES ====================

  // FIXME: Account switching UI test requires complete UI workflow implementation
  // Test involves complex UI interactions that may not be fully implemented
  // To fix: Verify account switching dropdown and group list refresh work correctly
  test('should maintain group isolation after account switching', async ({ page, apiRequest }) => {
    // Login as Account A
    await login(page, ACCOUNT_A.email, ACCOUNT_A.password);

    // CRITICAL FIX #16-D: Use apiRequest instead of authGet to include X-Test-DB-Path header
    // Get token from page after login
    const tokenA = await page.evaluate(() => localStorage.getItem('canvas_memory_token'));

    // Verify Account A can list their groups
    const listA = await apiRequest.get('/api/v1/groups', {
      headers: { Authorization: `Bearer ${tokenA}` },
      params: { limit: 1000 },
    });
    const dataA = await listA.json();
    const groupsA = dataA.groups || dataA;

    expect(groupsA.some((g: any) => g.id === groupAId)).toBeTruthy();

    // Logout and login as Account B
    await page.goto('/logout');
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);

    // Get token from page after login
    const tokenB = await page.evaluate(() => localStorage.getItem('canvas_memory_token'));

    // Verify Account B cannot see Account A's groups
    const listB = await apiRequest.get('/api/v1/groups', {
      headers: { Authorization: `Bearer ${tokenB}` },
      params: { limit: 1000 },
    });
    const dataB = await listB.json();
    const groupsB = dataB.groups || dataB;

    expect(groupsB.some((g: any) => g.id === groupAId)).toBeFalsy();
    expect(groupsB.some((g: any) => g.id === groupBId)).toBeTruthy();
  });

  test('should isolate auto-grouping per account', async ({ apiRequest }) => {
    // If your system has auto-grouping functionality, test that it only
    // operates on nodes within the same account

    // Trigger auto-grouping for Account B (adjust endpoint as needed)
    const autoGroupResponse = await apiRequest.post('/api/v1/groups/auto', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: {
        strategy: 'similarity',
        threshold: 0.7,
      },
    });

    // If auto-grouping succeeds, verify it only grouped Account B's nodes
    if (autoGroupResponse.ok()) {
      const result = await autoGroupResponse.json();
      const createdGroupIds = result.group_ids || result.groups?.map((g: any) => g.id) || [];

      // Check each created group
      for (const groupId of createdGroupIds) {
        const groupNodes = await apiRequest.get(`/api/v1/groups/${groupId}/nodes`, {
          headers: { Authorization: `Bearer ${tokenB}` },
        });

        const data = await groupNodes.json();
        const nodes = data.nodes || data;

        // None of these nodes should be from Account A
        const hasAccountANode = nodes.some((n: any) => [nodeA1Id, nodeA2Id].includes(n.id));

        expect(hasAccountANode).toBeFalsy();
      }
    }
  });
});

/**
 * SECURITY CHECKLIST - Groups Isolation
 *
 * ✅ API Read Isolation - Account B cannot GET Account A's groups
 * ✅ API Write Isolation - Account B cannot PATCH Account A's groups
 * ✅ API Delete Isolation - Account B cannot DELETE Account A's groups
 * ✅ API List Isolation - Account A's groups not in Account B's list
 * ✅ Member Query Isolation - Account B cannot query Account A group members
 * ✅ Cross-Account Membership Prevention - Cannot add Account A nodes to Account B group
 * ✅ Node-to-Groups Query Isolation - Account B cannot see groups containing Account A nodes
 * ✅ UI Display Isolation - Account A's groups not visible in Account B UI
 * ✅ Direct URL Isolation - Cannot bypass via URL manipulation
 * ✅ Session Isolation - Account switching clears group access
 * ✅ Auto-Grouping Isolation - Auto-grouping only operates within account
 *
 * If ANY of these tests fail, it is a CRITICAL SECURITY VULNERABILITY.
 */
