import { test, expect } from './fixtures/test-isolation';
import { createTestSourceNode } from './helpers/create-test-node';

/**
 * Multi-Tenant Isolation - Boards
 *
 * CRITICAL SECURITY TEST: Ensures that Account A cannot access Account B's boards.
 * This validates the account isolation boundary at both API and UI levels.
 *
 * Tests cover:
 * - API isolation (GET, POST, PUT, DELETE)
 * - Board list filtering by account
 * - Board graph access control
 * - Cross-account board operations blocked
 *
 * Security Priority: CRITICAL
 * Related: apps/api/src/routes/boards.ts (account isolation middleware)
 * Related: docs/architecture/MULTI_TENANCY.md
 */

test.describe('Multi-Tenant Isolation - Boards', () => {
  test.describe.configure({ tag: '@smoke' });

  // Test account credentials (from fixture database snapshots)
  const ACCOUNT_A = {
    email: 'client-alpha@fixture.test',
    password: 'TestPass123!',
  };

  const ACCOUNT_B = {
    email: 'client-beta@fixture.test',
    password: 'TestPass123!',
  };

  // Store board IDs created during tests
  let boardAId: string;
  let boardBId: string;

  test.beforeEach(async ({ apiRequest }) => {
    // Create board in Account A
    const responseA = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_A,
    });
    const authA = await responseA.json();

    // Debug: Check login response
    console.log('Login response for Account A:', {
      status: responseA.status(),
      hasToken: !!authA.token,
      hasUser: !!authA.user,
      hasAccount: !!authA.account,
      response: authA,
    });

    const createA = await apiRequest.post('/api/v1/boards', {
      headers: {
        Authorization: `Bearer ${authA.token}`,
      },
      data: {
        workspace_id: 'test_workspace_a',
        name: 'Account A Board',
        description: "This is Account A's private board",
        settings: { default_lens: '2D', secret_config: 'alpha_secret' },
        data_tag: 'test',
      },
    });
    const boardA = await createA.json();

    // Debug: Log response if board creation failed
    if (!boardA.success || !boardA.board) {
      console.error('Board creation failed for Account A:', {
        status: createA.status(),
        response: boardA,
      });
      throw new Error(`Board creation failed: ${JSON.stringify(boardA)}`);
    }

    boardAId = boardA.board.id;

    // Create board in Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_B,
    });
    const authB = await responseB.json();

    const createB = await apiRequest.post('/api/v1/boards', {
      headers: {
        Authorization: `Bearer ${authB.token}`,
      },
      data: {
        workspace_id: 'test_workspace_b',
        name: 'Account B Board',
        description: "This is Account B's private board",
        settings: { default_lens: '3D', secret_config: 'beta_secret' },
        data_tag: 'test',
      },
    });
    const boardB = await createB.json();
    boardBId = boardB.board.id;
  });

  test.afterEach(async ({ apiRequest }) => {
    // Cleanup both accounts' data
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    await apiRequest.delete('/api/v1/data/keimenon', {
      headers: { Authorization: `Bearer ${authA.token}` },
      params: { data_tag: 'test' },
    });

    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();
    await apiRequest.delete('/api/v1/data/keimenon', {
      headers: { Authorization: `Bearer ${authB.token}` },
      params: { data_tag: 'test' },
    });
  });

  // ==================== API ISOLATION ====================

  test('should prevent Account B from reading Account A board via API', async ({ apiRequest }) => {
    // Step 1: Login as Account B
    const response = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_B,
    });
    const auth = await response.json();

    // Step 2: Attempt to read Account A's board (should fail)
    const readResponse = await apiRequest.get(`/api/v1/boards/${boardAId}`, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    });

    // Step 3: Verify request is denied (403 or 404)
    expect([403, 404]).toContain(readResponse.status());

    // Step 4: Verify error message
    const errorData = await readResponse.json();
    expect(errorData.error).toMatch(/forbidden|not found|access denied/i);
  });

  test('should prevent Account B from updating Account A board via API', async ({ apiRequest }) => {
    // Step 1: Login as Account B
    const response = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const auth = await response.json();

    // Step 2: Attempt to update Account A's board (should fail)
    const updateResponse = await apiRequest.put(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: {
        name: 'Hacked by Account B',
        description: 'Malicious update attempt',
        settings: { secret_config: 'stolen' },
      },
    });

    // Step 3: Verify request is denied
    expect([403, 404]).toContain(updateResponse.status());

    // Step 4: Verify board was NOT modified (check with Account A)
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const verifyResponse = await apiRequest.get(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const board = await verifyResponse.json();
    expect(board.board.name).toBe('Account A Board');
    expect(board.board.description).toBe("This is Account A's private board");
    expect(board.board.settings.secret_config).toBe('alpha_secret');
  });

  test('should prevent Account B from deleting Account A board via API', async ({ apiRequest }) => {
    // Step 1: Login as Account B
    const response = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const auth = await response.json();

    // Step 2: Attempt to delete Account A's board (should fail)
    const deleteResponse = await apiRequest.delete(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });

    // Step 3: Verify request is denied
    expect([403, 404]).toContain(deleteResponse.status());

    // Step 4: Verify board still exists (check with Account A)
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const verifyResponse = await apiRequest.get(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    expect(verifyResponse.ok()).toBeTruthy();
    const board = await verifyResponse.json();
    expect(board.board.id).toBe(boardAId);
  });

  test('should only list boards belonging to the authenticated account', async ({ apiRequest }) => {
    // Step 1: Login as Account A
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();

    // Step 2: List boards (should only see Account A's board)
    const listResponseA = await apiRequest.get('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authA.token}` },
      params: { workspace_id: 'test_workspace_a' },
    });

    expect(listResponseA.ok()).toBeTruthy();
    const dataA = await listResponseA.json();

    // Verify only Account A's board is visible
    expect(dataA.boards).toHaveLength(1);
    expect(dataA.boards[0].name).toBe('Account A Board');
    expect(dataA.boards[0].id).toBe(boardAId);

    // Step 3: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 4: List boards (should only see Account B's board)
    const listResponseB = await apiRequest.get('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authB.token}` },
      params: { workspace_id: 'test_workspace_b' },
    });

    expect(listResponseB.ok()).toBeTruthy();
    const dataB = await listResponseB.json();

    // Verify only Account B's board is visible
    expect(dataB.boards).toHaveLength(1);
    expect(dataB.boards[0].name).toBe('Account B Board');
    expect(dataB.boards[0].id).toBe(boardBId);
  });

  test('should prevent Account B from accessing Account A board graph', async ({ apiRequest }) => {
    // Step 1: Login as Account A and add nodes to their board
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();

    const secretNodeData = createTestSourceNode({
      title: 'Secret Node',
      content: 'This should not be visible to Account B',
    });
    secretNodeData.metadata = {
      ...secretNodeData.metadata,
      board_id: boardAId,
      data_tag: 'test',
    };

    await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authA.token}` },
      data: secretNodeData,
    });

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to get Account A's board graph (should fail)
    const graphResponse = await apiRequest.get(`/api/v1/boards/${boardAId}/graph`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });

    // Step 4: Verify request is denied
    expect([403, 404]).toContain(graphResponse.status());
  });

  test("should prevent creating board with another account's ID via API manipulation", async ({
    apiRequest,
  }) => {
    // Step 1: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 2: Get Account A's account_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();
    const accountAInfo = await apiRequest.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const accountAData = await accountAInfo.json();
    const accountAId = accountAData.user.accountId;

    // Step 3: Attempt to create board with Account A's account_id (should be overridden)
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        name: 'Malicious Board',
        account_id: accountAId, // Try to inject Account A's account_id
        data_tag: 'test',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const result = await createResponse.json();

    // Step 4: Verify account_id was overridden by middleware
    // The board should be created with Account B's account_id, NOT Account A's
    const verifyResponse = await apiRequest.get(`/api/v1/boards/${result.board.id}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect(verifyResponse.ok()).toBeTruthy();

    // Step 5: Verify Account A cannot see this board
    const listResponseA = await apiRequest.get('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const boardsA = await listResponseA.json();
    const maliciousBoard = boardsA.boards?.find((b: any) => b.name === 'Malicious Board');
    expect(maliciousBoard).toBeUndefined(); // Should not be visible to Account A
  });

  // ==================== CROSS-ACCOUNT OPERATIONS ====================

  // FIXME: Board deletion with contents isolation needs verification
  // Test may be failing due to DELETE endpoint not properly checking account ownership
  // To fix: Verify boards.ts DELETE endpoint properly validates account_id before deletion
  test('should prevent Account B from deleting Account A board with contents', async ({
    apiRequest,
  }) => {
    // Step 1: Login as Account A and add nodes to their board
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();

    const importantNodeData = createTestSourceNode({
      title: 'Important Node',
      content: 'Content for Important Node',
    });
    importantNodeData.metadata = {
      ...importantNodeData.metadata,
      board_id: boardAId,
      data_tag: 'test',
    };

    await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authA.token}` },
      data: importantNodeData,
    });

    // Step 2: Login as Account B
    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 3: Attempt to delete Account A's board with contents (should fail)
    const deleteResponse = await apiRequest.delete(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
      params: { delete_contents: 'true' },
    });

    // Step 4: Verify request is denied
    expect([403, 404]).toContain(deleteResponse.status());

    // Step 5: Verify board and nodes still exist
    const verifyBoardResponse = await apiRequest.get(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    expect(verifyBoardResponse.ok()).toBeTruthy();

    const graphResponse = await apiRequest.get(`/api/v1/boards/${boardAId}/graph`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    const graph = await graphResponse.json();
    expect(graph.stats.nodeCount).toBeGreaterThanOrEqual(1);
  });

  test('should isolate board workspaces between accounts', async ({ apiRequest }) => {
    // Step 1: Both accounts create boards in same workspace_id
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();

    await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authA.token}` },
      data: {
        workspace_id: 'shared_workspace_name', // Same workspace_id
        name: 'Account A Board in Shared Workspace',
        data_tag: 'test',
      },
    });

    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: {
        workspace_id: 'shared_workspace_name', // Same workspace_id
        name: 'Account B Board in Shared Workspace',
        data_tag: 'test',
      },
    });

    // Step 2: Each account lists boards in this workspace
    const listResponseA = await apiRequest.get('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authA.token}` },
      params: { workspace_id: 'shared_workspace_name' },
    });
    const boardsA = await listResponseA.json();

    const listResponseB = await apiRequest.get('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authB.token}` },
      params: { workspace_id: 'shared_workspace_name' },
    });
    const boardsB = await listResponseB.json();

    // Step 3: Verify each account only sees their own board
    expect(
      boardsA.boards.some((b: any) => b.name === 'Account A Board in Shared Workspace')
    ).toBeTruthy();
    expect(
      boardsA.boards.some((b: any) => b.name === 'Account B Board in Shared Workspace')
    ).toBeFalsy();

    expect(
      boardsB.boards.some((b: any) => b.name === 'Account B Board in Shared Workspace')
    ).toBeTruthy();
    expect(
      boardsB.boards.some((b: any) => b.name === 'Account A Board in Shared Workspace')
    ).toBeFalsy();
  });

  // ==================== EDGE CASES ====================

  test('should prevent Account B from accessing Account A board even with direct ID knowledge', async ({
    apiRequest,
  }) => {
    // Scenario: Account B somehow learns Account A's board ID (e.g., leaked in logs)
    // They should still be blocked from accessing it

    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Try to read
    const readResponse = await apiRequest.get(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect([403, 404]).toContain(readResponse.status());

    // Try to update
    const updateResponse = await apiRequest.put(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
      data: { name: 'Hacked' },
    });
    expect([403, 404]).toContain(updateResponse.status());

    // Try to delete
    const deleteResponse = await apiRequest.delete(`/api/v1/boards/${boardAId}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect([403, 404]).toContain(deleteResponse.status());

    // Try to get graph
    const graphResponse = await apiRequest.get(`/api/v1/boards/${boardAId}/graph`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect([403, 404]).toContain(graphResponse.status());
  });

  test('should handle concurrent access attempts from different accounts', async ({
    apiRequest,
  }) => {
    // Step 1: Login both accounts
    const responseA = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_A });
    const authA = await responseA.json();

    const responseB = await apiRequest.post('/api/v1/auth/login', { data: ACCOUNT_B });
    const authB = await responseB.json();

    // Step 2: Both try to access each other's board simultaneously
    // CRITICAL FIX #12: Use apiRequest fixture, not undefined 'request'
    const promises = [
      // Account A tries to access Account B's board
      apiRequest.get(`/api/v1/boards/${boardBId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }),
      // Account B tries to access Account A's board
      apiRequest.get(`/api/v1/boards/${boardAId}`, {
        headers: { Authorization: `Bearer ${authB.token}` },
      }),
      // Account A accesses their own board (should succeed)
      apiRequest.get(`/api/v1/boards/${boardAId}`, {
        headers: { Authorization: `Bearer ${authA.token}` },
      }),
      // Account B accesses their own board (should succeed)
      apiRequest.get(`/api/v1/boards/${boardBId}`, {
        headers: { Authorization: `Bearer ${authB.token}` },
      }),
    ];

    const results = await Promise.all(promises);

    // Verify: Cross-account access denied, own-account access allowed
    expect([403, 404]).toContain(results[0].status()); // A→B denied
    expect([403, 404]).toContain(results[1].status()); // B→A denied
    expect(results[2].ok()).toBeTruthy(); // A→A allowed
    expect(results[3].ok()).toBeTruthy(); // B→B allowed
  });
});
