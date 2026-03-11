import { VerifiedSourceNode, VerifiedClaimNode, TopicNode } from '@keimenon/types';
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from './llm.service';
import { appLogger } from '../utils/logger';

// Interface for Search Results
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  published_date?: string;
  score?: number;
}

// Tavily API response types
interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilySearchResult[];
  query: string;
}

export class VerificationService {
  private static instance: VerificationService;
  private llmService: LLMService;
  private tavilyApiKey: string | null = null;

  private constructor() {
    this.llmService = LLMService.getInstance();
    this.tavilyApiKey = process.env.TAVILY_API_KEY || null;

    if (!this.tavilyApiKey && this.shouldLogOptionalProviderWarnings()) {
      appLogger.warn('verification.config.missing_tavily_key');
    }
  }

  private shouldLogOptionalProviderWarnings(): boolean {
    return process.env.NODE_ENV !== 'test' || process.env.VERBOSE_AI_TOOLING_LOGS === '1';
  }

  /**
   * Check if real search API is configured
   */
  public isSearchConfigured(): boolean {
    return !!this.tavilyApiKey;
  }

  public static getInstance(): VerificationService {
    if (!VerificationService.instance) {
      VerificationService.instance = new VerificationService();
    }
    return VerificationService.instance;
  }

  /**
   * verifyTopic
   * Performs online research to verify claims related to a topic.
   * This corresponds to "Step 5: The agent goes online (verification lane)"
   */
  public async verifyTopic(
    topic: TopicNode
  ): Promise<{ sources: VerifiedSourceNode[]; claims: VerifiedClaimNode[] }> {
    // 1. Formulate queries
    const queries = this.generateQueries(topic);
    appLogger.debug('verification.queries.generated', {
      topic: topic.name,
      queryCount: queries.length,
    });

    // 2. Fetch external sources using Tavily API (with mock fallback)
    const searchResults = await this.search(queries[0]);

    // 3. Create VerifiedSource nodes
    const verifiedSources: VerifiedSourceNode[] = searchResults.map((result) => ({
      id: uuidv4(),
      kind: 'VerifiedSource',
      title: result.title,
      url: result.url,
      publisher: result.source,
      accessed_at: Date.now(),
      created_at: Date.now(),
      updated_at: Date.now(),
      trust_score: 0.8, // Placeholder
      metadata: {
        snippet: result.snippet,
        query: queries[0],
      },
    }));

    // 4. Extract claims using LLM
    const verifiedClaims: VerifiedClaimNode[] = [];

    if (this.llmService.isConfigured()) {
      // Real LLM extraction would go here
      // For now, we'll create one grounded claim per source as a placeholder
      for (const source of verifiedSources) {
        verifiedClaims.push({
          id: uuidv4(),
          kind: 'VerifiedClaim',
          claim_text: `Verified fact extracted from ${source.title}`,
          source_id: source.id,
          confidence: 0.9,
          status: 'verified',
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: {},
        });
      }
    } else {
      appLogger.debug('verification.claim_extraction.skipped', {
        reason: 'LLM not configured',
      });
    }

    return { sources: verifiedSources, claims: verifiedClaims };
  }

  private generateQueries(topic: TopicNode): string[] {
    return [`"is ${topic.name} real"`, `${topic.name} definition`, `${topic.name} analysis`];
  }

  /**
   * Search using Tavily API (real search)
   */
  private async tavilySearch(query: string): Promise<SearchResult[]> {
    if (!this.tavilyApiKey) {
      throw new Error('Tavily API key not configured');
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.tavilyApiKey,
          query: query,
          search_depth: 'basic',
          include_answer: false,
          include_raw_content: false,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        appLogger.warn('verification.tavily.error_response', {
          status: response.status,
          response: errorText,
        });
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = (await response.json()) as TavilyResponse;

      return (data.results || []).map((result: TavilySearchResult) => ({
        title: result.title,
        url: result.url,
        snippet: result.content.substring(0, 500), // Limit snippet length
        source: new URL(result.url).hostname,
        published_date: result.published_date,
        score: result.score,
      }));
    } catch (error: any) {
      appLogger.warn('verification.tavily.search_failed', {
        message: error?.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Search with fallback to mock when API not configured
   */
  private async search(query: string): Promise<SearchResult[]> {
    if (this.tavilyApiKey) {
      try {
        return await this.tavilySearch(query);
      } catch (error) {
        appLogger.debug('verification.search.fallback_to_mock', {
          reason: 'tavily_error',
        });
        return this.mockSearch(query);
      }
    }
    return this.mockSearch(query);
  }

  /**
   * Mock search for development/testing
   */
  private async mockSearch(query: string): Promise<SearchResult[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const cleanQuery = query.replace(/"/g, '');
    return [
      {
        title: `Understanding ${cleanQuery}`,
        url: `https://example.com/wiki/${cleanQuery.replace(/\s+/g, '_')}`,
        snippet: `Comprehensive guide to ${cleanQuery}. This is mock data for development.`,
        source: 'example.com',
        score: 0.9,
      },
      {
        title: `Recent developments in ${cleanQuery}`,
        url: `https://news.example.com/${cleanQuery.replace(/\s+/g, '-')}`,
        snippet: `News and analysis about ${cleanQuery}. This is mock data for development.`,
        source: 'news.example.com',
        score: 0.85,
      },
    ];
  }
}
