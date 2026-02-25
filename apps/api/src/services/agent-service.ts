/**
 * Agent Service
 *
 * Orchestrates agent task execution by connecting:
 * - Task handlers (GROUP_SUMMARY_BUILD, DUPLICATE_SUGGEST, VERIFY_SOURCE_CHAIN)
 * - Tool adapters (LLM, Web, Exec)
 * - Graph repository
 * - Event bus for progress updates
 *
 * This service is a singleton that manages the agent lifecycle.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  getTaskHandler,
  hasTaskHandler,
  getTaskHandlerTypes,
} from '@keimenon/task-handlers';

/**
 * Minimal types for the service (avoiding full agent-core dependency)
 */
interface Task {
  id: string;
  type: string;
  account_id: string;
  agent_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  config: TaskConfig;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error?: string;
}

interface TaskConfig {
  version: string;
  model_policy?: string;
  max_tokens?: number;
  retry_policy?: { max_attempts: number; backoff_ms: number };
  timeout_ms?: number;
}

interface Run {
  id: string;
  task_id: string;
  attempt: number;
  status: 'running' | 'completed' | 'failed';
  started_at: number;
  completed_at?: number;
  error?: string;
  metrics: { duration_ms: number; [key: string]: number | undefined };
}

interface TaskResult {
  success: boolean;
  output?: unknown;
  error?: string;
  artifacts: string[];
  metrics?: { duration_ms: number; [key: string]: number | undefined };
}

/**
 * Agent task creation request
 */
export interface CreateTaskRequest {
  type: string;
  accountId: string;
  input: Record<string, unknown>;
  config?: Partial<TaskConfig>;
}

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  task: Task;
  run: Run;
  result: TaskResult;
}

/**
 * Simple in-memory storage for artifacts
 */
class SimpleStorage {
  private store = new Map<string, string | Buffer>();

  async put(content: string | Buffer): Promise<{ hash: string; path: string }> {
    const hash = this.simpleHash(content.toString());
    const path = `artifacts/${hash}`;
    this.store.set(hash, content);
    return { hash, path };
  }

  async get(hash: string): Promise<string | Buffer | null> {
    return this.store.get(hash) ?? null;
  }

  async exists(hash: string): Promise<boolean> {
    return this.store.has(hash);
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

/**
 * Simple event bus for broadcasting agent events
 */
class SimpleEventBus {
  private handlers: Array<(event: any) => void> = [];

  emit(event: any): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('[EventBus] Handler error:', e);
      }
    }
  }

  subscribe(handler: (event: any) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
    };
  }
}

/**
 * Agent Service singleton
 */
export class AgentService {
  private static instance: AgentService | null = null;

  private storage = new SimpleStorage();
  private eventBus = new SimpleEventBus();
  private toolRegistry: any = null;
  private graphRepo: any = null;

  private runningTasks = new Map<string, AbortController>();
  private taskHistory: Task[] = [];

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  /**
   * Configure the service with dependencies
   */
  configure(options: {
    toolRegistry?: any;
    graphRepo?: any;
  }): void {
    if (options.toolRegistry) {
      this.toolRegistry = options.toolRegistry;
    }
    if (options.graphRepo) {
      this.graphRepo = options.graphRepo;
    }
  }

  /**
   * Subscribe to agent events
   */
  subscribe(handler: (event: any) => void): () => void {
    return this.eventBus.subscribe(handler);
  }

  /**
   * Get available task handler types
   */
  getAvailableTaskTypes(): string[] {
    return getTaskHandlerTypes();
  }

  /**
   * Check if a task type is available
   */
  isTaskTypeAvailable(type: string): boolean {
    return hasTaskHandler(type);
  }

  /**
   * Create and execute a task
   */
  async executeTask(request: CreateTaskRequest): Promise<TaskExecutionResult> {
    // Validate task type
    const handler = getTaskHandler(request.type);
    if (!handler) {
      throw new Error(`Unknown task type: ${request.type}`);
    }

    // Validate input
    const validation = handler.validate(request.input);
    if (!validation.valid) {
      throw new Error(`Invalid input: ${validation.errors?.join(', ')}`);
    }

    // Check tool availability
    if (handler.canExecute && this.toolRegistry) {
      const canExec = handler.canExecute(this.toolRegistry);
      if (!canExec.can) {
        throw new Error(`Cannot execute: ${canExec.reason}`);
      }
    }

    // Create task
    const now = Date.now();
    const taskId = uuidv4();
    const agentId = `agent-${request.accountId}`;

    const task: Task = {
      id: taskId,
      type: request.type,
      account_id: request.accountId,
      agent_id: agentId,
      status: 'pending',
      input: request.input,
      config: {
        version: '1.0.0',
        model_policy: request.config?.model_policy,
        max_tokens: request.config?.max_tokens,
        retry_policy: request.config?.retry_policy,
        timeout_ms: request.config?.timeout_ms ?? 300000,
      },
      created_at: now,
    };

    // Create run
    const run: Run = {
      id: uuidv4(),
      task_id: taskId,
      attempt: 1,
      status: 'running',
      started_at: now,
      metrics: { duration_ms: 0 },
    };

    // Setup abort controller
    const abortController = new AbortController();
    this.runningTasks.set(taskId, abortController);

    // Emit task started event
    this.eventBus.emit({
      type: 'task:started',
      taskId,
      taskType: request.type,
      timestamp: now,
    });

    // Update task status
    task.status = 'running';
    task.started_at = now;

    try {
      // Create context for handler
      const context = {
        task,
        run,
        graph: this.graphRepo || this.createMockGraphRepo(),
        storage: this.storage,
        tools: this.toolRegistry || this.createMockToolRegistry(),
        events: this.eventBus,
        signal: abortController.signal,
      };

      // Execute handler (cast context to any to avoid strict type checking)
      const result = await handler.run(request.input, context as any);

      // Update run and task
      const completedAt = Date.now();
      run.status = result.success ? 'completed' : 'failed';
      run.completed_at = completedAt;
      run.metrics = result.metrics || { duration_ms: completedAt - now };
      if (!result.success && result.error) {
        run.error = result.error;
      }

      task.status = result.success ? 'completed' : 'failed';
      task.completed_at = completedAt;
      if (!result.success && result.error) {
        task.error = result.error;
      }

      // Emit completion event
      this.eventBus.emit({
        type: result.success ? 'task:completed' : 'task:failed',
        taskId,
        artifacts: result.artifacts,
        error: result.error,
        timestamp: completedAt,
      });

      // Store in history
      this.taskHistory.push(task);

      return { task, run, result };
    } catch (error) {
      // Handle execution error
      const completedAt = Date.now();
      run.status = 'failed';
      run.completed_at = completedAt;
      run.error = (error as Error).message;
      run.metrics = { duration_ms: completedAt - now };

      task.status = 'failed';
      task.completed_at = completedAt;
      task.error = (error as Error).message;

      this.eventBus.emit({
        type: 'task:failed',
        taskId,
        error: (error as Error).message,
        timestamp: completedAt,
      });

      this.taskHistory.push(task);

      return {
        task,
        run,
        result: {
          success: false,
          error: (error as Error).message,
          artifacts: [],
        },
      };
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): boolean {
    const controller = this.runningTasks.get(taskId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Get task history
   */
  getTaskHistory(accountId?: string): Task[] {
    if (accountId) {
      return this.taskHistory.filter(t => t.account_id === accountId);
    }
    return [...this.taskHistory];
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  /**
   * Create mock graph repo for testing/development
   */
  private createMockGraphRepo(): any {
    return {
      listGroups: async () => [],
      listSources: async () => [],
      getSource: async () => null,
      getSources: async () => [],
      getNode: async () => null,
      getNodesByKind: async () => [],
      getEdges: async () => [],
      createNode: async (node: any) => node,
      createNodes: async (nodes: any[]) => nodes,
      createEdge: async (edge: any) => ({ ...edge, id: uuidv4(), created_at: Date.now() }),
      createEdges: async (edges: any[]) => edges.map(e => ({ ...e, id: uuidv4(), created_at: Date.now() })),
      setNodeStatus: async () => {},
      saveTask: async (task: any) => task,
      updateTaskStatus: async () => {},
      getTask: async () => null,
      listTasks: async () => [],
      saveRun: async (run: any) => run,
      updateRun: async () => {},
      getRuns: async () => [],
      saveArtifact: async (artifact: any) => artifact,
      getArtifacts: async () => [],
      getOrCreateAgent: async (accountId: string) => ({
        id: `agent-${accountId}`,
        kind: 'AgentNode',
        account_id: accountId,
        name: 'Keimenon Agent',
        is_active: true,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: { capabilities: ['summarize', 'dedupe'] },
      }),
      updateAgent: async () => {},
    };
  }

  /**
   * Create mock tool registry for testing/development
   */
  private createMockToolRegistry(): any {
    return {
      getLLMAdapter: () => null,
      getWebAdapter: () => null,
      getExecAdapter: () => null,
      getProofAdapter: () => null,
      getGitAdapter: () => null,
      getStatus: () => [],
      isAvailable: () => false,
      refresh: async () => {},
    };
  }
}

/**
 * Get singleton instance (convenience export)
 */
export function getAgentService(): AgentService {
  return AgentService.getInstance();
}
