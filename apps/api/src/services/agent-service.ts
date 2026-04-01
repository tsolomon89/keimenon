/**
 * Agent Service
 *
 * Persistent runtime wrapper around @keimenon/agent-core TaskRunner.
 * Uses SQLite-backed graph/task/run/artifact storage.
 */

import type Database from 'better-sqlite3';
import {
  InMemoryEventBus,
  InMemoryHandlerRegistry,
  NullLLMAdapter,
  NullWebAdapter,
  TaskRunner,
  type AgentEvent,
  type Artifact,
  type EventBus,
  type ExecAdapter,
  type GitAdapter,
  type GraphRepo,
  type ProofAdapter,
  type Run,
  type Task,
  type TaskConfig,
  type TaskType,
  type ToolRegistry,
  type ToolStatus,
  type WebAdapter,
  type LLMAdapter,
} from '@keimenon/agent-core';
import { LocalArtifactStorage } from './agent/LocalArtifactStorage';
import { SQLiteAgentGraphRepo } from './agent/SQLiteAgentGraphRepo';

type TaskHandlersModule = {
  getTaskHandler: (type: string) => any;
  getTaskHandlerTypes: () => string[];
};

type ToolAdaptersModule = {
  createProductionRegistry?: () => ToolRegistry;
};

class UnavailableToolRegistry implements ToolRegistry {
  constructor(private readonly reason: string = 'Tool adapters unavailable') {}

  private readonly llmAdapter = new NullLLMAdapter();
  private readonly webAdapter = new NullWebAdapter();

  getLLMAdapter(): LLMAdapter | null {
    return this.llmAdapter;
  }

  getWebAdapter(): WebAdapter | null {
    return this.webAdapter;
  }

  getExecAdapter(): ExecAdapter | null {
    return null;
  }

  getProofAdapter(): ProofAdapter | null {
    return null;
  }

  getGitAdapter(): GitAdapter | null {
    return null;
  }

  getStatus(): ToolStatus[] {
    return [
      { name: 'llm', available: false, provider: 'none', error: this.reason },
      { name: 'web', available: false, provider: 'none', error: this.reason },
      { name: 'exec', available: false, error: this.reason },
      { name: 'proof', available: false, error: this.reason },
      { name: 'git', available: false, error: this.reason },
    ];
  }

  isAvailable(tool: 'llm' | 'web' | 'exec' | 'proof' | 'git'): boolean {
    return tool === 'llm' || tool === 'web' ? false : false;
  }

  async refresh(): Promise<void> {
    // No-op
  }
}

let taskHandlersModulePromise: Promise<TaskHandlersModule> | null = null;

async function loadTaskHandlersModule(): Promise<TaskHandlersModule> {
  if (!taskHandlersModulePromise) {
    taskHandlersModulePromise = import('@keimenon/task-handlers')
      .then((module: any) => ({
        getTaskHandler: module.getTaskHandler,
        getTaskHandlerTypes: module.getTaskHandlerTypes,
      }))
      .catch((error) => {
        throw new Error(
          `[AgentService] Failed to load @keimenon/task-handlers: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }

  return taskHandlersModulePromise;
}

async function loadProductionToolRegistry(): Promise<ToolRegistry | null> {
  try {
    // Keep ESM loading compatible with CommonJS API runtime.
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (
      specifier: string
    ) => Promise<ToolAdaptersModule>;

    const toolAdapters = await dynamicImport('@keimenon/tool-adapters');
    if (typeof toolAdapters.createProductionRegistry !== 'function') {
      return null;
    }

    return toolAdapters.createProductionRegistry();
  } catch (error) {
    console.warn('[AgentService] Falling back to unavailable tool registry:', error);
    return null;
  }
}

function resolveDatabase(): Database.Database {
  const dbClient = global.dbClient as any;
  if (!dbClient) {
    throw new Error('Database client is not initialized');
  }

  if (dbClient.db) {
    return dbClient.db as Database.Database;
  }

  if (typeof dbClient.getDatabase === 'function') {
    return dbClient.getDatabase() as Database.Database;
  }

  throw new Error('Database client does not expose a SQLite handle');
}

export interface CreateTaskRequest {
  type: TaskType | string;
  accountId: string;
  input: Record<string, unknown>;
  config?: Partial<TaskConfig>;
}

export interface TaskExecutionResult {
  task: Task;
}

export interface TaskDetails {
  task: Task;
  runs: Run[];
  artifacts: Artifact[];
}

export class AgentService {
  private static instance: AgentService | null = null;

  private readonly eventBus: EventBus = new InMemoryEventBus();
  private toolRegistry: ToolRegistry = new UnavailableToolRegistry('Tool adapters not initialized');

  private graphRepo:
    | (GraphRepo & { getSourcesByImportBatch?: (...args: any[]) => Promise<any[]> })
    | null = null;
  private storage: LocalArtifactStorage | null = null;
  private handlerRegistry: InMemoryHandlerRegistry | null = null;
  private taskRunner: TaskRunner | null = null;
  private runtimeInitPromise: Promise<void> | null = null;
  private availableTaskTypes: TaskType[] = [];
  private runningTasks = new Set<string>();

  private constructor() {
    this.eventBus.subscribe((event: AgentEvent) => {
      if (event.type === 'task:started') {
        this.runningTasks.add(event.taskId);
        return;
      }

      if (
        event.type === 'task:completed' ||
        event.type === 'task:failed' ||
        event.type === 'task:cancelled'
      ) {
        this.runningTasks.delete(event.taskId);
      }
    });
  }

  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  configure(options: { toolRegistry?: ToolRegistry; graphRepo?: GraphRepo }): void {
    if (options.toolRegistry) {
      this.toolRegistry = options.toolRegistry;
    }
    if (options.graphRepo) {
      this.graphRepo = options.graphRepo as any;
    }
  }

  subscribe(handler: (event: AgentEvent) => void): () => void {
    const subscription = this.eventBus.subscribe(handler);
    return () => subscription.unsubscribe();
  }

  getAvailableTaskTypes(): string[] {
    return [...this.availableTaskTypes];
  }

  isTaskTypeAvailable(type: string): boolean {
    return this.availableTaskTypes.includes(type as TaskType);
  }

  getRunningTasks(): string[] {
    return Array.from(this.runningTasks);
  }

  getToolStatus(): ToolStatus[] {
    return this.toolRegistry.getStatus();
  }

  async getHealth(): Promise<{
    status: 'ok';
    availableTypes: string[];
    runningTasks: number;
    tools: ToolStatus[];
    degraded: boolean;
    degradedReasons: string[];
  }> {
    await this.ensureRuntimeInitialized();

    const tools = this.toolRegistry.getStatus();
    const degradedReasons = tools
      .filter((tool) => !tool.available)
      .map((tool) => `${tool.name}: ${tool.error || 'unavailable'}`);

    return {
      status: 'ok',
      availableTypes: this.getAvailableTaskTypes(),
      runningTasks: this.getRunningTasks().length,
      tools,
      degraded: degradedReasons.length > 0,
      degradedReasons,
    };
  }

  async executeTask(request: CreateTaskRequest): Promise<TaskExecutionResult> {
    await this.ensureRuntimeInitialized();

    const taskType = request.type as TaskType;
    if (!this.isTaskTypeAvailable(taskType)) {
      throw new Error(`Unknown task type: ${request.type}`);
    }

    if (!this.taskRunner || !this.graphRepo) {
      throw new Error('Agent runtime is not ready');
    }

    const agent = await this.graphRepo.getOrCreateAgent(request.accountId);
    const task = await this.taskRunner.submit({
      type: taskType,
      account_id: request.accountId,
      agent_id: agent.id,
      input: request.input,
      config: {
        version: request.config?.version || '1.0.0',
        ...request.config,
      },
    });

    return { task };
  }

  async retryTask(taskId: string, accountId: string): Promise<TaskExecutionResult> {
    await this.ensureRuntimeInitialized();

    if (!this.graphRepo) {
      throw new Error('Agent runtime is not ready');
    }

    const task = await this.graphRepo.getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.account_id !== accountId) {
      throw new Error('Task does not belong to this account');
    }

    if (task.status === 'pending' || task.status === 'running') {
      throw new Error('Only terminal tasks can be retried');
    }

    return this.executeTask({
      type: task.type,
      accountId,
      input: task.input as Record<string, unknown>,
      config: task.config,
    });
  }

  async cancelTask(taskId: string): Promise<boolean> {
    await this.ensureRuntimeInitialized();

    if (!this.taskRunner) {
      return false;
    }

    return this.taskRunner.cancel(taskId, 'Cancelled by user');
  }

  async getTask(taskId: string): Promise<Task | null> {
    await this.ensureRuntimeInitialized();
    return this.graphRepo?.getTask(taskId) || null;
  }

  async getTaskHistory(accountId: string): Promise<Task[]> {
    await this.ensureRuntimeInitialized();
    return this.graphRepo?.listTasks(accountId, { limit: 200 }) || [];
  }

  async getTaskDetails(taskId: string): Promise<TaskDetails | null> {
    await this.ensureRuntimeInitialized();

    if (!this.graphRepo) {
      return null;
    }

    const task = await this.graphRepo.getTask(taskId);
    if (!task) {
      return null;
    }

    const runs = await this.graphRepo.getRuns(taskId);
    const artifacts: Artifact[] = [];

    for (const run of runs) {
      const runArtifacts = await this.graphRepo.getArtifacts(run.id);
      artifacts.push(...runArtifacts);
    }

    return { task, runs, artifacts };
  }

  private async ensureRuntimeInitialized(): Promise<void> {
    if (this.runtimeInitPromise) {
      await this.runtimeInitPromise;
      return;
    }

    this.runtimeInitPromise = this.initializeRuntime();
    await this.runtimeInitPromise;
  }

  private async initializeRuntime(): Promise<void> {
    const db = resolveDatabase();
    const graphRepo = this.graphRepo || new SQLiteAgentGraphRepo(db);
    const storage = this.storage || new LocalArtifactStorage();
    await storage.ensureReady();

    if (this.toolRegistry instanceof UnavailableToolRegistry) {
      const productionRegistry = await loadProductionToolRegistry();
      if (productionRegistry) {
        this.toolRegistry = productionRegistry;
      } else {
        this.toolRegistry = new UnavailableToolRegistry('Failed to load @keimenon/tool-adapters');
      }
    }

    try {
      await this.toolRegistry.refresh();
    } catch (error) {
      console.warn('[AgentService] Tool registry refresh failed:', error);
    }

    if (process.env.NODE_ENV === 'production') {
      const missingEnv: string[] = [];
      if (!process.env.LITELLM_URL) missingEnv.push('LITELLM_URL');
      if (!process.env.LITELLM_API_KEY) missingEnv.push('LITELLM_API_KEY');
      if (!process.env.SEARXNG_URL) missingEnv.push('SEARXNG_URL');
      if (missingEnv.length > 0) {
        throw new Error(
          `[AgentService] Missing required provider env configuration: ${missingEnv.join(', ')}`
        );
      }

      const providerStatus = this.toolRegistry
        .getStatus()
        .filter((tool) => tool.name === 'llm' || tool.name === 'web');
      const unavailable = providerStatus.filter((tool) => !tool.available);
      if (unavailable.length > 0) {
        const detail = unavailable
          .map((tool) => `${tool.name}:${tool.error || 'unavailable'}`)
          .join(', ');
        throw new Error(`[AgentService] Required providers unavailable in production: ${detail}`);
      }
    }

    const handlerRegistry = new InMemoryHandlerRegistry();
    const taskHandlersModule = await loadTaskHandlersModule();
    const types = taskHandlersModule.getTaskHandlerTypes();
    for (const type of types) {
      const handler = taskHandlersModule.getTaskHandler(type);
      if (handler) {
        handlerRegistry.register(handler);
      }
    }

    const registeredTypes = handlerRegistry.list();
    if (registeredTypes.length === 0) {
      throw new Error('[AgentService] No task handlers registered');
    }
    this.availableTaskTypes = registeredTypes;

    this.graphRepo = graphRepo;
    this.storage = storage;
    this.handlerRegistry = handlerRegistry;
    this.taskRunner = new TaskRunner({
      graph: graphRepo,
      storage,
      events: this.eventBus,
      tools: this.toolRegistry,
      handlers: handlerRegistry,
    });
  }
}

export function getAgentService(): AgentService {
  return AgentService.getInstance();
}
