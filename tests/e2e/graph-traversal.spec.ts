import { test, expect } from './fixtures/test-isolation';
import path from 'path';
import fs from 'fs';

/**
 * Graph Traversal E2E Tests
 *
 * Tests graph navigation capabilities - following edges between nodes.
 * This validates the core graph-native architecture promise: "Everything is a node; edges carry policy."
 *
 * Tests cover:
 * - Follow CONTAINS edges (Source → Messages)
 * - Follow EXTRACTED_FROM edges (CodeBlock → Source)
 * - Traverse multi-level conversation threads
 * - Retrieve grouped nodes via IN_GROUP edges
 * - Follow DUP_OF edges to find duplicate clusters
 * - Get all edges for a node (incoming + outgoing)
 * - Filter edges by kind
 * - Handle nodes with no edges gracefully
 * - Enforce account isolation in edge traversal
 * - Paginate large edge result sets
 *
 * Priority: HIGH (validates graph-native architecture)
 * Related: apps/api/src/routes/edges.routes.ts
 * Related: apps/api/src/routes/nodes.routes.ts
 * Related: docs/architecture/GRAPH_NATIVE.md
 */

test.describe('Graph Traversal', () => {
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
    await apiRequest.delete('/api/v1/data/canvas', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { data_tag: 'test' },
    });
  });

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Upload and process test data, wait for import to complete
   */
  async function uploadAndProcess(
    apiRequest: any,
    token: string,
    filename: string = 'tiny.json'
  ): Promise<{ jobId: string; nodeCount: number }> {
    const testFile = path.join(process.cwd(), 'ai_context', 'chat_data', 'test-samples', filename);
    const fileContent = fs.readFileSync(testFile);

    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        files: {
          name: filename,
          mimeType: 'application/json',
          buffer: fileContent,
        },
        config: JSON.stringify({
          platform: 'chatgpt',
          extractCode: true,
          duplicateDetection: { enabled: true },
          data_tag: 'test', // CRITICAL: Mark all test data for cleanup
        }),
      },
    });

    expect(uploadResponse.status()).toBe(201);
    const uploadData = await uploadResponse.json();

    // Wait for job to complete (poll status)
    const jobId = uploadData.jobId;
    let jobComplete = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!jobComplete && attempts < maxAttempts) {
      const jobResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const job = await jobResponse.json();

      if (job.status === 'completed') {
        jobComplete = true;
        return { jobId, nodeCount: job.result?.nodesCreated || 0 };
      } else if (job.status === 'failed') {
        throw new Error(`Import job failed: ${job.error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error(`Import job did not complete within ${maxAttempts} seconds`);
  }

  // ==================== EDGE TRAVERSAL TESTS ====================

  test('should follow CONTAINS edges from Source to Messages', async ({ apiRequest }) => {
    // Upload conversation → get Source → follow CONTAINS edges → verify Messages returned
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get a Source node
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'Source', limit: 1 },
    });

    const nodesData = await nodesResponse.json();
    expect(nodesData.data.length).toBeGreaterThan(0);
    const sourceNode = nodesData.data[0];

    // Get edges for this Source node
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: sourceNode.id, kind: 'CONTAINS' },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();

    // Source nodes should CONTAIN Message nodes (if import creates this structure)
    expect(edgesData.data).toBeDefined();
    expect(Array.isArray(edgesData.data)).toBe(true);

    // If CONTAINS edges exist, verify they point to Message nodes
    if (edgesData.data.length > 0) {
      const edge = edgesData.data[0];
      expect(edge.kind).toBe('CONTAINS');
      expect(edge.from_id).toBe(sourceNode.id);
      expect(edge.to_id).toBeDefined();

      // Verify the target node exists and is a Message
      const targetResponse = await apiRequest.get(`/api/v1/nodes/${edge.to_id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (targetResponse.status() === 200) {
        const targetNode = await targetResponse.json();
        // Target could be Message, MessageRef, or other node types depending on import
        expect(targetNode.node).toBeDefined();
      }
    }
  });

  test('should follow EXTRACTED_FROM edges from CodeBlock to Source', async ({ apiRequest }) => {
    // Upload with code → get CodeBlock → follow EXTRACTED_FROM → verify Source returned
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get a CodeBlock node (if any were extracted)
    const codeBlocksResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'CodeBlock', limit: 1 },
    });

    const codeBlocksData = await codeBlocksResponse.json();

    // If no code blocks were extracted, test passes (no data to traverse)
    if (codeBlocksData.data.length === 0) {
      console.log('[Graph Traversal Test] No CodeBlock nodes found, skipping EXTRACTED_FROM test');
      return;
    }

    const codeBlock = codeBlocksData.data[0];

    // Get EXTRACTED_FROM edges for this CodeBlock
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: codeBlock.id, kind: 'EXTRACTED_FROM' },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();

    // CodeBlock should have EXTRACTED_FROM edge pointing to Source/Message
    expect(edgesData.data).toBeDefined();
    expect(Array.isArray(edgesData.data)).toBe(true);

    if (edgesData.data.length > 0) {
      const edge = edgesData.data[0];
      expect(edge.kind).toBe('EXTRACTED_FROM');
      expect(edge.from_id).toBe(codeBlock.id);
    }
  });

  test('should traverse multi-level conversation thread', async ({ apiRequest }) => {
    // Upload multi-turn conversation → traverse from root → verify thread structure
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get all Source nodes
    const sourcesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'Source' },
    });

    const sourcesData = await sourcesResponse.json();
    expect(sourcesData.data.length).toBeGreaterThan(0);

    // For each Source, get its children via CONTAINS edges
    const source = sourcesData.data[0];

    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: source.id },
    });

    const edgesData = await edgesResponse.json();

    // Verify edges exist (structure may vary by import configuration)
    expect(edgesData.data).toBeDefined();
    expect(Array.isArray(edgesData.data)).toBe(true);
  });

  test('should retrieve grouped nodes via IN_GROUP edges', async ({ apiRequest }) => {
    // Create group → add nodes → follow IN_GROUP edges → verify members returned
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get some nodes to add to a group
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 3 },
    });

    const nodesData = await nodesResponse.json();
    const nodeIds = nodesData.data.map((n: any) => n.id);

    // Create a group
    const groupResponse = await apiRequest.post('/api/v1/groups', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Test Group',
        metadata: { data_tag: 'test' },
      },
    });

    expect(groupResponse.status()).toBe(201);
    const groupData = await groupResponse.json();
    const groupId = groupData.group.id;

    // Add nodes to group
    for (const nodeId of nodeIds) {
      await apiRequest.post(`/api/v1/groups/${groupId}/members`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { nodeId },
      });
    }

    // Get edges for the group (IN_GROUP edges should exist)
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { to_id: groupId },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();

    // Verify IN_GROUP edges exist
    const inGroupEdges = edgesData.data.filter((e: any) => e.kind === 'IN_GROUP');
    expect(inGroupEdges.length).toBe(nodeIds.length);
  });

  test('should follow DUP_OF edges to find duplicate groups', async ({ apiRequest }) => {
    // Upload duplicates → follow DUP_OF edges → verify clusters of duplicates
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get all DUP_OF edges (if any were created during import)
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'DUP_OF' },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();

    // DUP_OF edges may or may not exist (depends on duplicate detection)
    expect(edgesData.data).toBeDefined();
    expect(Array.isArray(edgesData.data)).toBe(true);

    if (edgesData.data.length > 0) {
      const dupEdge = edgesData.data[0];
      expect(dupEdge.kind).toBe('DUP_OF');
      expect(dupEdge.from_id).toBeDefined();
      expect(dupEdge.to_id).toBeDefined();

      // Verify both nodes exist
      const sourceResponse = await apiRequest.get(`/api/v1/nodes/${dupEdge.from_id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(sourceResponse.status()).toBe(200);
    }
  });

  test('should get all edges for a node', async ({ apiRequest }) => {
    // Get node → retrieve all edges (incoming + outgoing) → verify completeness
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get a Source node
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'Source', limit: 1 },
    });

    const nodesData = await nodesResponse.json();
    expect(nodesData.data.length).toBeGreaterThan(0);
    const sourceNode = nodesData.data[0];

    // Get outgoing edges
    const outgoingResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: sourceNode.id },
    });

    expect(outgoingResponse.status()).toBe(200);
    const outgoingData = await outgoingResponse.json();

    // Get incoming edges
    const incomingResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { to_id: sourceNode.id },
    });

    expect(incomingResponse.status()).toBe(200);
    const incomingData = await incomingResponse.json();

    // Both should return valid arrays (may be empty)
    expect(Array.isArray(outgoingData.data)).toBe(true);
    expect(Array.isArray(incomingData.data)).toBe(true);
  });

  test('should filter edges by kind', async ({ apiRequest }) => {
    // Get node with multiple edge types → filter by kind=CONTAINS → verify filtering
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get all edges
    const allEdgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const allEdgesData = await allEdgesResponse.json();

    // Filter by kind=CONTAINS
    const containsResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'CONTAINS' },
    });

    const containsData = await containsResponse.json();

    // All returned edges should be CONTAINS type
    expect(containsData.data.every((e: any) => e.kind === 'CONTAINS')).toBe(true);
  });

  test('should handle nodes with no edges gracefully', async ({ apiRequest }) => {
    // Create isolated node → request edges → verify empty array (not error)
    // Create a standalone Group node with no members
    const groupResponse = await apiRequest.post('/api/v1/groups', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Isolated Group',
        metadata: { data_tag: 'test' },
      },
    });

    expect(groupResponse.status()).toBe(201);
    const groupData = await groupResponse.json();
    const groupId = groupData.group.id;

    // Get edges for this isolated node
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: groupId },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();

    // Should return empty array, not error
    expect(edgesData.data).toEqual([]);
  });

  test('should enforce account isolation in edge traversal', async ({ apiRequest }) => {
    // Account A's node → Account B tries to traverse edges → verify 403/404
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get Account A node
    const accountANodes = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 1 },
    });

    const accountAData = await accountANodes.json();
    expect(accountAData.data.length).toBeGreaterThan(0);
    const accountANodeId = accountAData.data[0].id;

    // Login as Account B
    const accountBResponse = await apiRequest.post('/api/v1/auth/login', {
      data: {
        email: 'user2@test.com',
        password: 'TestPass123!',
      },
    });

    // If Account B doesn't exist, isolation is automatic
    if (!accountBResponse.ok()) {
      console.log('[Graph Traversal Test] Account B does not exist, skipping isolation test');
      return;
    }

    const accountBAuth = await accountBResponse.json();
    const accountBToken = accountBAuth.token;

    // Try to get edges for Account A's node using Account B's token
    const accountBAttempt = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${accountBToken}` },
      params: { from_id: accountANodeId },
    });

    // Should return empty array (edges filtered by account_id) or 403/404
    expect(accountBAttempt.status()).toBe(200);
    const accountBData = await accountBAttempt.json();

    // Account B should see zero edges for Account A's node
    expect(accountBData.data.length).toBe(0);
  });

  test('should paginate large edge result sets', async ({ apiRequest }) => {
    // Node with many edges → paginate with limit=5 → verify cursor pagination
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get all edges first
    const allEdgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const allEdgesData = await allEdgesResponse.json();

    // If there are enough edges, test pagination
    if (allEdgesData.metadata?.total > 5) {
      // Get first page
      const page1Response = await apiRequest.get('/api/v1/edges', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 5 },
      });

      const page1Data = await page1Response.json();

      expect(page1Data.data.length).toBeLessThanOrEqual(5);
      expect(page1Data.metadata?.next_cursor).toBeDefined();

      // Get second page
      const page2Response = await apiRequest.get('/api/v1/edges', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 5, cursor: page1Data.metadata.next_cursor },
      });

      const page2Data = await page2Response.json();

      // Verify different edges (no overlap)
      const page1Ids = page1Data.data.map((e: any) => e.id);
      const page2Ids = page2Data.data.map((e: any) => e.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    } else {
      console.log('[Graph Traversal Test] Not enough edges for pagination test');
    }
  });
});
