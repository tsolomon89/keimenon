/**
 * @keimenon/task-handlers
 *
 * Task handler implementations for Keimenon agent services.
 *
 * Handlers:
 * - GROUP_SUMMARY_BUILD: Generate canonical summaries from group sources
 * - DUPLICATE_SUGGEST: Propose duplicate clusters without auto-merging
 * - VERIFY_SOURCE_CHAIN: Create evidence chains from web search (Pro+)
 * - ANALYZE_SOURCE: LLM-backed source analysis with structured claims/tags
 * - VERIFY_TOPIC: External topic verification with evidence artifacts
 */

export { GroupSummaryBuildHandler } from './group-summary-build.js';
export { DuplicateSuggestHandler } from './duplicate-suggest.js';
export { VerifySourceChainHandler } from './verify-source-chain.js';
export { AnalyzeSourceHandler } from './analyze-source.js';
export { VerifyTopicHandler } from './verify-topic.js';

import type { TaskHandler } from '@keimenon/agent-core';
import { GroupSummaryBuildHandler } from './group-summary-build.js';
import { DuplicateSuggestHandler } from './duplicate-suggest.js';
import { VerifySourceChainHandler } from './verify-source-chain.js';
import { AnalyzeSourceHandler } from './analyze-source.js';
import { VerifyTopicHandler } from './verify-topic.js';

/**
 * Registry of all available task handlers
 */
export const TASK_HANDLERS: Record<string, TaskHandler<unknown, unknown>> = {
  GROUP_SUMMARY_BUILD: new GroupSummaryBuildHandler(),
  DUPLICATE_SUGGEST: new DuplicateSuggestHandler(),
  VERIFY_SOURCE_CHAIN: new VerifySourceChainHandler(),
  ANALYZE_SOURCE: new AnalyzeSourceHandler(),
  VERIFY_TOPIC: new VerifyTopicHandler(),
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
