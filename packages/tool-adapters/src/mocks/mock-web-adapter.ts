/**
 * Mock Web Adapter
 *
 * Provides deterministic web search responses for testing.
 * No actual web requests are made.
 */

import type { WebAdapter, SearchResult } from '@keimenon/agent-core';

/**
 * Mock response configuration
 */
export interface MockWebConfig {
  /** Simulated latency in ms */
  latency?: number;
  /** Whether to simulate availability */
  available?: boolean;
  /** Fixed search results to return */
  fixedResults?: SearchResult[];
  /** Fixed HTML to return from fetch */
  fixedHtml?: string;
}

/**
 * Default mock search results
 */
const DEFAULT_MOCK_RESULTS: SearchResult[] = [
  {
    title: 'Wikipedia - Machine Learning',
    url: 'https://en.wikipedia.org/wiki/Machine_learning',
    snippet:
      'Machine learning is a branch of artificial intelligence that focuses on building systems that learn from data.',
    source: 'wikipedia.org',
    score: 0.95,
  },
  {
    title: 'MIT Technology Review - AI',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/',
    snippet:
      'Coverage of artificial intelligence research and its applications in business, science, and society.',
    source: 'technologyreview.com',
    score: 0.88,
  },
  {
    title: 'arXiv - Recent Papers',
    url: 'https://arxiv.org/list/cs.AI/recent',
    snippet:
      'Recent submissions in artificial intelligence research from the scientific community.',
    source: 'arxiv.org',
    score: 0.82,
  },
];

/**
 * Default mock HTML
 */
const DEFAULT_MOCK_HTML = `<!DOCTYPE html>
<html>
<head><title>Mock Page</title></head>
<body>
  <h1>Mock Web Page</h1>
  <p>This is mock content for testing purposes.</p>
  <p>Machine learning is transforming industries worldwide.</p>
</body>
</html>`;

/**
 * Mock Web Adapter Implementation
 *
 * Returns predictable responses for testing and development.
 */
export class MockWebAdapter implements WebAdapter {
  private config: MockWebConfig;

  constructor(config: MockWebConfig = {}) {
    this.config = {
      latency: 0,
      available: true,
      fixedResults: DEFAULT_MOCK_RESULTS,
      fixedHtml: DEFAULT_MOCK_HTML,
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

  async search(
    query: string,
    options?: { limit?: number }
  ): Promise<SearchResult[]> {
    await this.simulateLatency();

    if (!this.isAvailable()) {
      return [];
    }

    const limit = options?.limit || 10;
    const results = this.config.fixedResults || DEFAULT_MOCK_RESULTS;

    // Filter results based on query keywords
    const queryWords = query.toLowerCase().split(/\s+/);
    const filteredResults = results.filter((result) => {
      const text = `${result.title} ${result.snippet}`.toLowerCase();
      return queryWords.some((word) => text.includes(word));
    });

    // Return filtered results or all results if no matches
    const finalResults =
      filteredResults.length > 0 ? filteredResults : results;

    return finalResults.slice(0, limit);
  }

  async fetch(url: string): Promise<{ html: string; status: number }> {
    await this.simulateLatency();

    if (!this.isAvailable()) {
      throw new Error('Web adapter not available');
    }

    // Return fixed HTML with URL-based customization
    const customHtml = this.config.fixedHtml || DEFAULT_MOCK_HTML;
    const html = customHtml.replace('Mock Web Page', `Content from ${url}`);

    return { html, status: 200 };
  }

  async extractMainText(html: string): Promise<string> {
    // Simple extraction for mock
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  }

  /**
   * Configure mock behavior
   */
  setConfig(config: Partial<MockWebConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add a search result to the mock data
   */
  addResult(result: SearchResult): void {
    if (!this.config.fixedResults) {
      this.config.fixedResults = [...DEFAULT_MOCK_RESULTS];
    }
    this.config.fixedResults.push(result);
  }

  /**
   * Clear all mock results
   */
  clearResults(): void {
    this.config.fixedResults = [];
  }
}
