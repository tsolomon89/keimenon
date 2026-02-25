/**
 * TaskRunner Tests
 *
 * Tests for deterministic execution, retry logic, and cancellation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskRunner, type TaskRunnerDeps } from '../runner/task-runner.js';
import type {
  Task,
  Run,
  Artifact,
  TaskConfig,
  AgentNode,
} from '../types/index.js';
import type {
  GraphRepo,
  Storage,
  EventBus,
  ToolRegistry,
  TaskHandler,
  HandlerRegistry,
  TaskContext,
  TaskResult,
} from '../interfaces/index.js';
import { InMemoryEventBus, InMemoryHandlerRegistry } from '../interfaces/index.js';

// ============================================
// Mock Implementations
// ============================================

class MockGraphRepo implements GraphRepo {
  public tasks = new Map<string, Task>();
  public runs = new Map<string, Run>();
  public artifacts = new Map<string, Artifact>();
  public nodes = new Map<string, any>();

  async listGroups(): Promise<any[]> {
    return [];
  }

  async listSources(): Promise<any[]> {
    return [];
  }

  async getSource(): Promise<any> {
    return null;
  }

  async getSources(): Promise<any[]> {
    return [];
  }

  async getNode(): Promise<any> {
    return null;
  }

  async getNodesByKind(): Promise<any[]> {
    return [];
  }

  async getEdges(): Promise<any[]> {
    return [];
  }

  async createNode<T>(node: T): Promise<T> {
    this.nodes.set((node as any).id, node);
    return node;
  }

  async createNodes<T>(nodes: T[]): Promise<T[]> {
    nodes.forEach((n) => this.nodes.set((n as any).id, n));
    return nodes;
  }

  async createEdge(edge: any): Promise<any> {
    return { ...edge, id: `edge_${Date.now()}`, created_at: Date.now() };
  }

  async createEdges(edges: any[]): Promise<any[]> {
    return edges.map((e) => ({ ...e, id: `edge_${Date.now()}`, created_at: Date.now() }));
  }

  async setNodeStatus(): Promise<void> {}

  async saveTask(task: Task): Promise<Task> {
    this.tasks.set(task.id, task);
    return task;
  }

  async updateTaskStatus(taskId: string, status: Task['status'], error?: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (error) task.error = error;
    }
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async saveRun(run: Run): Promise<Run> {
    this.runs.set(run.id, run);
    return run;
  }

  async updateRun(runId: string, updates: Partial<Run>): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      Object.assign(run, updates);
    }
  }

  async getRuns(taskId: string): Promise<Run[]> {
    return Array.from(this.runs.values()).filter((r) => r.task_id === taskId);
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  async getArtifacts(runId: string): Promise<Artifact[]> {
    return Array.from(this.artifacts.values()).filter((a) => a.run_id === runId);
  }

  async getOrCreateAgent(accountId: string): Promise<AgentNode> {
    const id = `agent_${accountId}`;
    return {
      id,
      kind: 'AgentNode',
      account_id: accountId,
      name: 'Test Agent',
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: { capabilities: ['summarize'] },
    };
  }

  async updateAgent(): Promise<void> {}
}

class MockStorage implements Storage {
  private content = new Map<string, string | Buffer>();

  async put(content: string | Buffer): Promise<any> {
    const hash = this.calculateHash(content);
    const isNew = !this.content.has(hash);
    this.content.set(hash, content);
    return {
      hash,
      path: `/cas/${hash}`,
      isNew,
      size: typeof content === 'string' ? content.length : content.length,
    };
  }

  async putJson(data: unknown, filename?: string): Promise<any> {
    return this.put(JSON.stringify(data));
  }

  async get(hash: string): Promise<string | Buffer | null> {
    return this.content.get(hash) || null;
  }

  async getJson<T>(hash: string): Promise<T | null> {
    const content = await this.get(hash);
    if (!content) return null;
    return JSON.parse(content.toString()) as T;
  }

  async exists(hash: string): Promise<boolean> {
    return this.content.has(hash);
  }

  async getMetadata(): Promise<any> {
    return null;
  }

  async delete(hash: string): Promise<boolean> {
    return this.content.delete(hash);
  }

  async getPath(hash: string): Promise<string | null> {
    return this.content.has(hash) ? `/cas/${hash}` : null;
  }

  calculateHash(content: string | Buffer): string {
    // Simple hash for testing
    const str = typeof content === 'string' ? content : content.toString();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }

  async list(): Promise<string[]> {
    return Array.from(this.content.keys());
  }

  async getUsage(): Promise<number> {
    let size = 0;
    for (const content of this.content.values()) {
      size += typeof content === 'string' ? content.length : content.length;
    }
    return size;
  }
}

class MockToolRegistry implements ToolRegistry {
  getLLMAdapter() {
    return null;
  }
  getWebAdapter() {
    return null;
  }
  getExecAdapter() {
    return null;
  }
  getProofAdapter() {
    return null;
  }
  getGitAdapter() {
    return null;
  }
  getStatus() {
    return [];
  }
  isAvailable() {
    return false;
  }
  async refresh() {}
}

// ============================================
// Test Handler
// ============================================

class DeterministicHandler implements TaskHandler<{ value: number }, { result: number }> {
  readonly type = 'GROUP_SUMMARY_BUILD' as const;
  readonly name = 'Deterministic Test Handler';
  public runCount = 0;

  validate(input: { value: number }) {
    if (typeof input.value !== 'number') {
      return { valid: false, errors: ['value must be a number'] };
    }
    return { valid: true };
  }

  async run(
    input: { value: number },
    ctx: TaskContext<{ value: number }>
  ): Promise<TaskResult<{ result: number }>> {
    this.runCount++;

    // Deterministic computation
    const result = input.value * 2;

    // Store artifact
    const artifact = await ctx.storage.put(JSON.stringify({ result }));

    return {
      success: true,
      output: { result },
      artifacts: [artifact.hash],
    };
  }
}

class FailingHandler implements TaskHandler<{ shouldFail: boolean }, void> {
  readonly type = 'DUPLICATE_SUGGEST' as const;
  readonly name = 'Failing Test Handler';
  public runCount = 0;

  validate() {
    return { valid: true };
  }

  async run(
    input: { shouldFail: boolean },
    _ctx: TaskContext<{ shouldFail: boolean }>
  ): Promise<TaskResult<void>> {
    this.runCount++;

    if (input.shouldFail) {
      throw new Error('Intentional failure');
    }

    return { success: true, artifacts: [] };
  }
}

// ============================================
// Tests
// ============================================

describe('TaskRunner', () => {
  let graph: MockGraphRepo;
  let storage: MockStorage;
  let events: InMemoryEventBus;
  let tools: MockToolRegistry;
  let handlers: InMemoryHandlerRegistry;
  let runner: TaskRunner;
  let deps: TaskRunnerDeps;

  beforeEach(() => {
    graph = new MockGraphRepo();
    storage = new MockStorage();
    events = new InMemoryEventBus();
    tools = new MockToolRegistry();
    handlers = new InMemoryHandlerRegistry();

    deps = { graph, storage, events, tools, handlers };
    runner = new TaskRunner(deps);
  });

  afterEach(() => {
    events.unsubscribeAll();
  });

  describe('Task Submission', () => {
    it('should create a task with unique ID', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      const task = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 5 },
        config: { version: '1.0.0' },
      });

      expect(task.id).toBeDefined();
      expect(task.id.length).toBeGreaterThan(0);
      expect(['pending', 'running']).toContain(task.status);
      expect(task.created_at).toBeGreaterThan(0);
    });

    it('should persist task to graph', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      const task = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 5 },
        config: { version: '1.0.0' },
      });

      const saved = await graph.getTask(task.id);
      expect(saved).toBeDefined();
      expect(saved?.id).toBe(task.id);
    });
  });

  describe('Deterministic Execution', () => {
    it('should produce same output for same input', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      const input = { value: 42 };

      // Run twice with same input
      const task1 = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input,
        config: { version: '1.0.0' },
      });

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      const task2 = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input,
        config: { version: '1.0.0' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Both should have run
      expect(handler.runCount).toBe(2);

      // Get artifacts from both runs
      const runs1 = await graph.getRuns(task1.id);
      const runs2 = await graph.getRuns(task2.id);

      expect(runs1.length).toBe(1);
      expect(runs2.length).toBe(1);
    });

    it('should store artifacts in content-addressable storage', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 10 },
        config: { version: '1.0.0' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have stored the artifact
      const hashes = await storage.list();
      expect(hashes.length).toBeGreaterThan(0);

      // Retrieve the content
      const content = await storage.getJson<{ result: number }>(hashes[0]);
      expect(content?.result).toBe(20); // 10 * 2
    });
  });

  describe('Event Emission', () => {
    it('should emit task:started event', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      const startedEvents: any[] = [];
      events.subscribe((e) => {
        if (e.type === 'task:started') startedEvents.push(e);
      });

      const task = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 5 },
        config: { version: '1.0.0' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(startedEvents.length).toBe(1);
      expect(startedEvents[0].taskId).toBe(task.id);
    });

    it('should emit task:completed event on success', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      const completedEvents: any[] = [];
      events.subscribe((e) => {
        if (e.type === 'task:completed') completedEvents.push(e);
      });

      const task = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 5 },
        config: { version: '1.0.0' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].taskId).toBe(task.id);
      expect(completedEvents[0].artifacts.length).toBeGreaterThan(0);
    });

    it('should emit task:failed event on failure', async () => {
      const handler = new FailingHandler();
      handlers.register(handler);

      const failedEvents: any[] = [];
      events.subscribe((e) => {
        if (e.type === 'task:failed') failedEvents.push(e);
      });

      const task = await runner.submit({
        type: 'DUPLICATE_SUGGEST',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { shouldFail: true },
        config: {
          version: '1.0.0',
          retry_policy: { max_attempts: 1, backoff_ms: 10 },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].taskId).toBe(task.id);
      expect(failedEvents[0].error).toContain('Intentional failure');
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed tasks up to max_attempts', async () => {
      const handler = new FailingHandler();
      handlers.register(handler);

      await runner.submit({
        type: 'DUPLICATE_SUGGEST',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { shouldFail: true },
        config: {
          version: '1.0.0',
          retry_policy: { max_attempts: 3, backoff_ms: 10 },
        },
      });

      // Wait for all retries
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(handler.runCount).toBe(3);
    });

    it('should not retry on success', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 5 },
        config: {
          version: '1.0.0',
          retry_policy: { max_attempts: 3, backoff_ms: 10 },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handler.runCount).toBe(1);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid input before execution', async () => {
      const handler = new DeterministicHandler();
      handlers.register(handler);

      const failedEvents: any[] = [];
      events.subscribe((e) => {
        if (e.type === 'task:failed') failedEvents.push(e);
      });

      await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 'not a number' } as any,
        config: { version: '1.0.0' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handler.runCount).toBe(0);
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].error).toContain('Invalid task input');
    });
  });

  describe('Missing Handler', () => {
    it('should fail immediately if no handler registered', async () => {
      // Don't register any handler

      const failedEvents: any[] = [];
      events.subscribe((e) => {
        if (e.type === 'task:failed') failedEvents.push(e);
      });

      await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: { value: 5 },
        config: { version: '1.0.0' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].error).toContain('No handler registered');
    });
  });

  describe('Cancellation', () => {
    it('should cancel running task', async () => {
      // Create a slow handler
      const slowHandler: TaskHandler<any, void> = {
        type: 'GROUP_SUMMARY_BUILD',
        name: 'Slow Handler',
        validate: () => ({ valid: true }),
        run: async (_, ctx) => {
          // Wait for abort
          await new Promise((resolve, reject) => {
            ctx.signal.addEventListener('abort', () => reject(new Error('Cancelled')));
            setTimeout(resolve, 5000);
          });
          return { success: true, artifacts: [] };
        },
      };
      handlers.register(slowHandler);

      const cancelledEvents: any[] = [];
      events.subscribe((e) => {
        if (e.type === 'task:cancelled') cancelledEvents.push(e);
      });

      const task = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: {},
        config: { version: '1.0.0' },
      });

      // Wait for task to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Cancel
      const cancelled = await runner.cancel(task.id, 'User requested');

      expect(cancelled).toBe(true);
      expect(cancelledEvents.length).toBe(1);
      expect(cancelledEvents[0].reason).toBe('User requested');
    });

    it('should return false when cancelling non-existent task', async () => {
      const cancelled = await runner.cancel('non-existent-task');
      expect(cancelled).toBe(false);
    });
  });

  describe('Active Task Tracking', () => {
    it('should track active tasks', async () => {
      const slowHandler: TaskHandler<any, void> = {
        type: 'GROUP_SUMMARY_BUILD',
        name: 'Slow Handler',
        validate: () => ({ valid: true }),
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { success: true, artifacts: [] };
        },
      };
      handlers.register(slowHandler);

      const task = await runner.submit({
        type: 'GROUP_SUMMARY_BUILD',
        account_id: 'acc_123',
        agent_id: 'agent_123',
        input: {},
        config: { version: '1.0.0' },
      });

      // Wait for task to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(runner.isRunning(task.id)).toBe(true);
      expect(runner.getActiveCount()).toBe(1);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(runner.isRunning(task.id)).toBe(false);
      expect(runner.getActiveCount()).toBe(0);
    });
  });
});

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  afterEach(() => {
    bus.unsubscribeAll();
  });

  it('should deliver events to subscribers', () => {
    const received: any[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({
      type: 'task:started',
      taskId: 'task_1',
      taskType: 'GROUP_SUMMARY_BUILD',
      timestamp: Date.now(),
    });

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('task:started');
  });

  it('should filter by event type', () => {
    const received: any[] = [];
    bus.subscribe((e) => received.push(e), { types: ['task:completed'] });

    bus.emit({
      type: 'task:started',
      taskId: 'task_1',
      taskType: 'GROUP_SUMMARY_BUILD',
      timestamp: Date.now(),
    });

    bus.emit({
      type: 'task:completed',
      taskId: 'task_1',
      artifacts: [],
      timestamp: Date.now(),
    });

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('task:completed');
  });

  it('should filter by task ID', () => {
    const received: any[] = [];
    bus.subscribeToTask('task_1', (e) => received.push(e));

    bus.emit({
      type: 'task:started',
      taskId: 'task_1',
      taskType: 'GROUP_SUMMARY_BUILD',
      timestamp: Date.now(),
    });

    bus.emit({
      type: 'task:started',
      taskId: 'task_2',
      taskType: 'GROUP_SUMMARY_BUILD',
      timestamp: Date.now(),
    });

    expect(received.length).toBe(1);
    expect(received[0].taskId).toBe('task_1');
  });

  it('should unsubscribe correctly', () => {
    const received: any[] = [];
    const sub = bus.subscribe((e) => received.push(e));

    bus.emit({
      type: 'task:started',
      taskId: 'task_1',
      taskType: 'GROUP_SUMMARY_BUILD',
      timestamp: Date.now(),
    });

    sub.unsubscribe();

    bus.emit({
      type: 'task:started',
      taskId: 'task_2',
      taskType: 'GROUP_SUMMARY_BUILD',
      timestamp: Date.now(),
    });

    expect(received.length).toBe(1);
  });
});

describe('InMemoryHandlerRegistry', () => {
  it('should register and retrieve handlers', () => {
    const registry = new InMemoryHandlerRegistry();
    const handler = new DeterministicHandler();

    registry.register(handler);

    expect(registry.has('GROUP_SUMMARY_BUILD')).toBe(true);
    expect(registry.get('GROUP_SUMMARY_BUILD')).toBe(handler);
  });

  it('should list registered handlers', () => {
    const registry = new InMemoryHandlerRegistry();
    registry.register(new DeterministicHandler());
    registry.register(new FailingHandler());

    const types = registry.list();
    expect(types).toContain('GROUP_SUMMARY_BUILD');
    expect(types).toContain('DUPLICATE_SUGGEST');
  });
});
