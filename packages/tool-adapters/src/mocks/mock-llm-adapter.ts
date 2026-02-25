/**
 * Mock LLM Adapter
 *
 * Provides deterministic LLM responses for testing.
 * No actual API calls are made.
 */

import type {
  LLMAdapter,
  ChatMessage,
  ChatOptions,
  ExtractedTopic,
} from '@keimenon/agent-core';

/**
 * Mock response configuration
 */
export interface MockLLMConfig {
  /** Simulated latency in ms */
  latency?: number;
  /** Whether to simulate availability */
  available?: boolean;
  /** Fixed topics to return from extractTopics */
  fixedTopics?: ExtractedTopic[];
  /** Fixed summary to return */
  fixedSummary?: string;
  /** Fixed chat response */
  fixedChatResponse?: string;
}

/**
 * Mock LLM Adapter Implementation
 *
 * Returns predictable responses for testing and development.
 */
export class MockLLMAdapter implements LLMAdapter {
  private config: MockLLMConfig;

  constructor(config: MockLLMConfig = {}) {
    this.config = {
      latency: 0,
      available: true,
      fixedTopics: [
        { name: 'Machine Learning', keywords: ['ml', 'ai', 'neural'], confidence: 0.9 },
        { name: 'Software Development', keywords: ['code', 'programming'], confidence: 0.85 },
      ],
      fixedSummary: 'This is a mock summary of the provided content.',
      fixedChatResponse: 'This is a mock chat response.',
      ...config,
    };
  }

  private async simulateLatency(): Promise<void> {
    if (this.config.latency && this.config.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latency));
    }
  }

  isAvailable(): boolean {
    return this.config.available ?? true;
  }

  getProvider(): string {
    return 'mock';
  }

  async extractTopics(text: string): Promise<ExtractedTopic[]> {
    await this.simulateLatency();

    if (!this.isAvailable()) {
      return [];
    }

    // Return fixed topics, but filter based on text content
    const topics = this.config.fixedTopics || [];

    // Simple keyword matching for more realistic behavior
    return topics.filter((topic) =>
      topic.keywords.some((kw: string) => text.toLowerCase().includes(kw.toLowerCase()))
    );
  }

  async summarize(chunks: string[], options?: { maxLength?: number }): Promise<string> {
    await this.simulateLatency();

    if (!this.isAvailable()) {
      throw new Error('LLM not available');
    }

    const maxLength = options?.maxLength || 100;
    const summary = this.config.fixedSummary || '';

    // Truncate to maxLength words
    const words = summary.split(' ');
    return words.slice(0, maxLength).join(' ');
  }

  async classifyDupes(
    pairs: Array<[string, string]>
  ): Promise<Array<{ similarity: number; isDuplicate: boolean }>> {
    await this.simulateLatency();

    if (!this.isAvailable()) {
      return [];
    }

    // Simple mock: calculate similarity based on common words
    return pairs.map(([a, b]) => {
      const wordsA = new Set(a.toLowerCase().split(/\s+/));
      const wordsB = new Set(b.toLowerCase().split(/\s+/));
      const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
      const union = new Set([...wordsA, ...wordsB]);
      const similarity = union.size > 0 ? intersection.size / union.size : 0;

      return {
        similarity,
        isDuplicate: similarity > 0.7,
      };
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    await this.simulateLatency();

    if (!this.isAvailable()) {
      throw new Error('LLM not available');
    }

    // Return fixed response or echo last user message
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    return this.config.fixedChatResponse || `Echo: ${lastUserMessage?.content || ''}`;
  }

  async extractClaims(
    text: string,
    context?: string
  ): Promise<Array<{ claim: string; confidence: number }>> {
    await this.simulateLatency();

    if (!this.isAvailable()) {
      return [];
    }

    // Extract sentences as mock claims
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 5).map((sentence) => ({
      claim: sentence.trim(),
      confidence: 0.7 + Math.random() * 0.3,
    }));
  }

  /**
   * Configure mock behavior
   */
  setConfig(config: Partial<MockLLMConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
