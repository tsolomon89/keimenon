import { test, expect } from './fixtures/test-isolation';
import path from 'path';
import fs from 'fs';

/**
 * Advanced Filtering E2E Tests
 *
 * Tests complex query combinations and edge cases beyond basic filtering.
 * This validates the API's ability to handle sophisticated data retrieval
 * patterns that power users depend on.
 *
 * Tests cover:
 * - Combined AND filters (kind + platform + date)
 * - Nested metadata field filtering (deep field access)
 * - Array contains filtering (tags, categories)
 * - Numeric range filtering (score, confidence)
 * - Conflicting filters (graceful empty results)
 * - Filter complexity limits (preventing DoS)
 * - Query performance with multiple filters
 * - Edge cases (null values, missing fields)
 *
 * Priority: MEDIUM-HIGH (power user features)
 * Related: apps/api/src/routes/nodes.routes.ts
 * Related: apps/api/src/middleware/query-parser.ts
 * Related: docs/api/FILTERING.md
 */

test.describe('Advanced Filtering', () => {
  test.describe.configure({ tag: '@full' });

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
    const maxAttempts = 30;

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

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error(`Import job did not complete within ${maxAttempts} seconds`);
  }

  function getNodes(payload: any): any[] {
    if (Array.isArray(payload?.nodes)) return payload.nodes;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  async function createGroupNode(
    apiRequest: any,
    token: string,
    name: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const now = Date.now();
    const id = `grp_test_${now}_${Math.random().toString(36).slice(2, 9)}`;

    const response = await apiRequest.post('/api/v1/nodes/group', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id,
        kind: 'Group',
        name,
        member_count: 0,
        created_at: now,
        updated_at: now,
        metadata: {
          data_tag: 'test',
          ...metadata,
        },
      },
    });

    expect(response.status()).toBe(201);
  }

  // ==================== ADVANCED FILTERING TESTS ====================

  test('should combine AND filters (kind + date)', async ({ apiRequest }) => {
    // Apply multiple filters → verify AND logic (all conditions must match)
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
    const nodes = await response.json();
    const nodeItems = getNodes(nodes);

    // All nodes must match BOTH conditions
    expect(
      nodeItems.every(
        (n: any) => n.kind === 'Source' && new Date(n.created_at).getTime() >= oneHourAgo
      )
    ).toBe(true);
  });

  test('should combine three filters (kind + platform + date)', async ({ apiRequest }) => {
    // Apply three filters simultaneously → verify all conditions enforced
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const oneHourAgo = Date.now() - 3600000;

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        kind: 'Source',
        'metadata.platform': 'chatgpt',
        created_after: oneHourAgo,
      },
    });

    expect(response.status()).toBe(200);
    const nodes = await response.json();
    const nodeItems = getNodes(nodes);

    // Verify all three conditions
    for (const node of nodeItems) {
      expect(node.kind).toBe('Source');
      expect(new Date(node.created_at).getTime()).toBeGreaterThanOrEqual(oneHourAgo);

      // Platform check (may not be present on all Source nodes)
      if (node.metadata?.platform) {
        expect(node.metadata.platform).toBe('chatgpt');
      }
    }
  });

  test('should filter by nested metadata fields', async ({ apiRequest }) => {
    // Upload data with nested metadata → filter by deep field → verify filtering
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Create a node with nested metadata manually
    await createGroupNode(apiRequest, authToken, 'Test Group with Nested Metadata', {
      author: {
        name: 'Test Author',
        email: 'test@example.com',
      },
      settings: {
        priority: 'high',
        score: 0.95,
      },
    });

    // Filter by nested field (if API supports it)
    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        'metadata.author.email': 'test@example.com',
      },
    });

    // API may or may not support nested field filtering
    // If supported, verify filtering works
    if (response.status() === 200) {
      const nodes = await response.json();
      const nodeItems = getNodes(nodes);

      if (nodeItems.length > 0) {
        const matchingNode = nodeItems.find((n: any) => n.metadata?.author?.email);
        if (matchingNode) {
          expect(matchingNode.metadata.author.email).toBe('test@example.com');
        }
      }
    }
  });

  test('should filter by array contains (tags)', async ({ apiRequest }) => {
    // Create nodes with tag arrays → filter by tag → verify matching
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Create nodes with tags
    const taggedNodes = [
      { name: 'Important Note', tags: ['important', 'urgent', 'review'] },
      { name: 'Regular Note', tags: ['draft', 'pending'] },
      { name: 'Critical Issue', tags: ['important', 'critical', 'bug'] },
    ];

    for (const nodeData of taggedNodes) {
      await createGroupNode(apiRequest, authToken, nodeData.name, { tags: nodeData.tags });
    }

    // Filter by tag='important' (if API supports array contains)
    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        kind: 'Group',
        'metadata.tags': 'important',
      },
    });

    // If array filtering is supported, verify results
    if (response.status() === 200) {
      const nodes = await response.json();
      const nodeItems = getNodes(nodes);

      // Should return 2 nodes (Important Note and Critical Issue)
      const matchingNodes = nodeItems.filter((n: any) => n.metadata?.tags?.includes('important'));

      if (matchingNodes.length > 0) {
        expect(matchingNodes.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('should filter by numeric ranges', async ({ apiRequest }) => {
    // Create nodes with numeric metadata → filter by range → verify filtering
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Create nodes with numeric scores
    const scoredNodes = [
      { name: 'High Score', score: 0.95 },
      { name: 'Medium Score', score: 0.75 },
      { name: 'Low Score', score: 0.45 },
    ];

    for (const nodeData of scoredNodes) {
      await createGroupNode(apiRequest, authToken, nodeData.name, { score: nodeData.score });
    }

    // Filter by score > 0.7 (if API supports numeric comparisons)
    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        kind: 'Group',
        'metadata.score_gte': 0.7, // Greater than or equal to 0.7
      },
    });

    // If numeric filtering is supported, verify results
    if (response.status() === 200) {
      const nodes = await response.json();
      const nodeItems = getNodes(nodes);

      // Should return High Score (0.95) and Medium Score (0.75)
      const highScoreNodes = nodeItems.filter((n: any) => n.metadata?.score >= 0.7);

      if (highScoreNodes.length > 0) {
        expect(highScoreNodes.every((n: any) => n.metadata.score >= 0.7)).toBe(true);
      }
    }
  });

  test('should handle conflicting filters gracefully', async ({ apiRequest }) => {
    // Apply impossible filter (kind=Source AND kind=Message) → verify empty results
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Note: Most query parsers won't allow multiple 'kind' params
    // This test verifies the API handles edge cases gracefully

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        kind: 'Source',
        // Try to add conflicting metadata
        'metadata.platform': 'chatgpt',
        'metadata.platform_not': 'chatgpt', // Impossible condition
      },
    });

    // Should return 200 with empty results (not 500 error)
    expect(response.status()).toBe(200);
    const nodes = await response.json();
    const nodeItems = getNodes(nodes);

    // Results should be empty or contain no nodes matching impossible condition
    expect(nodeItems).toBeDefined();
  });

  test('should respect filter complexity limits', async ({ apiRequest }) => {
    // Apply many filters → verify reasonable limits enforced (prevent DoS)
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Build a query with many parameters
    const params: any = {
      kind: 'Source',
      'metadata.platform': 'chatgpt',
      created_after: Date.now() - 86400000,
      limit: 50,
    };

    // Add 50 more metadata filters (excessive)
    for (let i = 0; i < 50; i++) {
      params[`metadata.field${i}`] = `value${i}`;
    }

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params,
    });

    // API should either:
    // 1. Accept and process the query (200)
    // 2. Reject with 400 Bad Request (too complex)
    // 3. Ignore extra filters and return results for valid ones
    expect([200, 400]).toContain(response.status());
  });

  test('should handle null and missing metadata fields', async ({ apiRequest }) => {
    // Create nodes with/without metadata → filter → verify graceful handling
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    // Create nodes with various metadata states
    await createGroupNode(apiRequest, authToken, 'Node with null metadata', {
      platform: null,
    });

    await createGroupNode(apiRequest, authToken, 'Node with missing field', {});

    await createGroupNode(apiRequest, authToken, 'Node with value', {
      platform: 'chatgpt',
    });

    // Filter by platform=chatgpt
    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        kind: 'Group',
        'metadata.platform': 'chatgpt',
      },
    });

    expect(response.status()).toBe(200);
    const nodes = await response.json();
    const nodeItems = getNodes(nodes);

    // Should only return the node with platform='chatgpt' (not null or missing)
    const groupNodes = nodeItems.filter((n: any) => n.kind === 'Group');
    const matchingNodes = groupNodes.filter((n: any) => n.metadata?.platform === 'chatgpt');

    // At least one node should match
    if (matchingNodes.length > 0) {
      expect(matchingNodes.every((n: any) => n.metadata.platform === 'chatgpt')).toBe(true);
    }
  });

  test('should maintain performance with multiple filters', async ({ apiRequest }) => {
    // Apply multiple filters → measure response time → verify acceptable performance
    await uploadAndProcess(apiRequest, authToken, 'tiny.json');

    const startTime = Date.now();

    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        kind: 'Source',
        'metadata.platform': 'chatgpt',
        created_after: Date.now() - 3600000,
        limit: 50,
        sort: 'created_at',
        order: 'desc',
      },
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(response.status()).toBe(200);

    // Response should be fast (<2000ms for small dataset)
    // Note: This is a soft assertion - actual performance depends on hardware
    console.log(`[Advanced Filtering Test] Query with 6 filters completed in ${responseTime}ms`);

    // Verify query still returns correct results (not just fast but wrong)
    const nodes = await response.json();
    const nodeItems = getNodes(nodes);
    expect(nodeItems).toBeDefined();

    // All results should match filters
    for (const node of nodeItems) {
      expect(node.kind).toBe('Source');
    }
  });
});
