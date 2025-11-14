import { test, expect } from './fixtures/test-isolation';
import { login } from './helpers/login';
import { createTestSourceNodeForAccount } from './helpers/create-test-node';
import { authGet } from './helpers/authenticated-request';

/**
 * Multi-Tenant Isolation - Edges
 *
 * CRITICAL SECURITY TEST: Ensures that account A cannot access account B's edges.
 * Edges define relationships between nodes - isolation failures could leak relationship data.
 *
 * Tests cover:
 * - API read/write/delete isolation
 * - List endpoint filtering
 * - Cross-account edge creation prevention
 * - Edge query by node isolation
 *
 * Security Priority: CRITICAL
 * Related: docs/architecture/MULTI_TENANCY.md
 * Related: apps/api/src/routes/edges.ts
 * Related: ai_context/schemas/Edge.json
 */

test.describe('Multi-Tenant Isolation - Edges', () => {
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
  let edgeAId: string;
  let edgeBId: string;
  let tokenA: string;
  let tokenB: string;

  test.beforeEach(async ({ apiRequest }) => {
    // Fixture accounts already exist - skip registration, just login
    // Setup Account A: Create 2 nodes and 1 edge
    const responseA = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_A,
    });
    const authA = await responseA.json();
    tokenA = authA.token;

    // Create first node for Account A
    const nodeA1Data = createTestSourceNodeForAccount('Account A', 1, 'First node for');
    const createA1 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: nodeA1Data,
    });
    const nodeA1 = await createA1.json();
    nodeA1Id = nodeA1.node?.id || nodeA1.id;

    // Create second node for Account A
    const nodeA2Data = createTestSourceNodeForAccount('Account A', 2, 'Second node for');
    const createA2 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: nodeA2Data,
    });
    const nodeA2 = await createA2.json();
    nodeA2Id = nodeA2.node?.id || nodeA2.id;

    // Create edge between Account A nodes
    const createEdgeA = await apiRequest.post('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenA}` },
      data: {
        from_id: nodeA1Id,
        to_id: nodeA2Id,
        kind: 'DERIVES_FROM',
        properties: {
          confidence: 0.95,
          data_tag: 'test',
        },
      },
    });
    const edgeA = await createEdgeA.json();
    edgeAId = edgeA.edge?.id || edgeA.id;

    // Setup Account B: Create 2 nodes and 1 edge
    const responseB = await apiRequest.post('/api/v1/auth/login', {
      data: ACCOUNT_B,
    });
    const authB = await responseB.json();
    tokenB = authB.token;

    // Create first node for Account B
    const nodeB1Data = createTestSourceNodeForAccount('Account B', 1, 'First node for');
    const createB1 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: nodeB1Data,
    });
    const nodeB1 = await createB1.json();
    nodeB1Id = nodeB1.node?.id || nodeB1.id;

    // Create second node for Account B
    const nodeB2Data = createTestSourceNodeForAccount('Account B', 2, 'Second node for');
    const createB2 = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: nodeB2Data,
    });
    const nodeB2 = await createB2.json();
    nodeB2Id = nodeB2.node?.id || nodeB2.id;

    // Create edge between Account B nodes
    const createEdgeB = await apiRequest.post('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: {
        from_id: nodeB1Id,
        to_id: nodeB2Id,
        kind: 'DERIVES_FROM',
        properties: {
          confidence: 0.85,
          data_tag: 'test',
        },
      },
    });
    const edgeB = await createEdgeB.json();
    edgeBId = edgeB.edge?.id || edgeB.id;
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

  test('should prevent Account B from reading Account A edges via API', async ({ apiRequest }) => {
    // Attempt to list edges with Account B token
    const listResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenB}` },
      params: { limit: 1000 },
    });

    expect(listResponse.ok()).toBeTruthy();
    const data = await listResponse.json();
    const edges = data.edges || data;

    // Account A's edge should NOT be in the list
    const foundAccountAEdge = edges.find((e: any) => e.id === edgeAId);
    expect(foundAccountAEdge).toBeUndefined();

    // Account B's edge SHOULD be in the list
    const foundAccountBEdge = edges.find((e: any) => e.id === edgeBId);
    expect(foundAccountBEdge).toBeDefined();
  });

  test('should prevent Account B from deleting Account A edge via API', async ({ apiRequest }) => {
    // Attempt to delete Account A's edge using Account B token
    const deleteResponse = await apiRequest.delete('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenB}` },
      params: { id: edgeAId },
    });

    // Should be denied (401 Unauthorized, 403 Forbidden, or 404 Not Found)
    expect([401, 403, 404]).toContain(deleteResponse.status());

    // Verify edge still exists with Account A token
    const listA = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenA}` },
      params: { limit: 1000 },
    });

    const dataA = await listA.json();
    const edgesA = dataA.edges || dataA;
    const stillExists = edgesA.some((e: any) => e.id === edgeAId);

    expect(stillExists).toBeTruthy();
  });

  test('should prevent creating cross-account edges', async ({ apiRequest }) => {
    // Attempt to create edge from Account B node to Account A node
    const crossAccountEdge = await apiRequest.post('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: {
        from_id: nodeB1Id, // Account B node
        to_id: nodeA1Id, // Account A node (should fail)
        kind: 'CONTAINS',
        properties: {
          data_tag: 'test',
        },
      },
    });

    // Should be rejected (400 Bad Request, 401 Unauthorized, 403 Forbidden, or 404 Not Found)
    expect([400, 401, 403, 404]).toContain(crossAccountEdge.status());

    // Error message should indicate the issue
    if (!crossAccountEdge.ok()) {
      const error = await crossAccountEdge.json();
      expect(error.error || error.message).toMatch(
        /forbidden|not found|unauthorized|invalid node|access denied/i
      );
    }
  });

  // FIXME: Edge filtering by node ownership needs implementation or debugging
  // GET /api/v1/edges/node/:id may not be properly filtering by account_id
  // To fix: Verify edges.routes.ts properly filters edges based on node ownership and account isolation
  test('should filter edges by node ownership', async ({ apiRequest }) => {
    // Query edges connected to Account A node using Account B token
    const edgesForANode = await apiRequest.get(`/api/v1/edges/node/${nodeA1Id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    // Should either return 403/404 or empty list (no edges visible)
    if (edgesForANode.ok()) {
      const data = await edgesForANode.json();
      const edges = data.edges || data;

      // Should not return any edges (Account B can't see Account A's nodes)
      expect(edges.length).toBe(0);
    } else {
      // Or should deny access entirely
      expect([401, 403, 404]).toContain(edgesForANode.status());
    }

    // Verify Account A can see their own edges
    const edgesForANodeAsA = await apiRequest.get(`/api/v1/edges/node/${nodeA1Id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    expect(edgesForANodeAsA.ok()).toBeTruthy();
    const dataA = await edgesForANodeAsA.json();
    // API returns {nodeId, outgoing, incoming, total}, combine both arrays
    const edgesA = [...(dataA.outgoing || []), ...(dataA.incoming || [])];

    expect(edgesA.length).toBeGreaterThan(0);
    expect(edgesA.some((e: any) => e.id === edgeAId)).toBeTruthy();
  });

  test('should filter edges bidirectionally', async ({ apiRequest }) => {
    // Verify Account A only sees their edges
    const listA = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenA}` },
      params: { limit: 1000 },
    });

    const dataA = await listA.json();
    const edgesA = dataA.edges || dataA;

    expect(edgesA.some((e: any) => e.id === edgeAId)).toBeTruthy();
    expect(edgesA.some((e: any) => e.id === edgeBId)).toBeFalsy();

    // Verify Account B only sees their edges
    const listB = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenB}` },
      params: { limit: 1000 },
    });

    const dataB = await listB.json();
    const edgesB = dataB.edges || dataB;

    expect(edgesB.some((e: any) => e.id === edgeBId)).toBeTruthy();
    expect(edgesB.some((e: any) => e.id === edgeAId)).toBeFalsy();
  });

  // ==================== EDGE CASES ====================

  test('should prevent edge manipulation via node ID guessing', async ({ apiRequest }) => {
    // Account B tries to create edge using guessed/discovered Account A node IDs
    // This simulates an attacker who somehow learned Account A's node IDs

    const maliciousEdge = await apiRequest.post('/api/v1/edges', {
      headers: { Authorization: `Bearer ${tokenB}` },
      data: {
        from_id: nodeA1Id, // Guessed Account A node
        to_id: nodeA2Id, // Guessed Account A node
        kind: 'SIMILAR_TO',
        properties: {
          data_tag: 'test',
        },
      },
    });

    // Should fail - cannot create edges between nodes you don't own
    expect([400, 401, 403, 404]).toContain(maliciousEdge.status());
  });

  test('should maintain edge isolation after account switching', async ({ page, request }) => {
    // Login as Account A
    await login(page, ACCOUNT_A.email, ACCOUNT_A.password);

    // Verify Account A can list their edges
    const listA = await authGet(page, '/api/v1/edges', {
      params: { limit: 1000 },
    });
    const dataA = await listA.json();
    const edgesA = dataA.edges || dataA;

    expect(edgesA.some((e: any) => e.id === edgeAId)).toBeTruthy();

    // Logout and login as Account B
    await page.goto('/logout');
    await login(page, ACCOUNT_B.email, ACCOUNT_B.password);

    // Verify Account B cannot see Account A's edges
    const listB = await authGet(page, '/api/v1/edges', {
      params: { limit: 1000 },
    });
    const dataB = await listB.json();
    const edgesB = dataB.edges || dataB;

    expect(edgesB.some((e: any) => e.id === edgeAId)).toBeFalsy();
    expect(edgesB.some((e: any) => e.id === edgeBId)).toBeTruthy();
  });
});

/**
 * SECURITY CHECKLIST - Edges Isolation
 *
 * ✅ API List Isolation - Account B cannot see Account A's edges
 * ✅ API Delete Isolation - Account B cannot delete Account A's edges
 * ✅ Cross-Account Edge Prevention - Cannot link nodes across accounts
 * ✅ Node Query Isolation - Edges for Account A nodes hidden from Account B
 * ✅ Bidirectional Isolation - Both accounts properly isolated
 * ✅ ID Guessing Prevention - Cannot manipulate edges via node ID discovery
 * ✅ Session Isolation - Account switching clears edge access
 *
 * If ANY of these tests fail, it is a CRITICAL SECURITY VULNERABILITY.
 */
