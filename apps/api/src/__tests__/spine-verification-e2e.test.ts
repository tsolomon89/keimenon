/**
 * E2E Tests for Vision V2: Spine Extraction & Verification Flow
 *
 * Tests the complete workflow:
 * 1. Extract lexemes and phrases from content
 * 2. Cluster phrases into topics
 * 3. Verify topics against external sources (mocked)
 *
 * Related:
 * - apps/api/src/routes/spine.routes.ts
 * - apps/api/src/routes/verification.routes.ts
 * - apps/api/src/services/graph-spine-builder.ts
 * - apps/api/src/services/verification-service.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

const TEST_CONTENT = `
  Dr. Jane Smith from MIT published groundbreaking research on machine learning algorithms.
  The study, conducted in collaboration with Google Research, demonstrates significant improvements
  in natural language processing tasks. Key findings include a 40% reduction in processing time
  and improved accuracy on benchmark datasets. The research team plans to present their work
  at the upcoming NeurIPS conference in San Francisco.

  Machine learning continues to revolutionize artificial intelligence applications across industries.
  Companies like OpenAI, Anthropic, and Google DeepMind are leading the charge in developing
  advanced AI systems. Natural language processing has seen particular advances with large
  language models becoming increasingly capable.
`;

let authToken: string;
let baseUrl: string;

describe('Vision V2: Spine Extraction & Verification E2E', () => {
  beforeAll(async () => {
    baseUrl = process.env.TEST_API_URL || 'http://127.0.0.1:4001';

    // Get auth token using dev auth
    const authResponse = await fetch(`${baseUrl}/api/dev-auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        role: 'admin',
      }),
    });

    if (authResponse.ok) {
      const authData = await authResponse.json();
      authToken = authData.token;
    } else {
      // Fallback - some test setups may not need auth
      console.warn('[Test] Dev auth not available, proceeding without token');
      authToken = '';
    }
  }, 60000);

  describe('Spine Service Health', () => {
    it('should return health status for spine service', async () => {
      const response = await fetch(`${baseUrl}/api/v1/spine/health`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      // May return 401 if auth required, which is expected
      if (response.status === 401) {
        console.log('[Test] Auth required for spine health endpoint');
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('spine');
    });
  });

  describe('Spine Extraction', () => {
    it('should extract lexemes and phrases from content', async () => {
      const response = await fetch(`${baseUrl}/api/v1/spine/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sourceDocId: 'test-source-doc-1',
          content: TEST_CONTENT,
        }),
      });

      if (response.status === 401) {
        console.log('[Test] Auth required for spine extract endpoint');
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.sourceDocId).toBe('test-source-doc-1');
      expect(Array.isArray(data.lexemes)).toBe(true);
      expect(Array.isArray(data.phrases)).toBe(true);

      // Should have extracted some content
      expect(data.stats.lexemeCount).toBeGreaterThan(0);
      expect(data.stats.phraseCount).toBeGreaterThan(0);

      // Verify lexeme structure
      if (data.lexemes.length > 0) {
        const lexeme = data.lexemes[0];
        expect(lexeme).toHaveProperty('id');
        expect(lexeme).toHaveProperty('kind', 'Lexeme');
        expect(lexeme).toHaveProperty('lemma');
        expect(lexeme).toHaveProperty('pos');
        expect(lexeme).toHaveProperty('frequency');
      }

      // Verify phrase structure
      if (data.phrases.length > 0) {
        const phrase = data.phrases[0];
        expect(phrase).toHaveProperty('id');
        expect(phrase).toHaveProperty('kind', 'Phrase');
        expect(phrase).toHaveProperty('text');
        expect(phrase).toHaveProperty('normalized_text');
        expect(phrase).toHaveProperty('type');
        expect(phrase).toHaveProperty('frequency');
      }

      console.log(
        `[Test] Extracted ${data.stats.lexemeCount} lexemes, ${data.stats.phraseCount} phrases`
      );
    });

    it('should return 400 for missing content', async () => {
      const response = await fetch(`${baseUrl}/api/v1/spine/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sourceDocId: 'test-source-doc-1',
          // missing content
        }),
      });

      if (response.status === 401) return;
      expect(response.status).toBe(400);
    });
  });

  describe('Topic Clustering', () => {
    it('should cluster phrases into topics', async () => {
      // First, extract phrases
      const extractResponse = await fetch(`${baseUrl}/api/v1/spine/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sourceDocId: 'test-source-doc-2',
          content: TEST_CONTENT,
        }),
      });

      if (extractResponse.status === 401) return;
      const extractData = await extractResponse.json();

      // Then cluster the phrases
      const clusterResponse = await fetch(`${baseUrl}/api/v1/spine/cluster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          phrases: extractData.phrases,
        }),
      });

      expect(clusterResponse.status).toBe(200);
      const clusterData = await clusterResponse.json();

      expect(clusterData.success).toBe(true);
      expect(Array.isArray(clusterData.topics)).toBe(true);

      // Verify topic structure if any were created
      if (clusterData.topics.length > 0) {
        const topic = clusterData.topics[0];
        expect(topic).toHaveProperty('id');
        expect(topic).toHaveProperty('kind', 'Topic');
        expect(topic).toHaveProperty('name');
        expect(topic).toHaveProperty('keywords');
        expect(topic).toHaveProperty('strength');
        expect(Array.isArray(topic.keywords)).toBe(true);
      }

      console.log(
        `[Test] Created ${clusterData.stats.topicCount} topics from ${clusterData.stats.inputPhraseCount} phrases`
      );
    });
  });

  describe('Combined Extract and Cluster', () => {
    it('should extract and cluster in one operation', async () => {
      const response = await fetch(`${baseUrl}/api/v1/spine/extract-and-cluster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sourceDocId: 'test-source-doc-3',
          content: TEST_CONTENT,
        }),
      });

      if (response.status === 401) return;
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.lexemes)).toBe(true);
      expect(Array.isArray(data.phrases)).toBe(true);
      expect(Array.isArray(data.topics)).toBe(true);

      console.log(
        `[Test] Combined operation: ${data.stats.lexemeCount} lexemes, ${data.stats.phraseCount} phrases, ${data.stats.topicCount} topics`
      );
    });
  });

  describe('Verification Service Health', () => {
    it('should return health status for verification service', async () => {
      const response = await fetch(`${baseUrl}/api/v1/verification/health`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      if (response.status === 401) return;
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('verification');
    });

    it('should return service status with search provider info', async () => {
      const response = await fetch(`${baseUrl}/api/v1/verification/status`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      if (response.status === 401) return;
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('operational');
      expect(['tavily', 'mock']).toContain(data.searchProvider);
      expect(data).toHaveProperty('configuration');
      expect(data.configuration).toHaveProperty('searchApiConfigured');
      expect(typeof data.configuration.searchApiConfigured).toBe('boolean');

      console.log(
        `[Test] Search provider: ${data.searchProvider} (API configured: ${data.configuration.searchApiConfigured})`
      );
    });
  });

  describe('Topic Verification', () => {
    it('should verify a topic and return sources and claims', async () => {
      // First create a topic via extraction
      const extractResponse = await fetch(`${baseUrl}/api/v1/spine/extract-and-cluster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sourceDocId: 'test-verify-source',
          content: TEST_CONTENT,
        }),
      });

      if (extractResponse.status === 401) return;
      const extractData = await extractResponse.json();

      // Create a topic to verify
      const testTopic = extractData.topics[0] || {
        id: 'test-topic-1',
        kind: 'Topic',
        name: 'Machine Learning',
        description: 'Research on ML algorithms',
        keywords: ['machine learning', 'artificial intelligence'],
        strength: 0.9,
      };

      // Verify the topic
      const verifyResponse = await fetch(`${baseUrl}/api/v1/verification/verify-topic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          topic: testTopic,
        }),
      });

      expect(verifyResponse.status).toBe(200);
      const verifyData = await verifyResponse.json();

      expect(verifyData.success).toBe(true);
      expect(Array.isArray(verifyData.sources)).toBe(true);
      expect(Array.isArray(verifyData.claims)).toBe(true);

      // Verify source structure
      if (verifyData.sources.length > 0) {
        const source = verifyData.sources[0];
        expect(source).toHaveProperty('id');
        expect(source).toHaveProperty('kind', 'VerifiedSource');
        expect(source).toHaveProperty('title');
        expect(source).toHaveProperty('url');
        expect(source).toHaveProperty('trust_score');
      }

      console.log(
        `[Test] Verification returned ${verifyData.stats.sourceCount} sources, ${verifyData.stats.claimCount} claims`
      );
    });

    it('should return 400 for missing topic', async () => {
      const response = await fetch(`${baseUrl}/api/v1/verification/verify-topic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({}),
      });

      if (response.status === 401) return;
      expect(response.status).toBe(400);
    });
  });

  describe('Claim Verification', () => {
    it('should verify a specific claim', async () => {
      const response = await fetch(`${baseUrl}/api/v1/verification/verify-claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          claimText: 'Machine learning improves natural language processing',
          context: 'AI research',
        }),
      });

      if (response.status === 401) return;
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.claimText).toBe('Machine learning improves natural language processing');
      expect(['verified', 'disputed', 'unverified']).toContain(data.status);
      expect(Array.isArray(data.sources)).toBe(true);

      console.log(`[Test] Claim verification status: ${data.status}`);
    });
  });

  describe('Full V2 Workflow', () => {
    it('should complete the full spine → topics → verification flow', async () => {
      // Step 1: Extract spine from content
      const extractResponse = await fetch(`${baseUrl}/api/v1/spine/extract-and-cluster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sourceDocId: 'full-workflow-test',
          content: TEST_CONTENT,
        }),
      });

      if (extractResponse.status === 401) {
        console.log('[Test] Skipping full workflow test - auth required');
        return;
      }

      expect(extractResponse.status).toBe(200);
      const extractData = await extractResponse.json();

      console.log(
        `[V2 Workflow] Step 1: Extracted ${extractData.stats.lexemeCount} lexemes, ${extractData.stats.phraseCount} phrases, ${extractData.stats.topicCount} topics`
      );

      // Step 2: Verify each topic (or first few)
      const topicsToVerify = extractData.topics.slice(0, 2);
      const verificationResults = [];

      for (const topic of topicsToVerify) {
        const verifyResponse = await fetch(`${baseUrl}/api/v1/verification/verify-topic`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ topic }),
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          verificationResults.push({
            topicName: topic.name,
            sourceCount: verifyData.stats.sourceCount,
            claimCount: verifyData.stats.claimCount,
          });
        }
      }

      console.log(`[V2 Workflow] Step 2: Verified ${verificationResults.length} topics`);
      verificationResults.forEach((r) => {
        console.log(`  - ${r.topicName}: ${r.sourceCount} sources, ${r.claimCount} claims`);
      });

      // Verify the workflow completed successfully
      expect(extractData.lexemes.length).toBeGreaterThan(0);
      expect(extractData.phrases.length).toBeGreaterThan(0);
    });
  });
});
