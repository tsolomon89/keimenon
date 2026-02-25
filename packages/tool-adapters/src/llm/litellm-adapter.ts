/**
 * LiteLLM Adapter
 *
 * Provides unified LLM access via LiteLLM proxy.
 * Supports 100+ providers through OpenAI-compatible API.
 *
 * Configuration:
 * - LITELLM_URL: Base URL for LiteLLM proxy (default: http://localhost:4000)
 * - LITELLM_API_KEY: API key for the proxy
 * - DEFAULT_MODEL: Default model to use (default: gpt-4)
 */

import OpenAI from 'openai';
import type {
  LLMAdapter,
  ChatMessage,
  ChatOptions,
  ExtractedTopic,
} from '@keimenon/agent-core';

/**
 * Configuration for LiteLLM adapter
 */
export interface LiteLLMConfig {
  /** Base URL for LiteLLM proxy */
  baseUrl?: string;
  /** API key for the proxy */
  apiKey?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Max retries for failed requests */
  maxRetries?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<LiteLLMConfig> = {
  baseUrl: process.env.LITELLM_URL || 'http://localhost:4000',
  apiKey: process.env.LITELLM_API_KEY || 'sk-dummy',
  defaultModel: process.env.DEFAULT_MODEL || 'gpt-4',
  timeout: 60000,
  maxRetries: 2,
};

/**
 * LiteLLM Adapter Implementation
 *
 * Uses OpenAI SDK pointed at LiteLLM proxy for unified access
 * to multiple LLM providers (OpenAI, Anthropic, Ollama, etc.)
 */
export class LiteLLMAdapter implements LLMAdapter {
  private client: OpenAI;
  private config: Required<LiteLLMConfig>;
  private available: boolean = false;

  constructor(config: LiteLLMConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });

    // Check availability asynchronously
    this.checkAvailability();
  }

  /**
   * Check if the LiteLLM proxy is available
   */
  private async checkAvailability(): Promise<void> {
    try {
      // Try a simple health check or list models
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      this.available = response.ok;
    } catch {
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  getProvider(): string {
    return this.available ? 'litellm' : 'none';
  }

  /**
   * Extract topics from text using LLM
   */
  async extractTopics(text: string): Promise<ExtractedTopic[]> {
    if (!this.available) {
      return [];
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.defaultModel,
        messages: [
          {
            role: 'system',
            content: `You are a topic extraction assistant. Extract the main topics from the given text.
Return a JSON array of topics with this structure:
[{"name": "topic name", "keywords": ["keyword1", "keyword2"], "confidence": 0.9}]
Only return valid JSON, no other text.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      try {
        const parsed = JSON.parse(content);
        const topics = Array.isArray(parsed) ? parsed : parsed.topics || [];
        return topics.map((t: any) => ({
          name: t.name || 'Unknown',
          keywords: Array.isArray(t.keywords) ? t.keywords : [],
          confidence: typeof t.confidence === 'number' ? t.confidence : 0.5,
        }));
      } catch {
        return [];
      }
    } catch (error) {
      console.error('[LiteLLMAdapter] extractTopics failed:', error);
      return [];
    }
  }

  /**
   * Summarize multiple text chunks
   */
  async summarize(
    chunks: string[],
    options?: { maxLength?: number }
  ): Promise<string> {
    if (!this.available) {
      throw new Error('LLM not available');
    }

    const combinedText = chunks.join('\n\n---\n\n');
    const maxLength = options?.maxLength || 500;

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.defaultModel,
        messages: [
          {
            role: 'system',
            content: `You are a summarization assistant. Create a concise summary of the provided content.
The summary should be no more than ${maxLength} words.
Focus on the key points and main ideas.`,
          },
          {
            role: 'user',
            content: combinedText,
          },
        ],
        temperature: 0.5,
        max_tokens: Math.min(maxLength * 2, 2000),
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('[LiteLLMAdapter] summarize failed:', error);
      throw error;
    }
  }

  /**
   * Classify duplicate pairs
   */
  async classifyDupes(
    pairs: Array<[string, string]>
  ): Promise<Array<{ similarity: number; isDuplicate: boolean }>> {
    if (!this.available) {
      return [];
    }

    try {
      const pairsJson = JSON.stringify(
        pairs.map(([a, b], i) => ({ id: i, text_a: a, text_b: b }))
      );

      const response = await this.client.chat.completions.create({
        model: this.config.defaultModel,
        messages: [
          {
            role: 'system',
            content: `You are a duplicate detection assistant. Analyze pairs of text and determine if they are duplicates or near-duplicates.
Return a JSON array with this structure:
[{"id": 0, "similarity": 0.95, "isDuplicate": true}]
- similarity: 0.0 to 1.0 (how similar the texts are)
- isDuplicate: true if similarity > 0.8 or if they convey the same information
Only return valid JSON, no other text.`,
          },
          {
            role: 'user',
            content: pairsJson,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return pairs.map(() => ({ similarity: 0, isDuplicate: false }));

      try {
        const parsed = JSON.parse(content);
        const results = Array.isArray(parsed) ? parsed : parsed.results || [];
        return pairs.map((_, i) => {
          const result = results.find((r: any) => r.id === i);
          return {
            similarity: result?.similarity ?? 0,
            isDuplicate: result?.isDuplicate ?? false,
          };
        });
      } catch {
        return pairs.map(() => ({ similarity: 0, isDuplicate: false }));
      }
    } catch (error) {
      console.error('[LiteLLMAdapter] classifyDupes failed:', error);
      return pairs.map(() => ({ similarity: 0, isDuplicate: false }));
    }
  }

  /**
   * General chat completion
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    if (!this.available) {
      throw new Error('LLM not available');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.config.defaultModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 2000,
        stop: options?.stop,
        response_format: options?.response_format,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('[LiteLLMAdapter] chat failed:', error);
      throw error;
    }
  }

  /**
   * Extract claims from text
   */
  async extractClaims(
    text: string,
    context?: string
  ): Promise<Array<{ claim: string; confidence: number }>> {
    if (!this.available) {
      return [];
    }

    try {
      const contextPrompt = context ? `Context: ${context}\n\n` : '';

      const response = await this.client.chat.completions.create({
        model: this.config.defaultModel,
        messages: [
          {
            role: 'system',
            content: `You are a claim extraction assistant. Extract factual claims from the given text.
Return a JSON array with this structure:
[{"claim": "The specific claim", "confidence": 0.9}]
- claim: A single, verifiable factual statement
- confidence: 0.0 to 1.0 (how confident you are that this is a factual claim)
Only extract claims that could potentially be verified. Skip opinions and subjective statements.
Only return valid JSON, no other text.`,
          },
          {
            role: 'user',
            content: `${contextPrompt}Text to analyze:\n${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      try {
        const parsed = JSON.parse(content);
        const claims = Array.isArray(parsed) ? parsed : parsed.claims || [];
        return claims.map((c: any) => ({
          claim: c.claim || '',
          confidence: typeof c.confidence === 'number' ? c.confidence : 0.5,
        }));
      } catch {
        return [];
      }
    } catch (error) {
      console.error('[LiteLLMAdapter] extractClaims failed:', error);
      return [];
    }
  }

  /**
   * Refresh the adapter (re-check availability)
   */
  async refresh(): Promise<void> {
    await this.checkAvailability();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LiteLLMConfig>): void {
    this.config = { ...this.config, ...config };
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });
    this.checkAvailability();
  }
}
