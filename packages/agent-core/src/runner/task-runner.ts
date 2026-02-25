/**
 * TaskRunner
 *
 * Core execution engine for agent tasks.
 * Handles task lifecycle, retry logic, and cancellation.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Task,
  TaskStatus,
  Run,
  RunMetrics,
  TaskConfig,
  RetryPolicy,
} from '../types/task.js';
import { createEvent } from '../types/events.js';
import type { GraphRepo } from '../interfaces/graph-repo.js';
import type { Storage } from '../interfaces/storage.js';
import type { EventBus } from '../interfaces/event-bus.js';
import type { ToolRegistry } from '../interfaces/tool-registry.js';
import type {
  TaskHandler,
  TaskContext,
  TaskResult,
  HandlerRegistry,
} from '../interfaces/task-handler.js';

/**
 * Default retry policy
 */
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_attempts: 3,
  backoff_ms: 1000,
  backoff_multiplier: 2,
};

/**
 * Default task config
 */
const DEFAULT_TASK_CONFIG: TaskConfig = {
  version: '1.0.0',
  retry_policy: DEFAULT_RETRY_POLICY,
  timeout_ms: 300000, // 5 minutes
};

/**
 * Task execution options
 */
export interface RunOptions {
  /** Override default timeout */
  timeout_ms?: number;
  /** Override retry policy */
  retry_policy?: RetryPolicy;
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * TaskRunner dependencies
 */
export interface TaskRunnerDeps {
  graph: GraphRepo;
  storage: Storage;
  events: EventBus;
  tools: ToolRegistry;
  handlers: HandlerRegistry;
}

/**
 * TaskRunner - Core execution engine
 *
 * Responsibilities:
 * - Execute tasks via registered handlers
 * - Manage retry logic with exponential backoff
 * - Support cancellation via AbortController
 * - Emit events for progress tracking
 * - Persist task/run/artifact records
 */
export class TaskRunner {
  private deps: TaskRunnerDeps;
  private activeTasks = new Map<string, AbortController>();

  constructor(deps: TaskRunnerDeps) {
    this.deps = deps;
  }

  /**
   * Submit a new task for execution
   */
  async submit<TInput extends Record<string, unknown>>(
    task: Omit<Task<TInput>, 'id' | 'status' | 'created_at'>,
    options?: RunOptions
  ): Promise<Task<TInput>> {
    // Create task record
    const fullTask: Task<TInput> = {
      ...task,
      id: uuidv4(),
      status: 'pending',
      created_at: Date.now(),
      config: {
        ...DEFAULT_TASK_CONFIG,
        ...task.config,
        retry_policy: options?.retry_policy || task.config?.retry_policy || DEFAULT_RETRY_POLICY,
      },
      metadata: {
        ...task.metadata,
        ...options?.metadata,
      },
    };

    // Persist task
    await this.deps.graph.saveTask(fullTask as Task);

    // Start execution
    this.executeTask(fullTask as Task).catch((error) => {
      console.error(`[TaskRunner] Unhandled error in task ${fullTask.id}:`, error);
    });

    return fullTask;
  }

  /**
   * Cancel a running task
   */
  async cancel(taskId: string, reason?: string): Promise<boolean> {
    const controller = this.activeTasks.get(taskId);
    if (!controller) {
      return false;
    }

    controller.abort(reason || 'Cancelled by user');

    // Update task status
    await this.deps.graph.updateTaskStatus(taskId, 'cancelled', reason);

    // Emit cancelled event
    this.deps.events.emit(
      createEvent({
        type: 'task:cancelled',
        taskId,
        reason,
      })
    );

    this.activeTasks.delete(taskId);
    return true;
  }

  /**
   * Get task status
   */
  async getStatus(taskId: string): Promise<Task | null> {
    return this.deps.graph.getTask(taskId);
  }

  /**
   * Check if a task is currently running
   */
  isRunning(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }

  /**
   * Get count of active tasks
   */
  getActiveCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Execute a task with retry logic
   */
  private async executeTask(task: Task): Promise<void> {
    // Get handler for task type
    const handler = this.deps.handlers.get(task.type);
    if (!handler) {
      await this.deps.graph.updateTaskStatus(
        task.id,
        'failed',
        `No handler registered for task type: ${task.type}`
      );
      this.deps.events.emit(
        createEvent({
          type: 'task:failed',
          taskId: task.id,
          error: `No handler registered for task type: ${task.type}`,
          willRetry: false,
          attempt: 0,
        })
      );
      return;
    }

    // Validate input
    const validation = handler.validate(task.input);
    if (!validation.valid) {
      const errorMsg = `Invalid task input: ${validation.errors?.join(', ')}`;
      await this.deps.graph.updateTaskStatus(task.id, 'failed', errorMsg);
      this.deps.events.emit(
        createEvent({
          type: 'task:failed',
          taskId: task.id,
          error: errorMsg,
          willRetry: false,
          attempt: 0,
        })
      );
      return;
    }

    // Check tool availability
    if (handler.canExecute) {
      const canExec = handler.canExecute(this.deps.tools);
      if (!canExec.can) {
        const errorMsg = `Cannot execute: ${canExec.reason}`;
        await this.deps.graph.updateTaskStatus(task.id, 'failed', errorMsg);
        this.deps.events.emit(
          createEvent({
            type: 'task:failed',
            taskId: task.id,
            error: errorMsg,
            willRetry: false,
            attempt: 0,
          })
        );
        return;
      }
    }

    // Setup abort controller
    const controller = new AbortController();
    this.activeTasks.set(task.id, controller);

    // Update task to running
    await this.deps.graph.updateTaskStatus(task.id, 'running');
    this.deps.events.emit(
      createEvent({
        type: 'task:started',
        taskId: task.id,
        taskType: task.type,
      })
    );

    // Get retry policy
    const retryPolicy = task.config.retry_policy || DEFAULT_RETRY_POLICY;
    let lastError: Error | undefined;
    let attempt = 0;

    // Retry loop
    while (attempt < retryPolicy.max_attempts) {
      attempt++;

      try {
        const result = await this.executeRun(
          task,
          handler,
          attempt,
          controller.signal
        );

        if (result.success) {
          // Success - update task and emit event
          await this.deps.graph.updateTaskStatus(task.id, 'completed');
          this.deps.events.emit(
            createEvent({
              type: 'task:completed',
              taskId: task.id,
              artifacts: result.artifacts,
              metrics: result.metrics,
            })
          );
          this.activeTasks.delete(task.id);
          return;
        }

        // Handler returned failure
        lastError = new Error(result.error || 'Task failed');
      } catch (error) {
        if (controller.signal.aborted) {
          // Task was cancelled
          this.activeTasks.delete(task.id);
          return;
        }

        lastError = error as Error;
      }

      // Check if we should retry
      const willRetry = attempt < retryPolicy.max_attempts;

      this.deps.events.emit(
        createEvent({
          type: 'task:failed',
          taskId: task.id,
          error: lastError?.message || 'Unknown error',
          willRetry,
          attempt,
        })
      );

      if (willRetry) {
        // Wait before retry with exponential backoff
        const backoff = this.calculateBackoff(attempt, retryPolicy);
        await this.sleep(backoff, controller.signal);
      }
    }

    // All retries exhausted
    await this.deps.graph.updateTaskStatus(
      task.id,
      'failed',
      lastError?.message || 'Max retries exceeded'
    );
    this.activeTasks.delete(task.id);
  }

  /**
   * Execute a single run attempt
   */
  private async executeRun(
    task: Task,
    handler: TaskHandler,
    attempt: number,
    signal: AbortSignal
  ): Promise<TaskResult> {
    const startTime = Date.now();

    // Create run record
    const run: Run = {
      id: uuidv4(),
      task_id: task.id,
      attempt,
      status: 'running',
      started_at: startTime,
      metrics: {
        duration_ms: 0,
      },
    };

    await this.deps.graph.saveRun(run);

    this.deps.events.emit(
      createEvent({
        type: 'run:started',
        taskId: task.id,
        runId: run.id,
        attempt,
      })
    );

    try {
      // Build task context
      const ctx: TaskContext = {
        task,
        run,
        graph: this.deps.graph,
        storage: this.deps.storage,
        tools: this.deps.tools,
        events: this.deps.events,
        signal,
      };

      // Setup timeout
      const timeout = task.config.timeout_ms || DEFAULT_TASK_CONFIG.timeout_ms!;
      const timeoutPromise = this.createTimeout(timeout, signal);

      // Execute handler
      const result = await Promise.race([
        handler.run(task.input, ctx),
        timeoutPromise,
      ]);

      // Update run metrics
      const metrics: RunMetrics = {
        duration_ms: Date.now() - startTime,
        ...result.metrics,
      };

      await this.deps.graph.updateRun(run.id, {
        status: result.success ? 'completed' : 'failed',
        completed_at: Date.now(),
        error: result.error,
        metrics,
      });

      if (result.success) {
        this.deps.events.emit(
          createEvent({
            type: 'run:completed',
            taskId: task.id,
            runId: run.id,
            attempt,
            artifacts: result.artifacts,
          })
        );
      } else {
        this.deps.events.emit(
          createEvent({
            type: 'run:failed',
            taskId: task.id,
            runId: run.id,
            attempt,
            error: result.error || 'Unknown error',
          })
        );
      }

      return { ...result, metrics };
    } catch (error) {
      const metrics: RunMetrics = {
        duration_ms: Date.now() - startTime,
      };

      await this.deps.graph.updateRun(run.id, {
        status: 'failed',
        completed_at: Date.now(),
        error: (error as Error).message,
        metrics,
      });

      this.deps.events.emit(
        createEvent({
          type: 'run:failed',
          taskId: task.id,
          runId: run.id,
          attempt,
          error: (error as Error).message,
        })
      );

      // Call cleanup if available
      if (handler.cleanup) {
        try {
          await handler.cleanup(
            {
              task,
              run,
              graph: this.deps.graph,
              storage: this.deps.storage,
              tools: this.deps.tools,
              events: this.deps.events,
              signal,
            },
            error as Error
          );
        } catch (cleanupError) {
          console.error('[TaskRunner] Cleanup failed:', cleanupError);
        }
      }

      throw error;
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number, policy: RetryPolicy): number {
    const multiplier = policy.backoff_multiplier || 2;
    return policy.backoff_ms * Math.pow(multiplier, attempt - 1);
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number, signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task timed out after ${ms}ms`));
      }, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Task cancelled'));
      });
    });
  }

  /**
   * Sleep with abort support
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Task cancelled'));
      });
    });
  }
}
