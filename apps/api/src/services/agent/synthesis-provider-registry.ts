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
  synthesize(
    input: ConversationSynthesisInput,
    skillId: string
  ): Promise<ConversationSynthesisResult>;
}

export class SynthesisProviderRegistry {
  private providers: Map<string, SynthesisProvider> = new Map();
  private defaultProviderId: string = 'mock';

  public registerProvider(provider: SynthesisProvider) {
    this.providers.set(provider.id, provider);
  }

  public setDefaultProvider(providerId: string) {
    this.defaultProviderId = providerId;
  }

  public getProvider(providerId?: string): SynthesisProvider {
    // 1. Explicit request
    if (providerId) {
      if (this.providers.has(providerId)) {
        return this.providers.get(providerId)!;
      }
      // If explicitly requested but not configured/available
      if (providerId === 'gemma-local') {
        throw new Error(
          'PROVIDER_UNAVAILABLE: gemma-local requested but not configured or available'
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

    // 3. Absolute fallback when omitted and default fails
    if (this.providers.has('mock')) {
      return this.providers.get('mock')!;
    }

    throw new Error('No synthesis providers available.');
  }
}

export const providerRegistry = new SynthesisProviderRegistry();

import { gemmaProvider } from './gemma-local-provider';
providerRegistry.registerProvider(gemmaProvider);
