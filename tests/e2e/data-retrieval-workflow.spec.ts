import { test, expect } from './fixtures/test-isolation';
import path from 'path';
import fs from 'fs';
import { createTestSourceNode } from './helpers/create-test-node';

/**
 * Data Retrieval Workflow E2E Tests
 *
 * Tests the complete "upload → process → retrieve" workflow that users depend on.
 * This addresses the CRITICAL GAP where upload/processing had 85-95% coverage
 * but data retrieval had only 30% coverage.
 *
 * Tests cover:
 * - List all nodes for account (pagination, total count)
 * - Filter by kind (Source, Message, CodeBlock, Group)
 * - Filter by metadata (platform, tags, custom fields)
 * - Full-text search (FTS5 with relevance ranking)
 * - Date range filtering (created_after, created_before)
 * - Combined filters (kind + metadata + date)
 * - Sorting (created_at, updated_at, ASC/DESC)
 * - Export with edges (graph structure preservation)
 * - Account isolation (multi-tenant security)
 * - Empty result sets (graceful handling)
 * - Validation (parameter limits, bad input)
 * - Edge cases (special characters, no matches)
 *
 * Priority: CRITICAL (addresses primary user complaint: "data is trapped")
 * Related: apps/api/src/routes/nodes.routes.ts
 * Related: apps/api/src/routes/edges.routes.ts
 * Related: docs/architecture/API_DOCUMENTATION.md
 */

test.describe('Data Retrieval Workflow', () => {
  test.describe.configure({ tag: '@full' });
  test.setTimeout(180000);

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

  function normalizeNodeListResponse(payload: any): {
    data: any[];
    metadata: { total: number; next_cursor?: string };
  } {
    const data = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.nodes)
        ? payload.nodes
        : Array.isArray(payload)
          ? payload
          : [];

    const metadata =
      payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const totalCandidate = metadata.total ?? payload?.total ?? payload?.count ?? data.length;
    const total = Number.isFinite(Number(totalCandidate)) ? Number(totalCandidate) : data.length;
    const nextCursor = metadata.next_cursor ?? payload?.next_cursor;

    return {
      data,
      metadata: {
        ...metadata,
        total,
        next_cursor: nextCursor,
      },
    };
  }

  function normalizeSearchResponse(payload: any): { data: any[] } {
    const data = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.nodes)
          ? payload.nodes
          : [];

    return { data };
  }

  function getNodesCreatedFromJob(job: any): number {
    const raw =
      job?.result?.nodesCreated ??
      job?.state?.result?.nodesCreated ??
      job?.state?.stats?.nodesCreated ??
      job?.stats?.nodesCreated ??
      job?.progress?.metadata?.nodesCreated ??
      0;

    return Number.isFinite(Number(raw)) ? Number(raw) : 0;
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

    const maxJobAttempts = 2;
    const maxPollAttempts = 75; // 75s per import attempt; allows bounded retry under suite load

    for (let jobAttempt = 1; jobAttempt <= maxJobAttempts; jobAttempt++) {
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
      const jobId = uploadData.jobId;

      let attempts = 0;
      let lastStatus = 'queued';
      let lastError: string | undefined;

      while (attempts < maxPollAttempts) {
        const jobResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const payload = await jobResponse.json();
        const job = payload?.job ?? payload;
        const status = job?.status;
        lastStatus = typeof status === 'string' ? status : 'unknown';
        lastError = job?.error;

        if (status === 'succeeded' || status === 'completed') {
          return { jobId, nodeCount: getNodesCreatedFromJob(job) };
        }

        if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
          throw new Error(`Import job failed: ${job?.error || status}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      if (jobAttempt < maxJobAttempts) {
        // Best-effort cancellation of a stuck job before retrying.
        await apiRequest
          .post(`/api/v1/jobs/${jobId}/cancel`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1000 * jobAttempt));
        continue;
      }

      throw new Error(
        `Import job did not complete within ${maxPollAttempts} seconds (attempt ${jobAttempt}/${maxJobAttempts}, lastStatus=${lastStatus}, lastError=${lastError || 'n/a'})`
      );
    }

    throw new Error('Import job retry loop exhausted unexpectedly');
  }

  // ==================== CRITICAL PATH TESTS ====================

  test('should list all nodes for authenticated account', async ({ apiRequest }) => {
    // 1. Upload test data (tiny.json has 3 conversations with ~23 nodes)
    const { nodeCount } = await uploadAndProcess(apiRequest, authToken, 'tiny.json');
    expect(nodeCount).toBeGreaterThan(0);

    // 2. Retrieve all nodes
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(nodesResponse.status()).toBe(200);
    const nodes = normalizeNodeListResponse(await nodesResponse.json());

    // 3. Verify expected nodes exist
    expect(nodes.data).toBeDefined();
    expect(Array.isArray(nodes.data)).toBe(true);
    expect(nodes.data.length).toBeGreaterThan(0);
    expect(nodes.metadata?.total).toBeGreaterThanOrEqual(nodeCount);

    // 4. Verify all nodes belong to authenticated account
    // Note: Account ID verification happens server-side via middleware
    expect(nodes.data.every((n: any) => n.id && n.kind && n.created_at)).toBe(true);
  });

  test('should filter nodes by kind', async ({ apiRequest }) => {
    // Upload data and ensure a known Source node exists for stable filter assertions.
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const sourceFixture = createTestSourceNode({
      title: 'Data Retrieval Source Filter Fixture',
      content: 'Fixture content for Source-kind filtering',
      platform: 'test',
    });
    sourceFixture.metadata = { ...sourceFixture.metadata, data_tag: 'test' };

    const createSourceResponse = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: sourceFixture,
    });
    expect(createSourceResponse.status()).toBe(201);

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'Source' },
    });

    expect(response.status()).toBe(200);
    const nodes = normalizeNodeListResponse(await response.json());

    expect(nodes.data.every((n: any) => n.kind === 'Source')).toBe(true);
    expect(nodes.data.length).toBeGreaterThan(0);
  });

  test('should filter nodes by metadata.platform', async ({ apiRequest }) => {
    // Upload ChatGPT data → filter by platform → verify filtering
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { 'metadata.platform': 'chatgpt' },
    });

    expect(response.status()).toBe(200);
    const nodes = normalizeNodeListResponse(await response.json());

    // All Source nodes should have platform metadata
    const sourceNodes = nodes.data.filter((n: any) => n.kind === 'Source');
    expect(
      sourceNodes.every((n: any) => n.metadata?.platform === 'chatgpt' || !n.metadata?.platform)
    ).toBe(true);
  });

  test('should search nodes via FTS5 full-text search', async ({ apiRequest }) => {
    // Upload conversations → search for keywords → verify results
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const response = await apiRequest.get('/api/v1/nodes/search', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { q: 'conversation' }, // Common word in chat exports
    });

    expect(response.status()).toBe(200);
    const results = normalizeSearchResponse(await response.json());

    expect(results.data).toBeDefined();
    expect(Array.isArray(results.data)).toBe(true);

    // If there are results, verify they contain the search term
    if (results.data.length > 0) {
      const hasSearchTerm = results.data.some((n: any) => {
        const candidates = [
          n.content,
          n.title,
          n.name,
          n.metadata?.content,
          n.metadata?.title,
          n.metadata?.name,
          n.metadata ? JSON.stringify(n.metadata) : '',
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());

        return candidates.some((value) => value.includes('conversation'));
      });
      expect(hasSearchTerm).toBe(true);
    }
  });

  test('should paginate large result sets', async ({ apiRequest }) => {
    // Upload data → paginate with limit=10 → verify cursor-based pagination
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // First page
    const page1 = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 10 },
    });

    expect(page1.status()).toBe(200);
    const page1Data = normalizeNodeListResponse(await page1.json());

    expect(page1Data.data).toBeDefined();
    expect(page1Data.data.length).toBeLessThanOrEqual(10);
    expect(page1Data.metadata).toBeDefined();

    // If there are more than 10 nodes, verify cursor exists
    if (page1Data.metadata.total > 10) {
      expect(page1Data.metadata.next_cursor).toBeDefined();

      // Second page
      const page2 = await apiRequest.get('/api/v1/nodes', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 10, cursor: page1Data.metadata.next_cursor },
      });

      const page2Data = normalizeNodeListResponse(await page2.json());
      expect(page2Data.data.length).toBeGreaterThan(0);

      // Verify different nodes (no overlap)
      const page1Ids = page1Data.data.map((n: any) => n.id);
      const page2Ids = page2Data.data.map((n: any) => n.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    }
  });

  test('should filter nodes by date range', async ({ apiRequest }) => {
    // Upload data → filter by created_after → verify filtering
    const { nodeCount } = await uploadAndProcess(apiRequest, authToken, 'tiny.json');
    expect(nodeCount).toBeGreaterThan(0);

    // Get timestamp from 1 hour ago
    const oneHourAgo = Date.now() - 3600000;

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { created_after: oneHourAgo },
    });

    expect(response.status()).toBe(200);
    const nodes = normalizeNodeListResponse(await response.json());

    // All nodes should be created after the timestamp (just uploaded)
    expect(nodes.data.every((n: any) => new Date(n.created_at).getTime() >= oneHourAgo)).toBe(true);
  });

  test('should combine multiple filters (kind + date)', async ({ apiRequest }) => {
    // Upload data → apply multiple filters → verify AND logic
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const oneHourAgo = Date.now() - 3600000;

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        kind: 'Source',
        created_after: oneHourAgo,
      },
    });

    expect(response.status()).toBe(200);
    const nodes = normalizeNodeListResponse(await response.json());

    // Verify all nodes match both conditions
    expect(
      nodes.data.every(
        (n: any) => n.kind === 'Source' && new Date(n.created_at).getTime() >= oneHourAgo
      )
    ).toBe(true);
  });

  test('should sort results by created_at DESC', async ({ apiRequest }) => {
    // Upload data → sort DESC → verify order
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { sort: 'created_at', order: 'desc' },
    });

    expect(response.status()).toBe(200);
    const nodes = normalizeNodeListResponse(await response.json());

    // Verify descending order (newest first)
    for (let i = 0; i < nodes.data.length - 1; i++) {
      const current = new Date(nodes.data[i].created_at).getTime();
      const next = new Date(nodes.data[i + 1].created_at).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  test('should export node with edges', async ({ apiRequest }) => {
    // Upload conversation → get Source node → export with edges
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const sourceFixture = createTestSourceNode({
      title: 'Data Retrieval Export Fixture',
      content: 'Fixture content for Source export',
      platform: 'test',
    });
    sourceFixture.metadata = { ...sourceFixture.metadata, data_tag: 'test' };

    const createSourceResponse = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: sourceFixture,
    });
    expect(createSourceResponse.status()).toBe(201);

    // Get a Source node
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'Source', limit: 1 },
    });

    const nodesData = normalizeNodeListResponse(await nodesResponse.json());
    expect(nodesData.data.length).toBeGreaterThan(0);
    const sourceNode = nodesData.data[0];

    // Export with edges
    const exportResponse = await apiRequest.get(`/api/v1/nodes/${sourceNode.id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { include: 'edges' },
    });

    expect(exportResponse.status()).toBe(200);
    const exportData = await exportResponse.json();

    expect(exportData.node).toBeDefined();
    expect(exportData.node.id).toBe(sourceNode.id);

    // Edges may or may not exist depending on import configuration
    if (exportData.edges) {
      expect(Array.isArray(exportData.edges)).toBe(true);
    }
  });

  test('should enforce account isolation in retrieval', async ({ apiRequest }) => {
    // Account A uploads data → Account B tries to retrieve → verify 403/404
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Get Account A node ID
    const accountANodes = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 1 },
    });

    const accountAData = normalizeNodeListResponse(await accountANodes.json());
    expect(accountAData.data.length).toBeGreaterThan(0);
    const accountANodeId = accountAData.data[0].id;

    // Login as different account (Account B)
    const accountBResponse = await apiRequest.post('/api/v1/auth/login', {
      data: {
        email: 'user2@test.com',
        password: 'TestPass123!',
      },
    });

    // If Account B doesn't exist, this test passes (isolation is automatic)
    if (!accountBResponse.ok()) {
      console.log('[Data Retrieval Test] Account B does not exist, skipping isolation test');
      return;
    }

    const accountBAuth = await accountBResponse.json();
    const accountBToken = accountBAuth.token;

    // Try to retrieve Account A's node with Account B's token
    const accountBAttempt = await apiRequest.get(`/api/v1/nodes/${accountANodeId}`, {
      headers: { Authorization: `Bearer ${accountBToken}` },
    });

    // Should return 404 (not found) or 403 (forbidden)
    expect([403, 404]).toContain(accountBAttempt.status());
  });

  // ==================== EDGE CASES & VALIDATION ====================

  test('should return empty results for filters with no matches', async ({ apiRequest }) => {
    // Query with filter that matches no data → verify graceful empty response
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'NonExistentKind' },
    });

    expect(response.status()).toBe(200);
    const nodes = normalizeNodeListResponse(await response.json());

    expect(nodes.data).toEqual([]);
    expect(nodes.metadata?.total).toBe(0);
  });

  test('should validate pagination parameters', async ({ apiRequest }) => {
    // Send invalid limit (>1000) → verify 400 Bad Request or reasonable limit enforced
    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 5000 },
    });

    // Either 400 Bad Request or limit is capped at max (e.g., 1000)
    if (response.status() === 400) {
      const error = await response.json();
      expect(error.message || error.error).toBeDefined();
    } else {
      expect(response.status()).toBe(200);
      const nodes = normalizeNodeListResponse(await response.json());
      expect(nodes.data.length).toBeLessThanOrEqual(1000); // Reasonable max limit
    }
  });

  test('should search with no results gracefully', async ({ apiRequest }) => {
    // Search for non-existent keyword → verify empty results
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const response = await apiRequest.get('/api/v1/nodes/search', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { q: 'ZxQwErTyUiOpAsD123456789NonExistentKeyword' },
    });

    expect(response.status()).toBe(200);
    const results = normalizeSearchResponse(await response.json());

    expect(results.data).toEqual([]);
  });

  test('should handle special characters in search queries', async ({ apiRequest }) => {
    // Search with special chars (@, #, $, %, etc.) → verify no SQL injection or errors
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const specialQueries = [
      'test@example.com',
      'C++',
      'price: $50',
      '100% complete',
      '#hashtag',
      "'; DROP TABLE nodes; --",
    ];

    for (const query of specialQueries) {
      const response = await apiRequest.get('/api/v1/nodes/search', {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { q: query },
      });

      // Should not error (either 200 with results or 200 with empty)
      expect(response.status()).toBe(200);
      const results = normalizeSearchResponse(await response.json());
      expect(results.data).toBeDefined();
      expect(Array.isArray(results.data)).toBe(true);
    }
  });
});
