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
    if (providerId && this.providers.has(providerId)) {
      return this.providers.get(providerId)!;
    }

    // 2. Default configured in app
    if (this.providers.has(this.defaultProviderId)) {
      return this.providers.get(this.defaultProviderId)!;
    }

    // 3. Absolute fallback
    if (this.providers.has('mock')) {
      return this.providers.get('mock')!;
    }

    throw new Error('No synthesis providers available.');
  }
}

export const providerRegistry = new SynthesisProviderRegistry();

import { gemmaProvider } from './gemma-local-provider';
providerRegistry.registerProvider(gemmaProvider);
