/**
 * VERIFY_TOPIC Task Handler
 *
 * Verifies a topic against external sources using web search + LLM extraction.
 * Produces VerifiedSource/VerifiedClaim nodes and a structured JSON artifact.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  TaskContext,
  TaskHandler,
  TaskResult,
  TaskStep,
  ToolRegistry,
  VerifyTopicInput,
  VerifyTopicOutput,
} from '@keimenon/agent-core';

type ArtifactRef = {
  hash: string;
  type: 'verification_json';
  path: string;
  metadata: Record<string, unknown>;
};

export class VerifyTopicHandler implements TaskHandler<VerifyTopicInput, VerifyTopicOutput> {
  readonly type = 'VERIFY_TOPIC' as const;
  readonly name = 'Topic Verifier';
  readonly description = 'Verify a topic via web evidence and LLM-backed claim extraction';

  validate(input: VerifyTopicInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (
      !input?.topicName ||
      typeof input.topicName !== 'string' ||
      input.topicName.trim().length === 0
    ) {
      errors.push('topicName is required');
    }
    if (
      input.maxSources !== undefined &&
      (!Number.isFinite(input.maxSources) || input.maxSources < 1)
    ) {
      errors.push('maxSources must be a positive number when provided');
    }
    return { valid: errors.length === 0, errors };
  }

  async plan(_input: VerifyTopicInput, _ctx: TaskContext<VerifyTopicInput>): Promise<TaskStep[]> {
    return [
      {
        id: 'resolve_topic',
        name: 'Resolve Topic',
        description: 'Resolve topic context from graph',
        estimated_ms: 200,
      },
      {
        id: 'search_sources',
        name: 'Search Sources',
        description: 'Search external web sources',
        estimated_ms: 2500,
      },
      {
        id: 'extract_claims',
        name: 'Extract Claims',
        description: 'Extract candidate claims from evidence snippets',
        estimated_ms: 2500,
      },
      {
        id: 'persist_graph',
        name: 'Persist Graph Artifacts',
        description: 'Create VerifiedSource/VerifiedClaim nodes and linkage edges',
        estimated_ms: 500,
      },
    ];
  }

  canExecute(tools: ToolRegistry): { can: boolean; reason?: string } {
    const llm = tools.getLLMAdapter();
    const web = tools.getWebAdapter();
    if (!llm || !llm.isAvailable()) {
      return { can: false, reason: 'LLM adapter unavailable' };
    }
    if (!web || !web.isAvailable()) {
      return { can: false, reason: 'Web adapter unavailable' };
    }
    return { can: true };
  }

  async run(
    input: VerifyTopicInput,
    ctx: TaskContext<VerifyTopicInput>
  ): Promise<TaskResult<VerifyTopicOutput>> {
    const { graph, tools, task, events, signal, storage } = ctx;

    try {
      this.emitProgress(events, task.id, 8, 'Resolving topic context...');
      if (signal.aborted) {
        throw new Error('Task cancelled');
      }

      const topicName = await this.resolveTopicName(input, graph, task.account_id);
      const topicKeywords = input.keywords || [];
      const query = this.buildQuery(topicName, topicKeywords);
      const maxSources = Math.max(1, input.maxSources ?? 5);
      const domainWeights = input.domainWeights || {};

      const llm = tools.getLLMAdapter();
      const web = tools.getWebAdapter();
      if (!llm || !llm.isAvailable()) {
        return { success: false, error: 'LLM adapter unavailable', artifacts: [] };
      }
      if (!web || !web.isAvailable()) {
        return { success: false, error: 'Web adapter unavailable', artifacts: [] };
      }

      this.emitProgress(events, task.id, 30, 'Searching external sources...');
      const searchResults = await web.search(query, { limit: maxSources });

      if (signal.aborted) {
        throw new Error('Task cancelled');
      }

      this.emitProgress(events, task.id, 55, 'Creating verified sources...');
      const now = Date.now();
      const createdSources: Array<{ id: string; trust: number; url: string; title: string }> = [];
      for (const result of searchResults) {
        const domain = this.extractDomain(result.url);
        const weightedTrust = domainWeights[domain] ?? result.score ?? 0.6;
        const trust = Math.max(0, Math.min(1, weightedTrust));

        const sourceId = uuidv4();
        await graph.createNode({
          id: sourceId,
          kind: 'VerifiedSource',
          account_id: task.account_id,
          title: result.title,
          url: result.url,
          publisher: result.source,
          trust_score: trust,
          accessed_at: now,
          created_at: now,
          updated_at: now,
          metadata: {
            task_id: task.id,
            run_query: query,
            snippet: result.snippet,
            domain,
            provider: web.getProvider(),
          },
        } as any);

        createdSources.push({
          id: sourceId,
          trust,
          url: result.url,
          title: result.title,
        });
      }

      this.emitProgress(events, task.id, 72, 'Extracting verified claims...');
      const claimsContext = searchResults
        .map((result) => `${result.title}\n${result.snippet}`)
        .join('\n\n');
      const extractedClaims = await llm.extractClaims(
        claimsContext,
        `Topic: ${topicName}${input.description ? `\nContext: ${input.description}` : ''}`
      );

      const claimCap = Math.max(1, Math.min(10, extractedClaims.length));
      const claims = extractedClaims.slice(0, claimCap);
      const claimIds: string[] = [];

      for (let index = 0; index < claims.length; index += 1) {
        const extracted = claims[index];
        const linkedSource = createdSources[index % Math.max(createdSources.length, 1)];
        const claimId = uuidv4();

        await graph.createNode({
          id: claimId,
          kind: 'VerifiedClaim',
          account_id: task.account_id,
          claim_text: extracted.claim,
          source_id: linkedSource?.id,
          confidence: Math.max(0, Math.min(1, extracted.confidence)),
          status: extracted.confidence >= 0.75 ? 'verified' : 'disputed',
          created_at: now,
          updated_at: now,
          metadata: {
            task_id: task.id,
            topic_name: topicName,
            provider: llm.getProvider(),
          },
        } as any);
        claimIds.push(claimId);

        if (linkedSource?.id) {
          await graph.createEdge({
            source_id: claimId,
            target_id: linkedSource.id,
            kind: 'SOURCED_FROM',
            metadata: {
              task_id: task.id,
              account_id: task.account_id,
            },
          });
        }

        if (input.topicId) {
          await graph.createEdge({
            source_id: input.topicId,
            target_id: claimId,
            kind: 'VERIFIED_BY',
            metadata: {
              task_id: task.id,
              account_id: task.account_id,
            },
          });
        }
      }

      const credibilityScore =
        createdSources.length > 0
          ? createdSources.reduce((sum, source) => sum + source.trust, 0) / createdSources.length
          : 0;

      const output: VerifyTopicOutput = {
        topicName,
        sourceIds: createdSources.map((source) => source.id),
        claimIds,
        sourceCount: createdSources.length,
        claimCount: claimIds.length,
        credibilityScore,
        generatedAt: now,
      };

      this.emitProgress(events, task.id, 90, 'Persisting verification artifact...');
      const artifact = await storage.putJson(output, `verify-topic-${task.id}.json`);
      const artifacts: ArtifactRef[] = [
        {
          hash: artifact.hash,
          type: 'verification_json',
          path: artifact.path,
          metadata: {
            task_type: this.type,
            topic_name: topicName,
            query,
            provider_web: web.getProvider(),
            provider_llm: llm.getProvider(),
          },
        },
      ];

      this.emitProgress(events, task.id, 100, 'Topic verification complete');

      return {
        success: true,
        output,
        artifacts,
        metrics: {
          duration_ms: 0,
          sources_found: createdSources.length,
          claims_extracted: claimIds.length,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Verify topic failed',
        artifacts: [],
      };
    }
  }

  private async resolveTopicName(
    input: VerifyTopicInput,
    graph: TaskContext<VerifyTopicInput>['graph'],
    accountId: string
  ): Promise<string> {
    const directName = input.topicName?.trim();
    if (directName) {
      return directName;
    }

    if (!input.topicId) {
      return 'Unknown Topic';
    }

    const topicNode = await graph.getNode(input.topicId, accountId);
    const inferred =
      (typeof (topicNode as any)?.name === 'string' && (topicNode as any).name) ||
      (typeof (topicNode as any)?.label === 'string' && (topicNode as any).label) ||
      input.topicId;
    return inferred;
  }

  private buildQuery(topicName: string, keywords: string[]): string {
    const cleanTopic = topicName.trim();
    if (keywords.length === 0) {
      return `${cleanTopic} facts evidence`;
    }
    return `${cleanTopic} ${keywords.slice(0, 4).join(' ')} evidence`;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
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
