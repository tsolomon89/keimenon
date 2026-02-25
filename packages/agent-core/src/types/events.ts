/**
 * Agent Event Types
 *
 * Events emitted during task execution for UI updates and logging.
 * All events are immutable and include timestamps.
 */

/**
 * Base event interface
 */
interface BaseEvent {
  /** Event timestamp */
  timestamp: number;
  /** Source agent ID */
  agent_id?: string;
}

/**
 * Task started event
 */
export interface TaskStartedEvent extends BaseEvent {
  type: 'task:started';
  taskId: string;
  taskType: string;
}

/**
 * Task progress update event
 */
export interface TaskProgressEvent extends BaseEvent {
  type: 'task:progress';
  taskId: string;
  /** Progress percentage (0-100) */
  percent: number;
  /** Human-readable progress message */
  message: string;
  /** Current step (if multi-step) */
  step?: number;
  /** Total steps */
  totalSteps?: number;
}

/**
 * Task completed successfully event
 */
export interface TaskCompletedEvent extends BaseEvent {
  type: 'task:completed';
  taskId: string;
  /** List of artifact IDs created */
  artifacts: string[];
  /** Execution metrics */
  metrics?: {
    duration_ms: number;
    tokens_used?: number;
  };
}

/**
 * Task failed event
 */
export interface TaskFailedEvent extends BaseEvent {
  type: 'task:failed';
  taskId: string;
  /** Error message */
  error: string;
  /** Error code (if available) */
  code?: string;
  /** Whether the task will be retried */
  willRetry: boolean;
  /** Attempt number that failed */
  attempt: number;
}

/**
 * Task cancelled event
 */
export interface TaskCancelledEvent extends BaseEvent {
  type: 'task:cancelled';
  taskId: string;
  /** Reason for cancellation */
  reason?: string;
}

/**
 * Run started event (for individual attempts)
 */
export interface RunStartedEvent extends BaseEvent {
  type: 'run:started';
  taskId: string;
  runId: string;
  attempt: number;
}

/**
 * Run completed event
 */
export interface RunCompletedEvent extends BaseEvent {
  type: 'run:completed';
  taskId: string;
  runId: string;
  attempt: number;
  artifacts: string[];
}

/**
 * Run failed event
 */
export interface RunFailedEvent extends BaseEvent {
  type: 'run:failed';
  taskId: string;
  runId: string;
  attempt: number;
  error: string;
}

/**
 * Tool invocation event (for debugging/logging)
 */
export interface ToolInvokedEvent extends BaseEvent {
  type: 'tool:invoked';
  taskId: string;
  /** Tool name (e.g., 'llm', 'web', 'exec') */
  tool: string;
  /** Operation being performed */
  operation: string;
}

/**
 * Tool result event
 */
export interface ToolResultEvent extends BaseEvent {
  type: 'tool:result';
  taskId: string;
  tool: string;
  operation: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Duration in ms */
  duration_ms: number;
}

/**
 * Union of all agent events
 */
export type AgentEvent =
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskCancelledEvent
  | RunStartedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | ToolInvokedEvent
  | ToolResultEvent;

/**
 * Event handler type
 */
export type AgentEventHandler = (event: AgentEvent) => void;

/**
 * Event without timestamp (for creation)
 */
export type EventWithoutTimestamp<T extends AgentEvent> = Omit<T, 'timestamp'>;

/**
 * Create a timestamped event
 *
 * Note: Uses type assertion because TypeScript has difficulty
 * with discriminated unions and Omit. The runtime behavior is correct.
 */
export function createEvent(
  event:
    | EventWithoutTimestamp<TaskStartedEvent>
    | EventWithoutTimestamp<TaskProgressEvent>
    | EventWithoutTimestamp<TaskCompletedEvent>
    | EventWithoutTimestamp<TaskFailedEvent>
    | EventWithoutTimestamp<TaskCancelledEvent>
    | EventWithoutTimestamp<RunStartedEvent>
    | EventWithoutTimestamp<RunCompletedEvent>
    | EventWithoutTimestamp<RunFailedEvent>
    | EventWithoutTimestamp<ToolInvokedEvent>
    | EventWithoutTimestamp<ToolResultEvent>
): AgentEvent {
  return {
    ...event,
    timestamp: Date.now(),
  } as AgentEvent;
}
