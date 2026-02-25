/**
 * SearXNG Adapter
 *
 * Provides web search capabilities via self-hosted SearXNG.
 * SearXNG is a privacy-focused metasearch engine that aggregates
 * results from 70+ search engines without API keys.
 *
 * Configuration:
 * - SEARXNG_URL: Base URL for SearXNG instance (default: http://localhost:8888)
 */

import type { WebAdapter, SearchResult } from '@keimenon/agent-core';

/**
 * Configuration for SearXNG adapter
 */
export interface SearXNGConfig {
  /** Base URL for SearXNG instance */
  baseUrl?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Default result limit */
  defaultLimit?: number;
  /** Search categories (general, images, news, etc.) */
  categories?: string[];
  /** Search engines to use (or 'all') */
  engines?: string[];
  /** Language preference */
  language?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SearXNGConfig> = {
  baseUrl: process.env.SEARXNG_URL || 'http://localhost:8888',
  timeout: 30000,
  defaultLimit: 10,
  categories: ['general'],
  engines: [], // Empty = use all enabled
  language: 'en',
};

/**
 * SearXNG search response structure
 */
interface SearXNGResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    engine: string;
    score?: number;
    category?: string;
  }>;
  suggestions?: string[];
  corrections?: string[];
  number_of_results?: number;
}

/**
 * SearXNG Adapter Implementation
 *
 * Uses SearXNG's JSON API for web search without requiring API keys.
 * Falls back gracefully when SearXNG is not available.
 */
export class SearXNGAdapter implements WebAdapter {
  private config: Required<SearXNGConfig>;
  private available: boolean = false;

  constructor(config: SearXNGConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Check availability asynchronously
    this.checkAvailability();
  }

  /**
   * Check if SearXNG is available
   */
  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      this.available = response.ok;
    } catch {
      // Try alternative health check endpoint
      try {
        const response = await fetch(`${this.config.baseUrl}/`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        this.available = response.ok;
      } catch {
        this.available = false;
      }
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  getProvider(): string {
    return this.available ? 'searxng' : 'none';
  }

  /**
   * Search the web using SearXNG
   */
  async search(
    query: string,
    options?: { limit?: number }
  ): Promise<SearchResult[]> {
    if (!this.available) {
      return [];
    }

    const limit = options?.limit || this.config.defaultLimit;

    try {
      // Build search URL with parameters
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        language: this.config.language,
      });

      if (this.config.categories.length > 0) {
        params.set('categories', this.config.categories.join(','));
      }

      if (this.config.engines.length > 0) {
        params.set('engines', this.config.engines.join(','));
      }

      const response = await fetch(
        `${this.config.baseUrl}/search?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(this.config.timeout),
        }
      );

      if (!response.ok) {
        console.error(
          `[SearXNGAdapter] Search failed: ${response.status} ${response.statusText}`
        );
        return [];
      }

      const data = (await response.json()) as SearXNGResponse;

      // Map results to our SearchResult format
      return data.results.slice(0, limit).map((result) => ({
        title: result.title || 'Untitled',
        url: result.url,
        snippet: result.content || '',
        source: this.extractDomain(result.url),
        score: result.score,
      }));
    } catch (error) {
      console.error('[SearXNGAdapter] search failed:', error);
      return [];
    }
  }

  /**
   * Fetch a URL and return HTML
   */
  async fetch(url: string): Promise<{ html: string; status: number }> {
    if (!this.available) {
      throw new Error('Web adapter not available');
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Keimenon/1.0; +https://keimenon.com)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(this.config.timeout),
      });

      const html = await response.text();
      return { html, status: response.status };
    } catch (error) {
      console.error('[SearXNGAdapter] fetch failed:', error);
      throw error;
    }
  }

  /**
   * Extract main text content from HTML
   *
   * This is a simple extraction that removes scripts, styles, and HTML tags.
   * For production use, consider using a proper HTML parser like cheerio.
   */
  async extractMainText(html: string): Promise<string> {
    // Remove script and style elements
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalize whitespace
    text = text
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return 'unknown';
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
  updateConfig(config: Partial<SearXNGConfig>): void {
    this.config = { ...this.config, ...config };
    this.checkAvailability();
  }

  /**
   * Get search suggestions for a query
   */
  async getSuggestions(query: string): Promise<string[]> {
    if (!this.available) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
      });

      const response = await fetch(
        `${this.config.baseUrl}/autocomplete?${params.toString()}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) return [];

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
}
