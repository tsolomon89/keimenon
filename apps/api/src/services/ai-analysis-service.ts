
import { v4 as uuidv4 } from 'uuid';
import { AiAnalysisResult, SmartClaim, SuggestedConnection } from '@keimenon/types';

// TODO: Replace with actual LLM client (OpenAI/Gemini)
// For now, we mock the analysis to demonstrate the flow.

import { LLMService } from './llm.service';

export class AiAnalysisService {
  private static instance: AiAnalysisService;
  private llmService: LLMService;

  private constructor() {
    this.llmService = LLMService.getInstance();
  }

  public static getInstance(): AiAnalysisService {
    if (!AiAnalysisService.instance) {
      AiAnalysisService.instance = new AiAnalysisService();
    }
    return AiAnalysisService.instance;
  }

  /**
   * Analyze a SourceDoc to extract claims, summary, and tags.
   */
  async analyzeSource(sourceId: string, content: string): Promise<AiAnalysisResult> {
    console.log(`[AiAnalysisService] Analyzing source ${sourceId}...`);

    if (this.llmService.isConfigured()) {
       try {
         return await this.llmService.analyzeSource(sourceId, content);
       } catch (error) {
         console.warn('[AiAnalysisService] LLM analysis failed, falling back to mock.', error);
       }
    }
    
    // Fallback to Mock if not configured or failed
    // MOCK: Simulate LLM latency
    await new Promise(resolve => setTimeout(resolve, 2000));

    // MOCK: deterministically generate claims based on content
    const claims = this.mockExtractClaims(content);
    const summary = this.mockGenerateSummary(content);
    const tags = this.mockGenerateTags(content);
    const connections = this.mockSuggestConnections(sourceId, content);

    return {
      sourceId,
      summary,
      claims,
      suggestedTags: tags,
      connections,
      analyzedAt: Date.now(),
      model: 'mock-gpt-4o', 
    };
  }

  // --- Mock Helpers ---

  private mockExtractClaims(content: string): SmartClaim[] {
    // Naively split sentences and pretend they are claims if they have keywords
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const claims: SmartClaim[] = [];

    sentences.slice(0, 3).forEach((sentence, idx) => {
      claims.push({
        id: uuidv4(),
        text: sentence.trim(),
        confidence: 0.85 + (Math.random() * 0.1),
        sources: [], // In real impl, would link to specific segment IDs
        tags: ['auto-extracted'],
      });
    });

    return claims;
  }

  private mockGenerateSummary(content: string): string {
    return `AI Summary (MOCK): This document discusses ${content.slice(0, 50)}... and contains valuable insights regarding the user's perspective.`;
  }

  private mockGenerateTags(content: string): string[] {
    const keywords = ['react', 'typescript', 'architecture', 'design', 'philosophy'];
    const lower = content.toLowerCase();
    return keywords.filter(k => lower.includes(k));
  }

  private mockSuggestConnections(sourceId: string, content: string): SuggestedConnection[] {
    // Return empty for now, as we don't have access to graph vector store in this isolation
    return [];
  }
}
