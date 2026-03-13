/**
 * @keimenon/tool-adapters
 *
 * Pluggable tool adapters for Keimenon agent services:
 * - LLM: LiteLLM proxy for unified access to 100+ providers
 * - Web: SearXNG for self-hosted, privacy-focused search
 *
 * @example
 * ```typescript
 * import {
 *   DefaultToolRegistry,
 *   createProductionRegistry,
 * } from '@keimenon/tool-adapters';
 *
 * // For production
 * const registry = createProductionRegistry();
 *
 * // Get adapters
 * const llm = registry.getLLMAdapter();
 * if (llm?.isAvailable()) {
 *   const topics = await llm.extractTopics('Some text to analyze');
 * }
 * ```
 */

// LLM Adapters
export { LiteLLMAdapter } from './llm/index.js';
export type { LiteLLMConfig } from './llm/index.js';

// Web Adapters
export { SearXNGAdapter } from './web/index.js';
export type { SearXNGConfig } from './web/index.js';

// Exec Adapters
export { LocalExecAdapter } from './exec/index.js';
export type { LocalExecConfig } from './exec/index.js';

// Proof Adapters
export { LocalProofAdapter } from './proof/index.js';
export type { LocalProofConfig } from './proof/index.js';

// Git Adapters
export { LocalGitAdapter } from './git/index.js';
export type { LocalGitConfig } from './git/index.js';

// Registry
export { DefaultToolRegistry, createProductionRegistry } from './registry/index.js';
export type { DefaultRegistryConfig } from './registry/index.js';
