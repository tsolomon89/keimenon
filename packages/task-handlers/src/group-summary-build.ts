/**
 * GROUP_SUMMARY_BUILD Task Handler
 *
 * Creates a canonical markdown document from group sources.
 * Key principle: NEVER edits existing sources - creates NEW CanonicalDoc nodes.
 *
 * Workflow:
 * 1. Fetch sources from the specified group
 * 2. Apply selection policy (all, top_n, keyword_filter)
 * 3. Use LLM to generate summary
 * 4. Store as CanonicalDoc node with DERIVED_FROM edges
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  TaskHandler,
  TaskContext,
  TaskResult,
  TaskStep,
  GroupSummaryInput,
  GroupSummaryOutput,
  ToolRegistry,
  createEvent,
} from '@keimenon/agent-core';

/**
 * CanonicalDoc node structure
 */
interface CanonicalDocNode {
  id: string;
  kind: 'CanonicalDoc';
  account_id: string;
  title: string;
  content: string;
  content_hash: string;
  source_count: number;
  token_count: number;
  created_at: number;
  updated_at: number;
  metadata: {
    group_id: string;
    agent_id: string;
    task_id: string;
    selection_policy: string;
    model_used?: string;
  };
}

/**
 * GROUP_SUMMARY_BUILD Handler
 *
 * Generates canonical summaries from group sources without modifying originals.
 */
export class GroupSummaryBuildHandler
  implements TaskHandler<GroupSummaryInput, GroupSummaryOutput>
{
  readonly type = 'GROUP_SUMMARY_BUILD' as const;
  readonly name = 'Group Summary Builder';
  readonly description = 'Generate a canonical summary document from group sources';

  /**
   * Validate task input
   */
  validate(input: GroupSummaryInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!input.groupId) {
      errors.push('groupId is required');
    }

    if (!['all', 'top_n', 'keyword_filter'].includes(input.selectionPolicy)) {
      errors.push('selectionPolicy must be one of: all, top_n, keyword_filter');
    }

    if (input.selectionPolicy === 'top_n' && (!input.maxSources || input.maxSources < 1)) {
      errors.push('maxSources is required for top_n selection policy');
    }

    if (input.selectionPolicy === 'keyword_filter' && (!input.filterKeywords || input.filterKeywords.length === 0)) {
      errors.push('filterKeywords is required for keyword_filter selection policy');
    }

    if (!input.maxTokens || input.maxTokens < 100) {
      errors.push('maxTokens must be at least 100');
    }

    if (!input.modelPolicy) {
      errors.push('modelPolicy is required');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Plan execution steps
   */
  async plan(
    input: GroupSummaryInput,
    ctx: TaskContext<GroupSummaryInput>
  ): Promise<TaskStep[]> {
    return [
      {
        id: 'fetch_sources',
        name: 'Fetch Sources',
        description: `Fetch sources from group ${input.groupId}`,
        estimated_ms: 1000,
      },
      {
        id: 'apply_selection',
        name: 'Apply Selection Policy',
        description: `Apply ${input.selectionPolicy} selection policy`,
        estimated_ms: 500,
      },
      {
        id: 'generate_summary',
        name: 'Generate Summary',
        description: 'Generate summary using LLM',
        estimated_ms: 10000,
      },
      {
        id: 'create_canonical_doc',
        name: 'Create Canonical Document',
        description: 'Store summary as CanonicalDoc node',
        estimated_ms: 500,
      },
      {
        id: 'create_edges',
        name: 'Create Derivation Edges',
        description: 'Link CanonicalDoc to source nodes',
        estimated_ms: 500,
      },
    ];
  }

  /**
   * Check if handler can execute
   */
  canExecute(tools: ToolRegistry): { can: boolean; reason?: string } {
    const llm = tools.getLLMAdapter();
    if (!llm || !llm.isAvailable()) {
      return { can: false, reason: 'LLM adapter not available' };
    }
    return { can: true };
  }

  /**
   * Execute the task
   */
  async run(
    input: GroupSummaryInput,
    ctx: TaskContext<GroupSummaryInput>
  ): Promise<TaskResult<GroupSummaryOutput>> {
    const { graph, storage, tools, events, signal, task, run } = ctx;
    const artifacts: string[] = [];

    try {
      // Step 1: Fetch sources from group
      this.emitProgress(events, task.id, 10, 'Fetching sources from group...');

      if (signal.aborted) throw new Error('Task cancelled');

      const sources = await graph.listSources(
        input.groupId,
        task.account_id,
        { limit: 1000 }
      );

      if (sources.length === 0) {
        return {
          success: false,
          error: 'No sources found in group',
          artifacts: [],
        };
      }

      // Step 2: Apply selection policy
      this.emitProgress(events, task.id, 20, 'Applying selection policy...');

      const selectedSources = await this.applySelectionPolicy(
        sources,
        input,
        graph,
        task.account_id
      );

      if (selectedSources.length === 0) {
        return {
          success: false,
          error: 'No sources matched selection criteria',
          artifacts: [],
        };
      }

      // Step 3: Fetch content for selected sources
      this.emitProgress(events, task.id, 30, 'Loading source content...');

      if (signal.aborted) throw new Error('Task cancelled');

      const sourceContents = await graph.getSources(
        selectedSources.map((s) => s.id),
        task.account_id
      );

      const chunks = sourceContents.map((sc) => sc.content);

      // Step 4: Generate summary using LLM
      this.emitProgress(events, task.id, 50, 'Generating summary with LLM...');

      if (signal.aborted) throw new Error('Task cancelled');

      const llm = tools.getLLMAdapter();
      if (!llm || !llm.isAvailable()) {
        return {
          success: false,
          error: 'LLM adapter not available',
          artifacts: [],
        };
      }

      const summary = await llm.summarize(chunks, {
        maxLength: Math.floor(input.maxTokens * 0.75), // Leave room for formatting
      });

      // Step 5: Store summary as artifact
      this.emitProgress(events, task.id, 70, 'Storing summary artifact...');

      const artifactResult = await storage.put(summary);
      artifacts.push(artifactResult.hash);

      // Step 6: Create CanonicalDoc node
      this.emitProgress(events, task.id, 80, 'Creating canonical document...');

      if (signal.aborted) throw new Error('Task cancelled');

      const canonicalDocId = uuidv4();
      const now = Date.now();

      const canonicalDoc: CanonicalDocNode = {
        id: canonicalDocId,
        kind: 'CanonicalDoc',
        account_id: task.account_id,
        title: `Summary of Group ${input.groupId}`,
        content: summary,
        content_hash: artifactResult.hash,
        source_count: selectedSources.length,
        token_count: this.estimateTokenCount(summary),
        created_at: now,
        updated_at: now,
        metadata: {
          group_id: input.groupId,
          agent_id: task.agent_id,
          task_id: task.id,
          selection_policy: input.selectionPolicy,
          model_used: input.modelPolicy,
        },
      };

      await graph.createNode(canonicalDoc as any);

      // Step 7: Create DERIVED_FROM edges
      this.emitProgress(events, task.id, 90, 'Creating derivation edges...');

      const edges = selectedSources.map((source) => ({
        source_id: canonicalDocId,
        target_id: source.id,
        kind: 'DERIVED_FROM' as const,
        metadata: {
          task_id: task.id,
          run_id: run.id,
          account_id: task.account_id,
          created_by: task.agent_id,
        },
      }));

      await graph.createEdges(edges);

      // Step 8: Create CONTAINS edge from group to canonical doc
      await graph.createEdge({
        source_id: input.groupId,
        target_id: canonicalDocId,
        kind: 'CONTAINS',
        metadata: {
          type: 'canonical_doc',
          account_id: task.account_id,
          created_by: task.agent_id,
        },
      });

      this.emitProgress(events, task.id, 100, 'Summary complete!');

      return {
        success: true,
        output: {
          canonicalDocId,
          sourcesUsed: selectedSources.map((s) => s.id),
          tokenCount: canonicalDoc.token_count,
        },
        artifacts,
        metrics: {
          duration_ms: Date.now() - run.started_at,
          tokens_used: canonicalDoc.token_count,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        artifacts,
      };
    }
  }

  /**
   * Apply selection policy to filter sources
   */
  private async applySelectionPolicy(
    sources: any[],
    input: GroupSummaryInput,
    graph: any,
    accountId: string
  ): Promise<any[]> {
    switch (input.selectionPolicy) {
      case 'all':
        return sources;

      case 'top_n':
        // Sort by created_at desc and take top N
        return sources
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
          .slice(0, input.maxSources || 10);

      case 'keyword_filter':
        // Filter sources containing any of the keywords
        const keywords = input.filterKeywords || [];
        const filtered: any[] = [];

        for (const source of sources) {
          const sourceData = await graph.getSource(source.id, accountId);
          if (sourceData) {
            const content = sourceData.content.toLowerCase();
            if (keywords.some((kw: string) => content.includes(kw.toLowerCase()))) {
              filtered.push(source);
            }
          }
        }

        return filtered;

      default:
        return sources;
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    events: any,
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
