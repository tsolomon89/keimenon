/**
 * TaskHandler Interface
 *
 * Defines the contract for task execution handlers.
 * Each task type has a corresponding handler implementation.
 */

import type { ArtifactType, Task, Run, TaskType, RunMetrics } from '../types/task.js';
import type { GraphRepo } from './graph-repo.js';
import type { Storage } from './storage.js';
import type { EventBus } from './event-bus.js';
import type { ToolRegistry } from './tool-registry.js';

/**
 * Execution step for multi-step tasks
 */
export interface TaskStep {
  /** Step identifier */
  id: string;
  /** Human-readable step name */
  name: string;
  /** Step description */
  description?: string;
  /** Whether this step can be skipped */
  optional?: boolean;
  /** Estimated duration in ms */
  estimated_ms?: number;
}

/**
 * Context provided to task handlers during execution
 */
export interface TaskContext<TInput = Record<string, unknown>> {
  /** The task being executed */
  task: Task<TInput>;
  /** Current run instance */
  run: Run;
  /** Graph repository for data access */
  graph: GraphRepo;
  /** Content-addressable storage */
  storage: Storage;
  /** Tool registry for adapters */
  tools: ToolRegistry;
  /** Event bus for progress updates */
  events: EventBus;
  /** Abort signal for cancellation */
  signal: AbortSignal;
}

/**
 * Task handler result
 */
export interface TaskResult<TOutput = unknown> {
  /** Whether execution succeeded */
  success: boolean;
  /** Output data (if successful) */
  output?: TOutput;
  /** Error message (if failed) */
  error?: string;
  /** Created artifact references (storage hashes + optional metadata) */
  artifacts: Array<
    | string
    | {
        hash: string;
        type?: ArtifactType;
        path?: string;
        metadata?: Record<string, unknown>;
      }
  >;
  /** Execution metrics (uses RunMetrics with index signature for custom metrics) */
  metrics?: RunMetrics;
}

/**
 * TaskHandler interface
 *
 * Implementations handle specific task types with deterministic execution.
 *
 * Key principles:
 * - Same inputs + config = same graph mutations
 * - Never modify existing source nodes
 * - Create new nodes for all outputs
 * - Support cancellation via AbortSignal
 */
export interface TaskHandler<TInput = unknown, TOutput = unknown> {
  /**
   * Task type this handler processes
   */
  readonly type: TaskType;

  /**
   * Human-readable handler name
   */
  readonly name: string;

  /**
   * Handler description
   */
  readonly description?: string;

  /**
   * Validate task input before execution
   *
   * @param input - Task input to validate
   * @returns Validation result with errors if invalid
   */
  validate(input: TInput): { valid: boolean; errors?: string[] };

  /**
   * Optional: Plan execution steps before running
   * Useful for showing progress to users
   *
   * @param input - Task input
   * @param ctx - Task context
   * @returns Planned execution steps
   */
  plan?(input: TInput, ctx: TaskContext<TInput>): Promise<TaskStep[]>;

  /**
   * Execute the task
   *
   * @param input - Task input
   * @param ctx - Task context
   * @returns Task result with output and artifacts
   */
  run(input: TInput, ctx: TaskContext<TInput>): Promise<TaskResult<TOutput>>;

  /**
   * Optional: Cleanup after task failure
   * Called when run() throws or returns success: false
   *
   * @param ctx - Task context
   * @param error - Error that caused failure
   */
  cleanup?(ctx: TaskContext<TInput>, error: Error): Promise<void>;

  /**
   * Check if handler can execute with current tool availability
   *
   * @param tools - Tool registry
   * @returns Whether required tools are available
   */
  canExecute?(tools: ToolRegistry): { can: boolean; reason?: string };
}

/**
 * Handler registration entry
 */
export interface HandlerRegistration<TInput = unknown, TOutput = unknown> {
  type: TaskType;
  handler: TaskHandler<TInput, TOutput>;
}

/**
 * Handler registry for managing task handlers
 */
export interface HandlerRegistry {
  /**
   * Register a task handler
   */
  register<TInput, TOutput>(handler: TaskHandler<TInput, TOutput>): void;

  /**
   * Get handler for a task type
   */
  get<TInput = unknown, TOutput = unknown>(
    type: TaskType
  ): TaskHandler<TInput, TOutput> | undefined;

  /**
   * Check if handler exists for type
   */
  has(type: TaskType): boolean;

  /**
   * List all registered handler types
   */
  list(): TaskType[];
}

/**
 * Simple in-memory handler registry implementation
 */
export class InMemoryHandlerRegistry implements HandlerRegistry {
  private handlers = new Map<TaskType, TaskHandler>();

  register<TInput, TOutput>(handler: TaskHandler<TInput, TOutput>): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`[HandlerRegistry] Overwriting handler for ${handler.type}`);
    }
    this.handlers.set(handler.type, handler as TaskHandler);
  }

  get<TInput = unknown, TOutput = unknown>(
    type: TaskType
  ): TaskHandler<TInput, TOutput> | undefined {
    return this.handlers.get(type) as TaskHandler<TInput, TOutput> | undefined;
  }

  has(type: TaskType): boolean {
    return this.handlers.has(type);
  }

  list(): TaskType[] {
    return Array.from(this.handlers.keys());
  }
}
