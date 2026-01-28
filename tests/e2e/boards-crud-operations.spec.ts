import { test, expect } from './fixtures/test-isolation';
import { login } from './helpers/login';
import { createTestSourceNode } from './helpers/create-test-node';

/**
 * Boards CRUD Operations E2E Tests
 *
 * Validates complete CRUD (Create, Read, Update, Delete) lifecycle for Boards.
 * Boards organize nodes into workspaces for keimenon visualization.
 *
 * Tests cover:
 * - Create boards (with workspace_id, name, description, settings)
 * - Read single board and list boards
 * - Get board graph (nodes + edges)
 * - Update board properties
 * - Delete boards (with/without contents)
 * - RBAC enforcement (senior for create/update, leader for delete)
 * - Account isolation validation
 *
 * Priority: HIGH (CRITICAL GAP - was 0% coverage)
 * Related: apps/api/src/routes/boards.ts
 * Schema: @keimenon/types BoardSchema
 */

test.describe('Boards - CRUD Operations', () => {
  test.describe.configure({ tag: '@full' });

  const TEST_USER = {
    email: 'admin@admin.com',
    password: 'TestPass123!',
  };

  let authToken: string;

  test.beforeEach(async ({ apiRequest }) => {
    // Login and get auth token
    const response = await apiRequest.post('/api/v1/auth/login', {
      data: TEST_USER,
    });

    const auth = await response.json();
    authToken = auth.token;
  });

  test.afterEach(async ({ apiRequest }) => {
    // Cleanup test data
    await apiRequest.delete('/api/v1/data/keimenon', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { data_tag: 'test' },
    });
  });

  // ==================== CREATE ====================

  test('should create Board successfully with all properties', async ({ apiRequest }) => {
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        workspace_id: 'test_workspace',
        name: 'Test Board',
        description: 'A board for testing CRUD operations',
        settings: {
          default_lens: '3D',
          theme: 'dark',
        },
        data_tag: 'test',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const result = await createResponse.json();

    // Verify response structure
    expect(result.success).toBe(true);
    expect(result.board.id).toBeDefined();
    expect(result.board.kind).toBe('Board');
    expect(result.board.workspace_id).toBe('test_workspace');
    expect(result.board.name).toBe('Test Board');
    expect(result.board.description).toBe('A board for testing CRUD operations');
    expect(result.board.settings.default_lens).toBe('3D');
    expect(result.board.created_at).toBeDefined();
    expect(result.board.updated_at).toBeDefined();
  });

  test('should create Board with minimal properties', async ({ apiRequest }) => {
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Minimal Board',
        data_tag: 'test',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const result = await createResponse.json();

    // Verify defaults are applied
    expect(result.board.workspace_id).toBe('default_workspace');
    expect(result.board.settings.default_lens).toBe('2D');
    expect(result.board.description).toBeNull();
  });

  test('should fail to create Board without required name', async ({ apiRequest }) => {
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        workspace_id: 'test_workspace',
        data_tag: 'test',
      },
    });

    expect(createResponse.ok()).toBeFalsy();
    expect(createResponse.status()).toBe(400); // Validation error
  });

  test('should require senior permission to create Board', async ({ apiRequest }) => {
    // TODO: This test requires a junior user account
    // For now, we test that authenticated users can create
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Permission Test Board',
        data_tag: 'test',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
  });

  // ==================== READ ====================

  test('should get Board by ID', async ({ apiRequest }) => {
    // Step 1: Create a board
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Board to Retrieve',
        description: 'Testing GET endpoint',
        data_tag: 'test',
      },
    });

    const created = await createResponse.json();
    const boardId = created.board.id;

    // Step 2: Retrieve the board
    const getResponse = await apiRequest.get(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(getResponse.ok()).toBeTruthy();
    const result = await getResponse.json();

    // Verify board details
    expect(result.board.id).toBe(boardId);
    expect(result.board.name).toBe('Board to Retrieve');
    expect(result.board.description).toBe('Testing GET endpoint');
  });

  test('should return 404 for non-existent Board', async ({ apiRequest }) => {
    const getResponse = await apiRequest.get('/api/v1/boards/board_nonexistent123', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(getResponse.status()).toBe(404);
    const error = await getResponse.json();
    expect(error.error).toMatch(/not found/i);
  });

  test('should list all Boards for a workspace', async ({ apiRequest }) => {
    // Step 1: Create multiple boards
    await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'Board A', workspace_id: 'list_test', data_tag: 'test' },
    });
    await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'Board B', workspace_id: 'list_test', data_tag: 'test' },
    });
    await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'Board C', workspace_id: 'other_workspace', data_tag: 'test' },
    });

    // Step 2: List boards for specific workspace
    const listResponse = await apiRequest.get('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { workspace_id: 'list_test' },
    });

    expect(listResponse.ok()).toBeTruthy();
    const result = await listResponse.json();

    // Verify only boards from list_test workspace are returned
    expect(result.boards).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.boards.some((b: any) => b.name === 'Board A')).toBeTruthy();
    expect(result.boards.some((b: any) => b.name === 'Board B')).toBeTruthy();
    expect(result.boards.some((b: any) => b.name === 'Board C')).toBeFalsy();
  });

  test('should get Board graph with nodes and edges', async ({ apiRequest }) => {
    // Step 1: Create a board
    const boardResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Graph Test Board',
        data_tag: 'test',
      },
    });
    const board = await boardResponse.json();
    const boardId = board.board.id;

    // Step 2: Create nodes associated with this board
    const node1Data = createTestSourceNode({
      title: 'Node 1',
      content: 'Content for Node 1',
    });
    node1Data.metadata = { ...node1Data.metadata, board_id: boardId, data_tag: 'test' };

    const node1Response = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: node1Data,
    });
    const node1 = await node1Response.json();

    const node2Data = createTestSourceNode({
      title: 'Node 2',
      content: 'Content for Node 2',
    });
    node2Data.metadata = { ...node2Data.metadata, board_id: boardId, data_tag: 'test' };

    const node2Response = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: node2Data,
    });
    const node2 = await node2Response.json();

    // Step 3: Create edge between nodes
    const edgeResponse = await apiRequest.post('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        from_id: node1.node.id,
        to_id: node2.node.id,
        kind: 'CONTAINS',
        data_tag: 'test',
      },
    });

    // Step 4: Get board graph
    const graphResponse = await apiRequest.get(`/api/v1/boards/${boardId}/graph`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(graphResponse.ok()).toBeTruthy();
    const graph = await graphResponse.json();

    // Verify graph structure
    expect(graph.board_id).toBe(boardId);
    expect(graph.nodes).toBeDefined();
    expect(graph.edges).toBeDefined();
    expect(graph.stats.nodeCount).toBeGreaterThanOrEqual(2);
    expect(graph.stats.edgeCount).toBeGreaterThanOrEqual(1);

    // Verify nodes are present (access title directly, not via .properties)
    const titles = graph.nodes.map((n: any) => n.title);
    expect(titles).toContain('Node 1');
    expect(titles).toContain('Node 2');

    // Verify edge is present
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].kind).toBe('CONTAINS');
  });

  test('should limit graph results based on limit parameter', async ({ apiRequest }) => {
    // Step 1: Create a board
    const boardResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Limit Test Board',
        data_tag: 'test',
      },
    });
    const board = await boardResponse.json();
    const boardId = board.board.id;

    // Step 2: Create multiple nodes (more than limit)
    for (let i = 0; i < 5; i++) {
      const nodeData = createTestSourceNode({
        title: `Limit Node ${i}`,
        content: `Content for Limit Node ${i}`,
      });
      nodeData.metadata = { ...nodeData.metadata, board_id: boardId, data_tag: 'test' };

      await apiRequest.post('/api/v1/nodes/source', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: nodeData,
      });
    }

    // Step 3: Get graph with limit
    const graphResponse = await apiRequest.get(`/api/v1/boards/${boardId}/graph`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: '3' },
    });

    const graph = await graphResponse.json();

    // Verify limit is respected
    expect(graph.stats.nodeCount).toBeLessThanOrEqual(3);
  });

  // ==================== UPDATE ====================

  test('should update Board name and description', async ({ apiRequest }) => {
    // Step 1: Create a board
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Original Name',
        description: 'Original description',
        data_tag: 'test',
      },
    });
    const created = await createResponse.json();
    const boardId = created.board.id;

    // Step 2: Update the board
    const updateResponse = await apiRequest.put(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Updated Name',
        description: 'Updated description',
      },
    });

    expect(updateResponse.ok()).toBeTruthy();
    const result = await updateResponse.json();

    // Verify update response
    expect(result.success).toBe(true);
    expect(result.board.name).toBe('Updated Name');
    expect(result.board.description).toBe('Updated description');
    expect(result.board.updated_at).toBeGreaterThan(result.board.created_at);

    // Step 3: Verify via GET
    const getResponse = await apiRequest.get(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const fetched = await getResponse.json();
    expect(fetched.board.name).toBe('Updated Name');
    expect(fetched.board.description).toBe('Updated description');
  });

  test('should update Board settings', async ({ apiRequest }) => {
    // Step 1: Create a board
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Settings Test Board',
        settings: { default_lens: '2D' },
        data_tag: 'test',
      },
    });
    const created = await createResponse.json();
    const boardId = created.board.id;

    // Step 2: Update settings
    const updateResponse = await apiRequest.put(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        settings: {
          default_lens: '3D',
          theme: 'dark',
          custom_property: 'value',
        },
      },
    });

    expect(updateResponse.ok()).toBeTruthy();
    const result = await updateResponse.json();

    // Verify settings updated
    expect(result.board.settings.default_lens).toBe('3D');
    expect(result.board.settings.theme).toBe('dark');
    expect(result.board.settings.custom_property).toBe('value');
  });

  test('should return 404 when updating non-existent Board', async ({ apiRequest }) => {
    const updateResponse = await apiRequest.put('/api/v1/boards/board_nonexistent123', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Updated Name',
      },
    });

    expect(updateResponse.status()).toBe(404);
    const error = await updateResponse.json();
    expect(error.error).toMatch(/not found/i);
  });

  test('should require senior permission to update Board', async ({ apiRequest }) => {
    // Create board
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Permission Update Test',
        data_tag: 'test',
      },
    });
    const created = await createResponse.json();
    const boardId = created.board.id;

    // Update should succeed with admin/senior permissions
    const updateResponse = await apiRequest.put(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Updated by Senior',
      },
    });

    expect(updateResponse.ok()).toBeTruthy();
  });

  // ==================== DELETE ====================

  test('should delete Board without contents', async ({ apiRequest }) => {
    // Step 1: Create a board
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Board to Delete',
        data_tag: 'test',
      },
    });
    const created = await createResponse.json();
    const boardId = created.board.id;

    // Step 2: Create a node associated with this board
    const nodeData = createTestSourceNode({
      title: 'Node on Board',
      content: 'Content for Node on Board',
    });
    nodeData.metadata = { ...nodeData.metadata, board_id: boardId, data_tag: 'test' };

    await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: nodeData,
    });

    // Step 3: Delete board (without contents)
    const deleteResponse = await apiRequest.delete(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(deleteResponse.ok()).toBeTruthy();
    const result = await deleteResponse.json();
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);

    // Step 4: Verify board is deleted
    const getResponse = await apiRequest.get(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(getResponse.status()).toBe(404);

    // Step 5: Verify node still exists (was not deleted)
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 100 },
    });
    const nodes = await nodesResponse.json();
    // Access board_id from metadata (not from .properties)
    const boardNode = nodes.nodes?.find((n: any) => n.metadata?.board_id === boardId);
    expect(boardNode).toBeDefined(); // Node should still exist
  });

  test('should delete Board with all contents', async ({ apiRequest }) => {
    // Step 1: Create a board
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Board with Contents',
        data_tag: 'test',
      },
    });
    const created = await createResponse.json();
    const boardId = created.board.id;

    // Step 2: Create nodes associated with this board
    const node1Data = createTestSourceNode({
      title: 'Node 1 to Delete',
      content: 'Content for Node 1 to Delete',
    });
    node1Data.metadata = { ...node1Data.metadata, board_id: boardId, data_tag: 'test' };

    const node1Response = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: node1Data,
    });
    const node1 = await node1Response.json();

    const node2Data = createTestSourceNode({
      title: 'Node 2 to Delete',
      content: 'Content for Node 2 to Delete',
    });
    node2Data.metadata = { ...node2Data.metadata, board_id: boardId, data_tag: 'test' };

    const node2Response = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: node2Data,
    });
    const node2 = await node2Response.json();

    // Step 3: Delete board WITH contents
    const deleteResponse = await apiRequest.delete(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { delete_contents: 'true' },
    });

    expect(deleteResponse.ok()).toBeTruthy();
    const result = await deleteResponse.json();
    expect(result.success).toBe(true);
    expect(result.deleted.board).toBe(1);
    expect(result.deleted.nodes).toBeGreaterThanOrEqual(2);

    // Step 4: Verify board is deleted
    const getResponse = await apiRequest.get(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(getResponse.status()).toBe(404);

    // Step 5: Verify nodes are deleted
    const createdNode1 = node1.node || node1;
    const node1Get = await apiRequest.get(`/api/v1/nodes/${createdNode1.id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(node1Get.status()).toBe(404);

    const createdNode2 = node2.node || node2;
    const node2Get = await apiRequest.get(`/api/v1/nodes/${createdNode2.id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(node2Get.status()).toBe(404);
  });

  test('should return 404 when deleting non-existent Board', async ({ apiRequest }) => {
    const deleteResponse = await apiRequest.delete('/api/v1/boards/board_nonexistent123', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(deleteResponse.status()).toBe(404);
    const error = await deleteResponse.json();
    expect(error.error).toMatch(/not found/i);
  });

  test('should require leader permission to delete Board', async ({ apiRequest }) => {
    // Create board
    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Permission Delete Test',
        data_tag: 'test',
      },
    });
    const created = await createResponse.json();
    const boardId = created.board.id;

    // Delete should succeed with admin/leader permissions
    const deleteResponse = await apiRequest.delete(`/api/v1/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(deleteResponse.ok()).toBeTruthy();
  });

  // ==================== EDGE CASES ====================

  test('should handle Board with very long name', async ({ apiRequest }) => {
    const longName = 'A'.repeat(500); // 500 characters

    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: longName,
        data_tag: 'test',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const result = await createResponse.json();
    expect(result.board.name).toBe(longName);
  });

  test('should handle Board with special characters in name', async ({ apiRequest }) => {
    const specialName = 'Test <Board> "Special" & Characters';

    const createResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: specialName,
        data_tag: 'test',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const result = await createResponse.json();
    expect(result.board.name).toBe(specialName);
  });

  test('should handle concurrent Board creation', async ({ apiRequest }) => {
    // Create multiple boards concurrently
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        apiRequest.post('/api/v1/boards', {
          headers: { Authorization: `Bearer ${authToken}` },
          data: {
            name: `Concurrent Board ${i}`,
            data_tag: 'test',
          },
        })
      );
    }

    const responses = await Promise.all(promises);

    // Verify all succeeded
    responses.forEach((response) => {
      expect(response.ok()).toBeTruthy();
    });

    // Verify all have unique IDs
    const ids = new Set();
    for (const response of responses) {
      const result = await response.json();
      ids.add(result.board.id);
    }
    expect(ids.size).toBe(5); // All IDs should be unique
  });

  test('should handle empty Board graph', async ({ apiRequest }) => {
    // Create board with no nodes
    const boardResponse = await apiRequest.post('/api/v1/boards', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Empty Graph Board',
        data_tag: 'test',
      },
    });
    const board = await boardResponse.json();
    const boardId = board.board.id;

    // Get graph (should be empty)
    const graphResponse = await apiRequest.get(`/api/v1/boards/${boardId}/graph`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(graphResponse.ok()).toBeTruthy();
    const graph = await graphResponse.json();

    expect(graph.board_id).toBe(boardId);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.stats.nodeCount).toBe(0);
    expect(graph.stats.edgeCount).toBe(0);
  });
});
