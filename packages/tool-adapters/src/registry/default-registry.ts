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
} from '@keimenon/agent-core';

import { LiteLLMAdapter, type LiteLLMConfig } from '../llm/litellm-adapter.js';
import { SearXNGAdapter, type SearXNGConfig } from '../web/searxng-adapter.js';
import { MockLLMAdapter, type MockLLMConfig } from '../mocks/mock-llm-adapter.js';
import { MockWebAdapter, type MockWebConfig } from '../mocks/mock-web-adapter.js';
import { LocalExecAdapter, type LocalExecConfig } from '../exec/local-exec-adapter.js';
import { LocalProofAdapter, type LocalProofConfig } from '../proof/local-proof-adapter.js';
import { LocalGitAdapter, type LocalGitConfig } from '../git/local-git-adapter.js';

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
  /** Exec adapter configuration */
  exec?: {
    type: 'local' | 'none';
    config?: LocalExecConfig;
  };
  /** Proof adapter configuration */
  proof?: {
    type: 'local' | 'none';
    config?: LocalProofConfig;
  };
  /** Git adapter configuration */
  git?: {
    type: 'local' | 'none';
    config?: LocalGitConfig;
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
  exec: { type: 'local' },
  proof: { type: 'local' },
  git: { type: 'local' },
  useMockFallback: process.env.NODE_ENV === 'test',
};

type AvailabilityReason = {
  getUnavailableReason?: () => string | undefined;
};

function readUnavailableReason(adapter: unknown, fallback: string): string {
  if (adapter && typeof adapter === 'object') {
    const reason = (adapter as AvailabilityReason).getUnavailableReason?.();
    if (reason && reason.length > 0) {
      return reason;
    }
  }
  return fallback;
}

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
        this.llmAdapter = new LiteLLMAdapter(this.config.llm.config as LiteLLMConfig);
        break;
      case 'mock':
        this.llmAdapter = new MockLLMAdapter(this.config.llm.config as MockLLMConfig);
        break;
      case 'none':
      default:
        this.llmAdapter = null;
    }

    // Initialize Web adapter
    switch (this.config.web?.type) {
      case 'searxng':
        this.webAdapter = new SearXNGAdapter(this.config.web.config as SearXNGConfig);
        break;
      case 'mock':
        this.webAdapter = new MockWebAdapter(this.config.web.config as MockWebConfig);
        break;
      case 'none':
      default:
        this.webAdapter = null;
    }

    // Exec, Proof, Git adapters not yet implemented
    switch (this.config.exec?.type) {
      case 'local':
        this.execAdapter = new LocalExecAdapter(this.config.exec.config as LocalExecConfig);
        break;
      case 'none':
      default:
        this.execAdapter = null;
    }

    switch (this.config.proof?.type) {
      case 'local':
        this.proofAdapter = new LocalProofAdapter(this.config.proof.config as LocalProofConfig);
        break;
      case 'none':
      default:
        this.proofAdapter = null;
    }

    switch (this.config.git?.type) {
      case 'local':
        this.gitAdapter = new LocalGitAdapter(this.config.git.config as LocalGitConfig);
        break;
      case 'none':
      default:
        this.gitAdapter = null;
    }
  }

  getLLMAdapter(): LLMAdapter | null {
    // If primary adapter unavailable and fallback enabled, use mock
    if (this.llmAdapter && !this.llmAdapter.isAvailable() && this.config.useMockFallback) {
      return new MockLLMAdapter();
    }
    return this.llmAdapter;
  }

  getWebAdapter(): WebAdapter | null {
    // If primary adapter unavailable and fallback enabled, use mock
    if (this.webAdapter && !this.webAdapter.isAvailable() && this.config.useMockFallback) {
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
        ...(this.llmAdapter && !this.llmAdapter.isAvailable()
          ? { error: readUnavailableReason(this.llmAdapter, 'LLM adapter unavailable') }
          : {}),
      },
      {
        name: 'web',
        available: this.webAdapter?.isAvailable() ?? false,
        provider: this.webAdapter?.getProvider(),
        ...(this.webAdapter && !this.webAdapter.isAvailable()
          ? { error: readUnavailableReason(this.webAdapter, 'Web adapter unavailable') }
          : {}),
      },
      {
        name: 'exec',
        available: this.execAdapter?.isAvailable() ?? false,
        provider:
          this.execAdapter && 'getProvider' in this.execAdapter
            ? (this.execAdapter as any).getProvider?.()
            : undefined,
        ...(this.execAdapter
          ? this.execAdapter.isAvailable()
            ? {}
            : {
                error: readUnavailableReason(this.execAdapter, 'Exec adapter unavailable'),
              }
          : { error: 'Exec adapter disabled' }),
      },
      {
        name: 'proof',
        available: this.proofAdapter?.isAvailable() ?? false,
        provider:
          this.proofAdapter && 'getProvider' in this.proofAdapter
            ? (this.proofAdapter as any).getProvider?.()
            : undefined,
        ...(this.proofAdapter
          ? this.proofAdapter.isAvailable()
            ? {}
            : {
                error: readUnavailableReason(this.proofAdapter, 'Proof adapter unavailable'),
              }
          : { error: 'Proof adapter disabled' }),
      },
      {
        name: 'git',
        available: this.gitAdapter?.isAvailable() ?? false,
        provider:
          this.gitAdapter && 'getProvider' in this.gitAdapter
            ? (this.gitAdapter as any).getProvider?.()
            : undefined,
        ...(this.gitAdapter
          ? this.gitAdapter.isAvailable()
            ? {}
            : {
                error: readUnavailableReason(this.gitAdapter, 'Git adapter unavailable'),
              }
          : { error: 'Git adapter disabled' }),
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

    if (this.execAdapter && 'refresh' in this.execAdapter) {
      refreshPromises.push((this.execAdapter as any).refresh());
    }

    if (this.proofAdapter && 'refresh' in this.proofAdapter) {
      refreshPromises.push((this.proofAdapter as any).refresh());
    }

    if (this.gitAdapter && 'refresh' in this.gitAdapter) {
      refreshPromises.push((this.gitAdapter as any).refresh());
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
    exec: { type: 'none' },
    proof: { type: 'none' },
    git: { type: 'none' },
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
    exec: { type: 'local' },
    proof: { type: 'local' },
    git: { type: 'local' },
    useMockFallback: false,
    ...config,
  });
}
