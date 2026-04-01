import { describe, expect, it, vi } from 'vitest';
import { VerifySourceChainHandler } from '../verify-source-chain';

function createHarness(options?: { llmAvailable?: boolean; webAvailable?: boolean }) {
  const objectiveNodes = new Map<string, Record<string, unknown>>();
  const createdNodes: Array<Record<string, unknown>> = [];
  const createdEdges: Array<Record<string, unknown>> = [];
  const emittedEvents: Array<Record<string, unknown>> = [];

  const now = Date.now();
  const objective = {
    id: 'objective_batch_1',
    kind: 'ObjectiveClaim',
    account_id: 'acc_test',
    claim_text: 'Provisional objective for batch',
    type: 'definition',
    archetype: 'definition_anchor',
    status: 'provisional',
    confidence: 0.4,
    citations: [],
    supports: [],
    contradicts: [],
    created_at: now,
    updated_at: now,
    metadata: {
      import_id: 'batch_1',
    },
  };
  objectiveNodes.set(objective.id, objective);

  const graph = {
    getSource: vi.fn(async (sourceId: string) => {
      if (sourceId === 'source_batch_1') {
        return {
          node: { id: sourceId, kind: 'Source' },
          content: 'API endpoint returns 200 with deterministic output.',
        };
      }
      return null;
    }),
    listSources: vi.fn(async () => []),
    getSourcesByImportBatch: vi.fn(async (importBatchId: string) => {
      if (importBatchId !== 'batch_1') {
        return [];
      }
      return [{ id: 'source_batch_1', metadata: { import_id: importBatchId } }];
    }),
    getNodesByKind: vi.fn(async (kind: string) => {
      if (kind !== 'ObjectiveClaim') {
        return [];
      }
      return Array.from(objectiveNodes.values());
    }),
    createNode: vi.fn(async (node: Record<string, unknown>) => {
      createdNodes.push(node);
      if (node.kind === 'ObjectiveClaim' && typeof node.id === 'string') {
        objectiveNodes.set(node.id, node);
      }
      return node;
    }),
    createEdge: vi.fn(async (edge: Record<string, unknown>) => {
      createdEdges.push(edge);
      return edge;
    }),
  };

  const llmAvailable = options?.llmAvailable !== false;
  const webAvailable = options?.webAvailable !== false;

  const llm = llmAvailable
    ? {
        isAvailable: () => true,
        getProvider: () => 'test-llm',
        extractTopics: async () => [],
        summarize: async () => '',
        classifyDupes: async () => [],
        chat: async () => '',
        extractClaims: async () => [{ claim: 'API endpoint returns 200', confidence: 0.95 }],
      }
    : null;

  const web = webAvailable
    ? {
        isAvailable: () => true,
        getProvider: () => 'test-web',
        search: async () => [
          {
            title: 'API Status',
            url: 'https://example.com/api-status',
            snippet: 'Status checks show API returns HTTP 200.',
            source: 'test',
          },
        ],
        fetch: async () => ({ html: '<html></html>', status: 200 }),
        extractMainText: async () => 'Status checks show API returns HTTP 200.',
      }
    : null;

  const tools = {
    getLLMAdapter: () => llm,
    getWebAdapter: () => web,
    getExecAdapter: () => null,
    getProofAdapter: () => null,
    getGitAdapter: () => null,
    getStatus: () => [],
    isAvailable: () => false,
    registerLLMAdapter: () => {},
    registerWebAdapter: () => {},
    registerExecAdapter: () => {},
    registerProofAdapter: () => {},
    registerGitAdapter: () => {},
  };

  const storage = {
    put: vi.fn(async (content: string) => ({
      hash: `hash_${String(content).length}`,
      path: 'artifacts/evidence.json',
      isNew: true,
      size: String(content).length,
    })),
    putJson: vi.fn(),
    get: vi.fn(),
    getJson: vi.fn(),
    exists: vi.fn(),
    getMetadata: vi.fn(),
    delete: vi.fn(),
    getPath: vi.fn(),
    calculateHash: vi.fn(),
    list: vi.fn(),
    getUsage: vi.fn(),
  };

  const handler = new VerifySourceChainHandler();
  const controller = new AbortController();
  const context = {
    task: {
      id: 'task_verify_1',
      type: 'VERIFY_SOURCE_CHAIN',
      account_id: 'acc_test',
      agent_id: 'agent_test',
      status: 'running',
      input: {},
      config: { version: '1.0.0' },
      created_at: now,
    },
    run: {
      id: 'run_verify_1',
      task_id: 'task_verify_1',
      attempt: 1,
      status: 'running',
      started_at: now,
      metrics: { duration_ms: 0 },
    },
    graph,
    storage,
    tools,
    events: {
      emit: (event: Record<string, unknown>) => emittedEvents.push(event),
      subscribe: vi.fn(),
      subscribeToTask: vi.fn(),
      unsubscribe: vi.fn(),
      unsubscribeAll: vi.fn(),
      getSubscriptionCount: vi.fn(),
      waitFor: vi.fn(),
    },
    signal: controller.signal,
  };

  return {
    handler,
    graph,
    objectiveNodes,
    createdNodes,
    createdEdges,
    emittedEvents,
    context,
  };
}

describe('VerifySourceChainHandler objective lifecycle', () => {
  it('transitions batch objective claims verifying -> verified when evidence is strong', async () => {
    const harness = createHarness();

    const result = await harness.handler.run(
      {
        targetId: 'batch_1',
        policy: {
          domain_weights: { 'example.com': 0.95 },
          max_hops: 2,
          max_sources: 5,
        },
      },
      harness.context as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.objectiveNodes).toContain('objective_batch_1');

    const updated = harness.objectiveNodes.get('objective_batch_1') as Record<string, any>;
    expect(updated).toBeDefined();
    expect(updated.status).toBe('verified');
    expect(updated.archetype).toBe('definition_anchor');
    expect(updated.metadata.objective_lifecycle.state).toBe('verified');
    expect(updated.metadata.objective_lifecycle.previous).toBe('verifying');
    expect(updated.metadata.objective_lifecycle.reason).toBe('evidence_verified');
    expect(updated.metadata.objective_lifecycle.archetype).toBe('definition_anchor');
    expect(updated.metadata.verification.reason_code).toBe('evidence_verified');
    expect(updated.metadata.verification.archetype).toBe('definition_anchor');

    const generatedClaims = harness.createdNodes.filter(
      (node) => node.kind === 'ObjectiveClaim' && node.id !== 'objective_batch_1'
    ) as Array<Record<string, any>>;
    expect(generatedClaims.length).toBeGreaterThan(0);
    expect(generatedClaims.every((node) => typeof node.archetype === 'string')).toBe(true);
  });

  it('fails fast when llm adapter is unavailable and marks tracked objectives contested', async () => {
    const harness = createHarness({ llmAvailable: false });

    const result = await harness.handler.run(
      {
        targetId: 'batch_1',
        policy: {
          domain_weights: {},
          max_hops: 2,
          max_sources: 5,
        },
      },
      harness.context as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM adapter unavailable');
    expect(result.output).toBeUndefined();
    expect(result.artifacts).toEqual([]);

    const updated = harness.objectiveNodes.get('objective_batch_1') as Record<string, any>;
    expect(updated.status).toBe('contested');
    expect(updated.metadata.objective_lifecycle.reason).toBe('llm_adapter_unavailable');
    expect(updated.metadata.verification.reason_code).toBe('llm_adapter_unavailable');
  });
});
