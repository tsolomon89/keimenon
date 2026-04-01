import { AiAnalysisResult } from '@keimenon/types';
import { createAgentTask, waitForAgentTask } from './agent-task-service';

interface AnalyzeSourceOutput {
  sourceId: string;
  summary: string;
  claims: Array<{ claim: string; confidence: number }>;
  suggestedTags: string[];
  analyzedAt: number;
  model: string;
}

function isAnalyzeSourceOutput(value: unknown): value is AnalyzeSourceOutput {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AnalyzeSourceOutput>;
  return (
    typeof candidate.sourceId === 'string' &&
    typeof candidate.summary === 'string' &&
    Array.isArray(candidate.claims) &&
    Array.isArray(candidate.suggestedTags) &&
    typeof candidate.analyzedAt === 'number' &&
    typeof candidate.model === 'string'
  );
}

export const aiService = {
  /**
   * Analyze a specific source document
   */
  analyzeSource: async (sourceId: string, content: string): Promise<AiAnalysisResult> => {
    void content; // Task runner reads source content from graph storage.

    const task = await createAgentTask({
      type: 'ANALYZE_SOURCE',
      input: { sourceId },
    });

    const details = await waitForAgentTask(task.id, {
      timeoutMs: 180000,
      pollIntervalMs: 1200,
    });

    if (details.task.status !== 'completed') {
      throw new Error(details.task.error || `Source analysis failed (${details.task.status})`);
    }

    const latestRun = details.runs
      .slice()
      .sort((a, b) => a.attempt - b.attempt)
      .at(-1);
    if (!latestRun || !isAnalyzeSourceOutput(latestRun.output)) {
      throw new Error('Source analysis output missing from completed task');
    }

    const output = latestRun.output;
    return {
      sourceId: output.sourceId,
      summary: output.summary,
      claims: output.claims.map((claim, index) => ({
        id: `${output.sourceId}:${index}`,
        text: claim.claim,
        confidence: claim.confidence,
        sources: [output.sourceId],
        tags: output.suggestedTags.slice(0, 5),
      })),
      suggestedTags: output.suggestedTags,
      connections: [],
      analyzedAt: output.analyzedAt,
      model: output.model,
    };
  },
};
