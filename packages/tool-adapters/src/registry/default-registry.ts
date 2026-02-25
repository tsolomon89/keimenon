/**
 * Default Tool Registry
 *
 * Combines all tool adapters into a single registry.
 * Provides graceful degradation when tools are unavailable.
 */

import type {
  ToolRegistry,
  ToolStatus,
  LLMAdapter,
  WebAdapter,
  ExecAdapter,
  ProofAdapter,
  GitAdapter,
  NullLLMAdapter,
  NullWebAdapter,
} from '@keimenon/agent-core';

import { LiteLLMAdapter, type LiteLLMConfig } from '../llm/litellm-adapter.js';
import { SearXNGAdapter, type SearXNGConfig } from '../web/searxng-adapter.js';
import { MockLLMAdapter, type MockLLMConfig } from '../mocks/mock-llm-adapter.js';
import { MockWebAdapter, type MockWebConfig } from '../mocks/mock-web-adapter.js';

/**
 * Configuration for the default tool registry
 */
export interface DefaultRegistryConfig {
  /** LLM adapter configuration */
  llm?: {
    type: 'litellm' | 'mock' | 'none';
    config?: LiteLLMConfig | MockLLMConfig;
  };
  /** Web adapter configuration */
  web?: {
    type: 'searxng' | 'mock' | 'none';
    config?: SearXNGConfig | MockWebConfig;
  };
  /** Whether to use mock adapters as fallback */
  useMockFallback?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DefaultRegistryConfig = {
  llm: { type: 'litellm' },
  web: { type: 'searxng' },
  useMockFallback: process.env.NODE_ENV === 'test',
};

/**
 * Default Tool Registry Implementation
 *
 * Creates and manages tool adapters based on configuration.
 * Falls back to mock adapters in test environments.
 */
export class DefaultToolRegistry implements ToolRegistry {
  private llmAdapter: LLMAdapter | null = null;
  private webAdapter: WebAdapter | null = null;
  private execAdapter: ExecAdapter | null = null;
  private proofAdapter: ProofAdapter | null = null;
  private gitAdapter: GitAdapter | null = null;
  private config: DefaultRegistryConfig;

  constructor(config: DefaultRegistryConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeAdapters();
  }

  /**
   * Initialize adapters based on configuration
   */
  private initializeAdapters(): void {
    // Initialize LLM adapter
    switch (this.config.llm?.type) {
      case 'litellm':
        this.llmAdapter = new LiteLLMAdapter(
          this.config.llm.config as LiteLLMConfig
        );
        break;
      case 'mock':
        this.llmAdapter = new MockLLMAdapter(
          this.config.llm.config as MockLLMConfig
        );
        break;
      case 'none':
      default:
        this.llmAdapter = null;
    }

    // Initialize Web adapter
    switch (this.config.web?.type) {
      case 'searxng':
        this.webAdapter = new SearXNGAdapter(
          this.config.web.config as SearXNGConfig
        );
        break;
      case 'mock':
        this.webAdapter = new MockWebAdapter(
          this.config.web.config as MockWebConfig
        );
        break;
      case 'none':
      default:
        this.webAdapter = null;
    }

    // Exec, Proof, Git adapters not yet implemented
    this.execAdapter = null;
    this.proofAdapter = null;
    this.gitAdapter = null;
  }

  getLLMAdapter(): LLMAdapter | null {
    // If primary adapter unavailable and fallback enabled, use mock
    if (
      this.llmAdapter &&
      !this.llmAdapter.isAvailable() &&
      this.config.useMockFallback
    ) {
      return new MockLLMAdapter();
    }
    return this.llmAdapter;
  }

  getWebAdapter(): WebAdapter | null {
    // If primary adapter unavailable and fallback enabled, use mock
    if (
      this.webAdapter &&
      !this.webAdapter.isAvailable() &&
      this.config.useMockFallback
    ) {
      return new MockWebAdapter();
    }
    return this.webAdapter;
  }

  getExecAdapter(): ExecAdapter | null {
    return this.execAdapter;
  }

  getProofAdapter(): ProofAdapter | null {
    return this.proofAdapter;
  }

  getGitAdapter(): GitAdapter | null {
    return this.gitAdapter;
  }

  getStatus(): ToolStatus[] {
    return [
      {
        name: 'llm',
        available: this.llmAdapter?.isAvailable() ?? false,
        provider: this.llmAdapter?.getProvider(),
      },
      {
        name: 'web',
        available: this.webAdapter?.isAvailable() ?? false,
        provider: this.webAdapter?.getProvider(),
      },
      {
        name: 'exec',
        available: false,
        error: 'Not implemented',
      },
      {
        name: 'proof',
        available: false,
        error: 'Not implemented',
      },
      {
        name: 'git',
        available: false,
        error: 'Not implemented',
      },
    ];
  }

  isAvailable(tool: 'llm' | 'web' | 'exec' | 'proof' | 'git'): boolean {
    switch (tool) {
      case 'llm':
        return this.llmAdapter?.isAvailable() ?? false;
      case 'web':
        return this.webAdapter?.isAvailable() ?? false;
      case 'exec':
        return this.execAdapter?.isAvailable() ?? false;
      case 'proof':
        return this.proofAdapter?.isAvailable() ?? false;
      case 'git':
        return this.gitAdapter?.isAvailable() ?? false;
      default:
        return false;
    }
  }

  async refresh(): Promise<void> {
    // Refresh all adapters
    const refreshPromises: Promise<void>[] = [];

    if (this.llmAdapter && 'refresh' in this.llmAdapter) {
      refreshPromises.push((this.llmAdapter as any).refresh());
    }

    if (this.webAdapter && 'refresh' in this.webAdapter) {
      refreshPromises.push((this.webAdapter as any).refresh());
    }

    await Promise.all(refreshPromises);
  }

  /**
   * Update registry configuration and reinitialize
   */
  updateConfig(config: Partial<DefaultRegistryConfig>): void {
    this.config = { ...this.config, ...config };
    this.initializeAdapters();
  }

  /**
   * Set a specific adapter directly
   */
  setLLMAdapter(adapter: LLMAdapter | null): void {
    this.llmAdapter = adapter;
  }

  /**
   * Set a specific adapter directly
   */
  setWebAdapter(adapter: WebAdapter | null): void {
    this.webAdapter = adapter;
  }
}

/**
 * Create a registry with mock adapters for testing
 */
export function createMockRegistry(): DefaultToolRegistry {
  return new DefaultToolRegistry({
    llm: { type: 'mock' },
    web: { type: 'mock' },
    useMockFallback: false,
  });
}

/**
 * Create a registry with real adapters
 */
export function createProductionRegistry(
  config?: Partial<DefaultRegistryConfig>
): DefaultToolRegistry {
  return new DefaultToolRegistry({
    llm: { type: 'litellm' },
    web: { type: 'searxng' },
    useMockFallback: false,
    ...config,
  });
}
