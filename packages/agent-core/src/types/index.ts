/**
 * Agent Core Types
 *
 * Re-exports all type definitions for the agent-core package.
 */

// Task types
export type {
  TaskType,
  TaskStatus,
  RunStatus,
  ArtifactType,
  RetryPolicy,
  TaskConfig,
  Task,
  Run,
  RunMetrics,
  Artifact,
  GroupSummaryInput,
  GroupSummaryOutput,
  DuplicateSuggestInput,
  DuplicateCluster,
  DuplicateSuggestOutput,
  VerifySourceChainInput,
  VerifySourceChainOutput,
  TypedTask,
} from './task.js';

// Agent types
export type {
  AgentCapability,
  AgentNode,
  AgentMetadata,
  AgentConfig,
} from './agent.js';

export { DEFAULT_AGENT_CONFIG, createAgentNode } from './agent.js';

// Event types
export type {
  TaskStartedEvent,
  TaskProgressEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent,
  RunStartedEvent,
  RunCompletedEvent,
  RunFailedEvent,
  ToolInvokedEvent,
  ToolResultEvent,
  AgentEvent,
  AgentEventHandler,
} from './events.js';

export { createEvent } from './events.js';
