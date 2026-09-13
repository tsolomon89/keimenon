import { ConversationSynthesisInput } from '../conversation-synthesis-input';

export interface ConversationSynthesisResult {
  content: string;
  provider: string;
  model?: string;
  skill_used: string;
  evidence_used: string[];
  proposed_outputs: any[];
}

export interface SynthesisProvider {
  id: string;
  family: 'mock' | 'gemma';
  mode: 'mock' | 'local';
  checkStatus?(): Promise<any>;
  synthesize(
    input: ConversationSynthesisInput,
    skillId: string
  ): Promise<ConversationSynthesisResult>;
}

export class SynthesisProviderRegistry {
  private providers: Map<string, SynthesisProvider> = new Map();
  private defaultProviderId: string = 'gemma-local';

  public registerProvider(provider: SynthesisProvider) {
    this.providers.set(provider.id, provider);
  }

  public setDefaultProvider(providerId: string) {
    this.defaultProviderId = providerId;
  }

  public getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  public getProvider(providerId?: string): SynthesisProvider {
    // 1. Explicit request
    if (providerId) {
      if (this.providers.has(providerId)) {
        return this.providers.get(providerId)!;
      }
      if (providerId === 'gemma-local') {
        throw new Error(
          'PROVIDER_UNAVAILABLE: gemma-local requested but not configured or available'
        );
      }
      if (providerId === 'mock') {
        throw new Error(
          'PROVIDER_UNAVAILABLE: mock synthesis provider is restricted to test environments'
        );
      }
      throw new Error(
        `PROVIDER_NOT_CONFIGURED: Requested provider '${providerId}' is not configured`
      );
    }

    // 2. Provider omitted: use configured default
    if (this.providers.has(this.defaultProviderId)) {
      return this.providers.get(this.defaultProviderId)!;
    }

    // Never fall back silently to mock in production
    throw new Error(
      `PROVIDER_UNAVAILABLE: Default provider '${this.defaultProviderId}' is not available and no fallback permitted`
    );
  }
}

export const providerRegistry = new SynthesisProviderRegistry();

import { gemmaProvider } from './gemma-local-provider';
import { MockSynthesisProvider } from '../conversation-synthesis-adapter';

providerRegistry.registerProvider(gemmaProvider);

// Mock synthesis provider is strictly restricted to automated test runs
if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
  providerRegistry.registerProvider(new MockSynthesisProvider());
}
