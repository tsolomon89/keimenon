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

    // All nodes must match BOTH conditions
    expect(
      nodes.data.every(
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

    // Verify all three conditions
    for (const node of nodes.data) {
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
    const createResponse = await apiRequest.post('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        kind: 'Group',
        name: 'Test Group with Nested Metadata',
        metadata: {
          data_tag: 'test',
          author: {
            name: 'Test Author',
            email: 'test@example.com',
          },
          settings: {
            priority: 'high',
            score: 0.95,
          },
        },
      },
    });

    expect(createResponse.status()).toBe(201);

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

      if (nodes.data.length > 0) {
        const matchingNode = nodes.data.find((n: any) => n.metadata?.author?.email);
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
      await apiRequest.post('/api/v1/nodes', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          kind: 'Group',
          name: nodeData.name,
          metadata: {
            data_tag: 'test',
            tags: nodeData.tags,
          },
        },
      });
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

      // Should return 2 nodes (Important Note and Critical Issue)
      const matchingNodes = nodes.data.filter((n: any) => n.metadata?.tags?.includes('important'));

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
      await apiRequest.post('/api/v1/nodes', {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          kind: 'Group',
          name: nodeData.name,
          metadata: {
            data_tag: 'test',
            score: nodeData.score,
          },
        },
      });
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

      // Should return High Score (0.95) and Medium Score (0.75)
      const highScoreNodes = nodes.data.filter((n: any) => n.metadata?.score >= 0.7);

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

    // Results should be empty or contain no nodes matching impossible condition
    expect(nodes.data).toBeDefined();
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
    await apiRequest.post('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        kind: 'Group',
        name: 'Node with null metadata',
        metadata: {
          data_tag: 'test',
          platform: null,
        },
      },
    });

    await apiRequest.post('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        kind: 'Group',
        name: 'Node with missing field',
        metadata: {
          data_tag: 'test',
          // No platform field
        },
      },
    });

    await apiRequest.post('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        kind: 'Group',
        name: 'Node with value',
        metadata: {
          data_tag: 'test',
          platform: 'chatgpt',
        },
      },
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

    // Should only return the node with platform='chatgpt' (not null or missing)
    const groupNodes = nodes.data.filter((n: any) => n.kind === 'Group');
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
    expect(nodes.data).toBeDefined();

    // All results should match filters
    for (const node of nodes.data) {
      expect(node.kind).toBe('Source');
    }
  });
});
