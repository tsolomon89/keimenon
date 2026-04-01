/**
 * Test-only exports for @keimenon/tool-adapters.
 *
 * Production code should import from package root, which excludes mock adapters.
 */

import { MockLLMAdapter, MockWebAdapter } from './mocks/index.js';
export { MockLLMAdapter, MockWebAdapter } from './mocks/index.js';
export type { MockLLMConfig, MockWebConfig } from './mocks/index.js';
import { DefaultToolRegistry } from './registry/default-registry.js';

export function createMockRegistry(): DefaultToolRegistry {
  const registry = new DefaultToolRegistry({
    llm: { type: 'none' },
    web: { type: 'none' },
    exec: { type: 'none' },
    proof: { type: 'none' },
    git: { type: 'none' },
  });

  registry.setLLMAdapter(new MockLLMAdapter());
  registry.setWebAdapter(new MockWebAdapter());
  return registry;
}
