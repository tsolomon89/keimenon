/**
 * Agent Core Interfaces
 *
 * Re-exports all interface definitions for the agent-core package.
 */

// GraphRepo
export type {
  NodeStatus,
  SourceFilters,
  GraphNode,
  GraphEdge,
  GroupNode,
  SourceNode,
  GraphRepo,
} from './graph-repo.js';

// Storage
export type {
  StoragePutResult,
  StorageMetadata,
  Storage,
} from './storage.js';

// EventBus
export type {
  Subscription,
  EventFilter,
  EventBus,
} from './event-bus.js';

export { InMemoryEventBus } from './event-bus.js';

// ToolRegistry
export type {
  ChatMessage,
  ChatOptions,
  ExtractedTopic,
  LLMAdapter,
  SearchResult,
  WebAdapter,
  ExecResult,
  ExecAdapter,
  ProofResult,
  ProofAdapter,
  GitAdapter,
  ToolStatus,
  ToolRegistry,
} from './tool-registry.js';

export { NullLLMAdapter, NullWebAdapter } from './tool-registry.js';

// TaskHandler
export type {
  TaskStep,
  TaskContext,
  TaskResult,
  TaskHandler,
  HandlerRegistration,
  HandlerRegistry,
} from './task-handler.js';

export { InMemoryHandlerRegistry } from './task-handler.js';
