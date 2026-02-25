
import OpenAI from 'openai';
import { SmartClaim, SuggestedConnection, AiAnalysisResult } from '@keimenon/types';
import { v4 as uuidv4 } from 'uuid';

export class LLMService {
  private static instance: LLMService;
  private client: OpenAI | null = null;
  private model: string = 'gpt-4-turbo-preview';

  private constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({
        apiKey: apiKey,
      });
    } else {
      console.warn('[LLMService] OPENAI_API_KEY not found. AI features will be disabled or mocked.');
    }
  }

  public static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  public isConfigured(): boolean {
    return !!this.client;
  }

  /**
   * Analyze a source document using OpenAI
   */
  async analyzeSource(sourceId: string, content: string): Promise<AiAnalysisResult> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert analyst. Analyze the provided document text and extract structured insights.
            
            Return a JSON object with the following fields:
            - summary: A concise summary of the document (max 3 sentences).
            - claims: An array of claims found in the text. Each claim should have:
              - text: The claim text.
              - confidence: A number between 0 and 1.
              - tags: An array of relevant tags for this claim.
            - suggestedTags: An array of strings representing high-level topics/tags for the whole document.
            - connections: An array of suggested connections to other concepts (optional, can be empty).
            
            Output valid JSON only.`
          },
          {
            role: 'user',
            content: `Document Content:\n\n${content.substring(0, 10000)}` // Limit content length for safety
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const resultText = completion.choices[0].message.content || '{}';
      const parsed = JSON.parse(resultText);

      // Map to our types
      const claims: SmartClaim[] = (parsed.claims || []).map((c: any) => ({
        id: uuidv4(),
        text: c.text,
        confidence: c.confidence,
        sources: [sourceId],
        tags: c.tags || [],
      }));

      const connections: SuggestedConnection[] = (parsed.connections || []).map((c: any) => ({
        targetNodeId: 'unknown', // Placeholder
        relation: c.relation || 'related_to',
        reasoning: c.reasoning || 'AI suggestion',
        confidence: c.confidence || 0.5,
      }));

      return {
        sourceId,
        summary: parsed.summary || 'No summary available.',
        claims,
        suggestedTags: parsed.suggestedTags || [],
        connections,
        analyzedAt: Date.now(),
        model: this.model,
      };

    } catch (error) {
      console.error('[LLMService] Analysis failed:', error);
      throw error;
    }
  }
}
