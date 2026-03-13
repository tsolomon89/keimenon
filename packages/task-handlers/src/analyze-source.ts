/**
 * ANALYZE_SOURCE Task Handler
 *
 * LLM-backed analysis for a single source document.
 * Produces structured analysis output and stores it as a JSON artifact.
 */

import type {
  AnalyzeSourceInput,
  AnalyzeSourceOutput,
  TaskContext,
  TaskHandler,
  TaskResult,
  TaskStep,
  ToolRegistry,
} from '@keimenon/agent-core';

type ArtifactRef = {
  hash: string;
  type: 'analysis_json';
  path: string;
  metadata: Record<string, unknown>;
};

export class AnalyzeSourceHandler implements TaskHandler<AnalyzeSourceInput, AnalyzeSourceOutput> {
  readonly type = 'ANALYZE_SOURCE' as const;
  readonly name = 'Source Analyzer';
  readonly description = 'Analyze a source with LLM and emit structured claims + summary';

  validate(input: AnalyzeSourceInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!input?.sourceId || typeof input.sourceId !== 'string') {
      errors.push('sourceId is required');
    }
    if (
      input.maxClaims !== undefined &&
      (!Number.isFinite(input.maxClaims) || input.maxClaims < 1)
    ) {
      errors.push('maxClaims must be a positive number when provided');
    }
    if (
      input.maxSummaryWords !== undefined &&
      (!Number.isFinite(input.maxSummaryWords) || input.maxSummaryWords < 20)
    ) {
      errors.push('maxSummaryWords must be >= 20 when provided');
    }
    return { valid: errors.length === 0, errors };
  }

  async plan(
    _input: AnalyzeSourceInput,
    _ctx: TaskContext<AnalyzeSourceInput>
  ): Promise<TaskStep[]> {
    return [
      {
        id: 'load_source',
        name: 'Load Source',
        description: 'Load source content from graph storage',
        estimated_ms: 200,
      },
      {
        id: 'run_llm',
        name: 'Run LLM Analysis',
        description: 'Generate summary, claims, and topic tags',
        estimated_ms: 4000,
      },
      {
        id: 'persist_result',
        name: 'Persist Result',
        description: 'Store analysis output artifact',
        estimated_ms: 200,
      },
    ];
  }

  canExecute(tools: ToolRegistry): { can: boolean; reason?: string } {
    const llm = tools.getLLMAdapter();
    if (!llm || !llm.isAvailable()) {
      return { can: false, reason: 'LLM adapter unavailable' };
    }
    return { can: true };
  }

  async run(
    input: AnalyzeSourceInput,
    ctx: TaskContext<AnalyzeSourceInput>
  ): Promise<TaskResult<AnalyzeSourceOutput>> {
    const { graph, tools, task, events, signal, storage } = ctx;

    try {
      this.emitProgress(events, task.id, 10, 'Loading source content...');
      if (signal.aborted) {
        throw new Error('Task cancelled');
      }

      const source = await graph.getSource(input.sourceId, task.account_id);
      if (!source) {
        return { success: false, error: 'Source not found', artifacts: [] };
      }

      const llm = tools.getLLMAdapter();
      if (!llm || !llm.isAvailable()) {
        return { success: false, error: 'LLM adapter unavailable', artifacts: [] };
      }

      this.emitProgress(events, task.id, 35, 'Generating summary...');
      const summary = await llm.summarize([source.content], {
        maxLength: Math.max(60, input.maxSummaryWords ?? 220),
      });

      if (signal.aborted) {
        throw new Error('Task cancelled');
      }

      this.emitProgress(events, task.id, 60, 'Extracting claims...');
      const extractedClaims = await llm.extractClaims(
        source.content,
        typeof source.node.title === 'string' ? source.node.title : source.node.id
      );
      const claims = extractedClaims.slice(0, Math.max(1, input.maxClaims ?? 8));

      this.emitProgress(events, task.id, 80, 'Extracting topic tags...');
      const extractedTopics = await llm.extractTopics(source.content.slice(0, 15000));
      const suggestedTags = extractedTopics
        .sort((a, b) => b.confidence - a.confidence)
        .map((topic) => topic.name.trim())
        .filter((name) => name.length > 0)
        .slice(0, 10);

      const output: AnalyzeSourceOutput = {
        sourceId: input.sourceId,
        summary,
        claims,
        suggestedTags,
        analyzedAt: Date.now(),
        model: llm.getProvider(),
      };

      this.emitProgress(events, task.id, 90, 'Persisting analysis artifact...');
      const artifact = await storage.putJson(output, `analysis-${task.id}.json`);

      const artifacts: ArtifactRef[] = [
        {
          hash: artifact.hash,
          type: 'analysis_json',
          path: artifact.path,
          metadata: {
            task_type: this.type,
            source_id: input.sourceId,
            content_type: 'application/json',
          },
        },
      ];

      this.emitProgress(events, task.id, 100, 'Source analysis complete');

      return {
        success: true,
        output,
        artifacts,
        metrics: {
          duration_ms: 0,
          claims_extracted: claims.length,
          tags_suggested: suggestedTags.length,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Analyze source failed',
        artifacts: [],
      };
    }
  }

  private emitProgress(
    events: TaskContext['events'],
    taskId: string,
    percent: number,
    message: string
  ): void {
    events.emit({
      type: 'task:progress',
      taskId,
      percent,
      message,
      timestamp: Date.now(),
    });
  }
}
