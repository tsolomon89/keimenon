/**
 * @keimenon/task-handlers
 *
 * Task handler implementations for Keimenon agent services.
 *
 * Handlers:
 * - GROUP_SUMMARY_BUILD: Generate canonical summaries from group sources
 * - DUPLICATE_SUGGEST: Propose duplicate clusters without auto-merging
 * - VERIFY_SOURCE_CHAIN: Create evidence chains from web search (Pro+)
 */

export { GroupSummaryBuildHandler } from './group-summary-build.js';
export { DuplicateSuggestHandler } from './duplicate-suggest.js';
export { VerifySourceChainHandler } from './verify-source-chain.js';

import type { TaskHandler } from '@keimenon/agent-core';
import { GroupSummaryBuildHandler } from './group-summary-build.js';
import { DuplicateSuggestHandler } from './duplicate-suggest.js';
import { VerifySourceChainHandler } from './verify-source-chain.js';

/**
 * Registry of all available task handlers
 */
export const TASK_HANDLERS: Record<string, TaskHandler<unknown, unknown>> = {
  GROUP_SUMMARY_BUILD: new GroupSummaryBuildHandler(),
  DUPLICATE_SUGGEST: new DuplicateSuggestHandler(),
  VERIFY_SOURCE_CHAIN: new VerifySourceChainHandler(),
};

/**
 * Get a task handler by type
 */
export function getTaskHandler(type: string): TaskHandler<unknown, unknown> | undefined {
  return TASK_HANDLERS[type];
}

/**
 * Get all registered task handler types
 */
export function getTaskHandlerTypes(): string[] {
  return Object.keys(TASK_HANDLERS);
}

/**
 * Check if a task handler exists
 */
export function hasTaskHandler(type: string): boolean {
  return type in TASK_HANDLERS;
}
