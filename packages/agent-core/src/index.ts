/**
 * @keimenon/agent-core
 *
 * Core agent services for Keimenon:
 * - Task runner with retry/cancellation
 * - Type definitions for tasks, runs, artifacts
 * - Interfaces for pluggable adapters
 *
 * @example
 * ```typescript
 * import {
 *   TaskRunner,
 *   InMemoryEventBus,
 *   InMemoryHandlerRegistry,
 * } from '@keimenon/agent-core';
 *
 * const runner = new TaskRunner({
 *   graph: graphRepo,
 *   storage: casStorage,
 *   events: new InMemoryEventBus(),
 *   tools: toolRegistry,
 *   handlers: new InMemoryHandlerRegistry(),
 * });
 *
 * const task = await runner.submit({
 *   type: 'GROUP_SUMMARY_BUILD',
 *   account_id: 'acc_123',
 *   agent_id: 'agent_123',
 *   input: {
 *     groupId: 'grp_456',
 *     selectionPolicy: 'all',
 *     maxTokens: 4000,
 *     modelPolicy: 'gpt-4',
 *   },
 *   config: { version: '1.0.0' },
 * });
 * ```
 */

// Types
export * from './types/index.js';

// Interfaces
export * from './interfaces/index.js';

// Runner
export * from './runner/index.js';
