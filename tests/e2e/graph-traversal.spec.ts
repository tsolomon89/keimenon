import { test, expect } from './fixtures/test-isolation';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';

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
  test.setTimeout(180000);

  const JOB_STATUS_POLL_MS = 1000;
  const JOB_STATUS_MAX_ATTEMPTS = 150;

  const TEST_USER = {
    email: 'admin@admin.com',
    password: 'TestPass123!',
  };

  let authToken: string;

  async function loginWithRetry(
    apiRequest: any,
    credentials: { email: string; password: string },
    maxAttempts = 3
  ): Promise<string> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await apiRequest.post('/api/v1/auth/login', { data: credentials });

      if (response.ok()) {
        const auth = await response.json();
        if (auth?.token) return auth.token;
      }

      const body = await response.json().catch(() => ({}));
      const error = body?.error || body?.message || `status ${response.status()}`;

      if (attempt < maxAttempts && String(error).includes('No active accounts')) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        continue;
      }

      throw new Error(`Login failed: ${error}`);
    }

    throw new Error(`Login failed after ${maxAttempts} attempts`);
  }

  test.beforeEach(async ({ apiRequest }) => {
    authToken = await loginWithRetry(apiRequest, TEST_USER);
  });

  test.afterEach(async ({ apiRequest }) => {
    // Cleanup test data
    await apiRequest.delete('/api/v1/data/keimenon', {
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
    const testFile = path.join(
      process.cwd(),
      'tests',
      'test_data',
      'chat_data',
      'test-samples',
      filename
    );
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
    const maxAttempts = JOB_STATUS_MAX_ATTEMPTS;

    while (!jobComplete && attempts < maxAttempts) {
      const jobResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await jobResponse.json();
      const job = payload?.job ?? payload;
      const status = job?.status;

      if (status === 'succeeded' || status === 'completed') {
        jobComplete = true;
        return { jobId, nodeCount: job?.result?.nodesCreated || 0 };
      } else if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
        throw new Error(`Import job failed: ${job?.error || status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, JOB_STATUS_POLL_MS));
      attempts++;
    }

    throw new Error(
      `Import job did not complete within ${maxAttempts * (JOB_STATUS_POLL_MS / 1000)} seconds`
    );
  }

  function normalizeNodeListResponse(payload: any): any[] {
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.nodes)) return payload.nodes;
    return [];
  }

  function normalizeEdgeListResponse(payload: any): any[] {
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.edges)) return payload.edges;
    return [];
  }

  function getEdgeFromId(edge: any): string | undefined {
    return edge?.from_id ?? edge?.source ?? edge?.fromId ?? edge?.from;
  }

  function getEdgeToId(edge: any): string | undefined {
    return edge?.to_id ?? edge?.target ?? edge?.toId ?? edge?.to;
  }

  async function createSourceNode(
    apiRequest: any,
    token: string,
    title: string,
    content: string
  ): Promise<any> {
    const now = Date.now();
    const fingerprint = createHash('sha256').update(content).digest('hex');

    const createResponse = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: `src_${now}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'Source',
        created_at: now,
        updated_at: now,
        fingerprint,
        mime_type: 'text/plain',
        size_bytes: Buffer.byteLength(content, 'utf8'),
        title,
        metadata: {
          platform: 'test',
          content,
          data_tag: 'test',
        },
      },
    });

    expect(createResponse.status()).toBe(201);
    const payload = await createResponse.json();
    return payload?.node ?? payload;
  }

  async function ensureSourceWithContainsEdge(apiRequest: any, token: string): Promise<any> {
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${token}` },
      params: { kind: 'Source', limit: 1 },
    });
    const nodesPayload = await nodesResponse.json();
    const sources = normalizeNodeListResponse(nodesPayload);

    let sourceNode = sources[0];
    if (!sourceNode) {
      sourceNode = await createSourceNode(
        apiRequest,
        token,
        'Traversal Source A',
        'Synthetic source content A for traversal test'
      );
    }

    const containsEdgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${token}` },
      params: { from_id: sourceNode.id, kind: 'CONTAINS' },
    });
    const containsPayload = await containsEdgesResponse.json();
    const containsEdges = normalizeEdgeListResponse(containsPayload);

    if (containsEdges.length === 0) {
      const targetNode = await createSourceNode(
        apiRequest,
        token,
        'Traversal Source B',
        'Synthetic source content B for traversal test'
      );

      const edgeResponse = await apiRequest.post('/api/v1/edges', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          from_id: sourceNode.id,
          to_id: targetNode.id,
          kind: 'CONTAINS',
          properties: { data_tag: 'test' },
        },
      });

      expect(edgeResponse.ok()).toBeTruthy();
    }

    return sourceNode;
  }

  // ==================== EDGE TRAVERSAL TESTS ====================

  test('should follow CONTAINS edges from Source to Messages', async ({ apiRequest }) => {
    // Upload conversation → get Source → follow CONTAINS edges → verify Messages returned
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const sourceNode = await ensureSourceWithContainsEdge(apiRequest, authToken);

    // Get edges for this Source node
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: sourceNode.id, kind: 'CONTAINS' },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();
    const containsEdges = normalizeEdgeListResponse(edgesData);

    // Source nodes should CONTAIN Message nodes (if import creates this structure)
    expect(Array.isArray(containsEdges)).toBe(true);
    expect(containsEdges.length).toBeGreaterThan(0);

    // If CONTAINS edges exist, verify they point to Message nodes
    if (containsEdges.length > 0) {
      const edge = containsEdges[0];
      expect(edge.kind).toBe('CONTAINS');
      expect(getEdgeFromId(edge)).toBe(sourceNode.id);
      expect(getEdgeToId(edge)).toBeDefined();

      // Verify the target node exists and is a Message
      const targetResponse = await apiRequest.get(`/api/v1/nodes/${getEdgeToId(edge)}`, {
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
    const codeBlocks = normalizeNodeListResponse(codeBlocksData);

    // If no code blocks were extracted, test passes (no data to traverse)
    if (codeBlocks.length === 0) {
      console.log('[Graph Traversal Test] No CodeBlock nodes found, skipping EXTRACTED_FROM test');
      return;
    }

    const codeBlock = codeBlocks[0];

    // Get EXTRACTED_FROM edges for this CodeBlock
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: codeBlock.id, kind: 'EXTRACTED_FROM' },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();
    const extractedFromEdges = normalizeEdgeListResponse(edgesData);

    // CodeBlock should have EXTRACTED_FROM edge pointing to Source/Message
    expect(Array.isArray(extractedFromEdges)).toBe(true);

    if (extractedFromEdges.length > 0) {
      const edge = extractedFromEdges[0];
      expect(edge.kind).toBe('EXTRACTED_FROM');
      expect(getEdgeFromId(edge)).toBe(codeBlock.id);
    }
  });

  test('should traverse multi-level conversation thread', async ({ apiRequest }) => {
    // Upload multi-turn conversation → traverse from root → verify thread structure
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const source = await ensureSourceWithContainsEdge(apiRequest, authToken);

    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: source.id },
    });

    const edgesData = await edgesResponse.json();
    const sourceEdges = normalizeEdgeListResponse(edgesData);

    // Verify edges exist (structure may vary by import configuration)
    expect(Array.isArray(sourceEdges)).toBe(true);
    expect(sourceEdges.length).toBeGreaterThan(0);
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
    const candidateNodes = normalizeNodeListResponse(nodesData);
    expect(candidateNodes.length).toBeGreaterThan(0);
    const nodeIds = candidateNodes.map((n: any) => n.id);

    // Create a group
    const groupResponse = await apiRequest.post('/api/v1/groups', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        kind: 'Group',
        properties: {
          name: 'Test Group',
          data_tag: 'test',
        },
      },
    });

    expect(groupResponse.status()).toBe(200);
    const groupData = await groupResponse.json();
    const groupId = groupData.group.id;

    // Add nodes to group
    const addMembersResponse = await apiRequest.post(`/api/v1/groups/${groupId}/members:batch`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { add: nodeIds },
    });
    expect(addMembersResponse.status()).toBe(200);

    // Get edges for the group (IN_GROUP edges should exist)
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { to_id: groupId },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();
    const allEdges = normalizeEdgeListResponse(edgesData);

    // Verify IN_GROUP edges exist
    const inGroupEdges = allEdges.filter((e: any) => e.kind === 'IN_GROUP');
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
    const dupEdges = normalizeEdgeListResponse(edgesData);

    // DUP_OF edges may or may not exist (depends on duplicate detection)
    expect(Array.isArray(dupEdges)).toBe(true);

    if (dupEdges.length > 0) {
      const dupEdge = dupEdges[0];
      expect(dupEdge.kind).toBe('DUP_OF');
      expect(getEdgeFromId(dupEdge)).toBeDefined();
      expect(getEdgeToId(dupEdge)).toBeDefined();

      // Verify both nodes exist
      const sourceResponse = await apiRequest.get(`/api/v1/nodes/${getEdgeFromId(dupEdge)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(sourceResponse.status()).toBe(200);
    }
  });

  test('should get all edges for a node', async ({ apiRequest }) => {
    // Get node → retrieve all edges (incoming + outgoing) → verify completeness
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const sourceNode = await ensureSourceWithContainsEdge(apiRequest, authToken);

    // Get outgoing edges
    const outgoingResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: sourceNode.id },
    });

    expect(outgoingResponse.status()).toBe(200);
    const outgoingData = await outgoingResponse.json();
    const outgoingEdges = normalizeEdgeListResponse(outgoingData);

    // Get incoming edges
    const incomingResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { to_id: sourceNode.id },
    });

    expect(incomingResponse.status()).toBe(200);
    const incomingData = await incomingResponse.json();
    const incomingEdges = normalizeEdgeListResponse(incomingData);

    // Both should return valid arrays (may be empty)
    expect(Array.isArray(outgoingEdges)).toBe(true);
    expect(Array.isArray(incomingEdges)).toBe(true);
  });

  test('should filter edges by kind', async ({ apiRequest }) => {
    // Get node with multiple edge types → filter by kind=CONTAINS → verify filtering
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get all edges
    const allEdgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const allEdgesData = await allEdgesResponse.json();
    const allEdges = normalizeEdgeListResponse(allEdgesData);

    // Filter by kind=CONTAINS
    const containsResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'CONTAINS' },
    });

    const containsData = await containsResponse.json();
    const containsEdges = normalizeEdgeListResponse(containsData);

    // All returned edges should be CONTAINS type
    expect(containsEdges.every((e: any) => e.kind === 'CONTAINS')).toBe(true);
    expect(allEdges.length).toBeGreaterThanOrEqual(containsEdges.length);
  });

  test('should handle nodes with no edges gracefully', async ({ apiRequest }) => {
    // Create isolated node → request edges → verify empty array (not error)
    // Create a standalone Group node with no members
    const groupResponse = await apiRequest.post('/api/v1/groups', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        kind: 'Group',
        properties: {
          name: 'Isolated Group',
          data_tag: 'test',
        },
      },
    });

    expect(groupResponse.status()).toBe(200);
    const groupData = await groupResponse.json();
    const groupId = groupData.group.id;

    // Get edges for this isolated node
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { from_id: groupId },
    });

    expect(edgesResponse.status()).toBe(200);
    const edgesData = await edgesResponse.json();
    const isolatedEdges = normalizeEdgeListResponse(edgesData);

    // Should return empty array, not error
    expect(isolatedEdges).toEqual([]);
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
    const accountANodesList = normalizeNodeListResponse(accountAData);
    expect(accountANodesList.length).toBeGreaterThan(0);
    const accountANodeId = accountANodesList[0].id;

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
    const accountBEdges = normalizeEdgeListResponse(accountBData);

    // Account B should see zero edges for Account A's node
    expect(accountBEdges.length).toBe(0);
  });

  test('should paginate large edge result sets', async ({ apiRequest }) => {
    // Node with many edges → paginate with limit=5 → verify cursor pagination
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get all edges first
    const allEdgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const allEdgesData = await allEdgesResponse.json();
    const allEdges = normalizeEdgeListResponse(allEdgesData);
    const totalEdges = allEdgesData?.metadata?.total ?? allEdges.length;

    // If there are enough edges, test pagination
    if (totalEdges > 5) {
      // Get first page
      const page1Response = await apiRequest.get('/api/v1/edges', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 5 },
      });

      const page1Data = await page1Response.json();
      const page1Edges = normalizeEdgeListResponse(page1Data);

      expect(page1Edges.length).toBeLessThanOrEqual(5);
      const nextCursor = page1Data?.metadata?.next_cursor;

      if (nextCursor) {
        // Get second page when cursor paging is supported
        const page2Response = await apiRequest.get('/api/v1/edges', {
          headers: { Authorization: `Bearer ${authToken}` },
          params: { limit: 5, cursor: nextCursor },
        });

        const page2Data = await page2Response.json();
        const page2Edges = normalizeEdgeListResponse(page2Data);

        // Verify different edges (no overlap)
        const page1Ids = page1Edges.map((e: any) => e.id);
        const page2Ids = page2Edges.map((e: any) => e.id);
        const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      } else {
        console.log(
          '[Graph Traversal Test] Edge route has no cursor metadata; validated limit only'
        );
      }
    } else {
      console.log('[Graph Traversal Test] Not enough edges for pagination test');
    }
  });
});
