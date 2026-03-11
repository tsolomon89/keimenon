/**
 * VERIFY_SOURCE_CHAIN Task Handler
 *
 * Creates evidence-backed claim graphs from web search.
 * Produces Evidence + ObjectiveClaim + UnifiedDoc nodes.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  TaskHandler,
  TaskContext,
  TaskResult,
  TaskStep,
  VerifySourceChainInput,
  VerifySourceChainOutput,
  ToolRegistry,
} from '@keimenon/agent-core';
import { buildVerificationEgressPayload } from './verification-egress.js';

/**
 * Evidence node structure
 */
interface EvidenceNode {
  id: string;
  kind: 'Evidence';
  account_id: string;
  url: string;
  title: string;
  domain: string;
  snippet: string;
  fetch_timestamp: number;
  content_hash?: string;
  credibility_score: number;
  created_at: number;
  updated_at: number;
  metadata: {
    agent_id: string;
    task_id: string;
    domain_weight: number;
  };
}

/**
 * Objective claim node structure
 */
interface ObjectiveClaimNode {
  id: string;
  kind: 'ObjectiveClaim';
  account_id: string;
  claim_text: string;
  type: 'fact' | 'endpoint' | 'parameter' | 'definition' | 'metric' | 'config';
  status: 'provisional' | 'verifying' | 'verified' | 'contested' | 'stale';
  confidence: number;
  citations: Array<{
    node_id: string;
    span?: string;
  }>;
  supports: string[];
  contradicts: string[];
  created_at: number;
  updated_at: number;
  metadata: {
    agent_id: string;
    task_id: string;
    target_id: string;
    [key: string]: unknown;
  };
}

type ObjectiveLifecycleStatus = ObjectiveClaimNode['status'];

interface ExistingObjectiveClaimNode extends Record<string, unknown> {
  id: string;
  kind: 'ObjectiveClaim';
  account_id?: string;
  claim_text?: string;
  status?: ObjectiveLifecycleStatus | 'unverified' | string;
  confidence?: number;
  citations?: Array<{ node_id: string; span?: string }>;
  metadata?: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
}

/**
 * Unified documentation node structure
 */
interface UnifiedDocNode {
  id: string;
  kind: 'UnifiedDoc';
  account_id: string;
  title: string;
  ring: 'L0' | 'L1' | 'L2' | 'L3';
  content_markdown: string;
  token_count: number;
  citations: Array<{
    node_id: string;
    span?: string;
  }>;
  claims_index: string[];
  created_at: number;
  updated_at: number;
  metadata: {
    agent_id: string;
    task_id: string;
    target_id: string;
  };
}

export class VerifySourceChainHandler implements TaskHandler<
  VerifySourceChainInput,
  VerifySourceChainOutput
> {
  readonly type = 'VERIFY_SOURCE_CHAIN' as const;
  readonly name = 'Source Chain Verifier';
  readonly description = 'Create evidence-backed objective claims from web search';

  /**
   * Validate task input
   */
  validate(input: VerifySourceChainInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!input.targetId) {
      errors.push('targetId is required');
    }

    if (!input.policy) {
      errors.push('policy is required');
    } else {
      if (typeof input.policy.max_hops !== 'number' || input.policy.max_hops < 1) {
        errors.push('policy.max_hops must be a positive number');
      }

      if (typeof input.policy.max_sources !== 'number' || input.policy.max_sources < 1) {
        errors.push('policy.max_sources must be a positive number');
      }

      if (!input.policy.domain_weights || typeof input.policy.domain_weights !== 'object') {
        errors.push('policy.domain_weights must be an object');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Plan execution steps
   */
  async plan(
    input: VerifySourceChainInput,
    ctx: TaskContext<VerifySourceChainInput>
  ): Promise<TaskStep[]> {
    return [
      {
        id: 'extract_claims',
        name: 'Extract Claims',
        description: 'Use LLM to extract verifiable claims from target',
        estimated_ms: 5000,
      },
      {
        id: 'search_evidence',
        name: 'Search for Evidence',
        description: `Search web for up to ${input.policy.max_sources} supporting sources`,
        estimated_ms: 10000,
      },
      {
        id: 'evaluate_credibility',
        name: 'Evaluate Credibility',
        description: 'Score sources using domain weights',
        estimated_ms: 2000,
      },
      {
        id: 'create_evidence_nodes',
        name: 'Create Evidence Nodes',
        description: 'Store evidence as graph nodes',
        estimated_ms: 1000,
      },
      {
        id: 'create_objective_claims',
        name: 'Create Objective Claims',
        description: 'Create ObjectiveClaim nodes with confidence scores',
        estimated_ms: 1000,
      },
      {
        id: 'create_unified_doc',
        name: 'Create Unified Doc',
        description: 'Create UnifiedDoc node linking verified claims',
        estimated_ms: 500,
      },
    ];
  }

  /**
   * Check if handler can execute
   */
  canExecute(tools: ToolRegistry): { can: boolean; reason?: string } {
    // Lifecycle contract requires graceful degradation when adapters are unavailable.
    // We always execute and explicitly mark objective status with reason codes in run().
    return { can: true };
  }

  /**
   * Execute the task
   */
  async run(
    input: VerifySourceChainInput,
    ctx: TaskContext<VerifySourceChainInput>
  ): Promise<TaskResult<VerifySourceChainOutput>> {
    const { graph, storage, tools, events, signal, task, run } = ctx;
    const artifacts: string[] = [];
    const trackedObjectiveClaims = await this.getImportBatchObjectiveClaims(
      graph,
      task.account_id,
      input.targetId
    );

    try {
      // Step 1: Extract claims from target
      this.emitProgress(events, task.id, 5, 'Extracting claims from target...');

      if (signal.aborted) throw new Error('Task cancelled');

      if (trackedObjectiveClaims.length > 0) {
        await this.transitionObjectiveClaims(graph, trackedObjectiveClaims, {
          status: 'verifying',
          reasonCode: 'verification_started',
          taskId: task.id,
          runId: run.id,
        });
      }

      const targetContent = await this.getTargetContent(input.targetId, graph, task.account_id);

      if (!targetContent) {
        if (trackedObjectiveClaims.length > 0) {
          await this.transitionObjectiveClaims(graph, trackedObjectiveClaims, {
            status: 'stale',
            reasonCode: 'target_not_found',
            taskId: task.id,
            runId: run.id,
          });
        }
        return {
          success: false,
          error: 'Target not found or has no content',
          artifacts: [],
        };
      }

      const llm = tools.getLLMAdapter();
      if (!llm || !llm.isAvailable()) {
        if (trackedObjectiveClaims.length > 0) {
          await this.transitionObjectiveClaims(graph, trackedObjectiveClaims, {
            status: 'contested',
            reasonCode: 'llm_adapter_unavailable',
            taskId: task.id,
            runId: run.id,
          });
        }
        return {
          success: true,
          output: {
            evidenceNodes: [],
            objectiveNodes: trackedObjectiveClaims.map((objective) => objective.id),
            credibilityScore: 0,
          },
          artifacts: [],
          metrics: {
            duration_ms: Date.now() - run.started_at,
            objective_lifecycle_updates: trackedObjectiveClaims.length,
          },
        };
      }

      const maxEgressChars = Number(process.env.VERIFICATION_EGRESS_MAX_CHARS || 8000);
      const allowFullRawEgress =
        (input.policy as Record<string, unknown>).allow_full_raw_egress === true;
      const egressPayload = buildVerificationEgressPayload(targetContent.content, {
        allowFullRawEgress,
        maxExcerptChars: Number.isFinite(maxEgressChars) ? maxEgressChars : 8000,
      });

      const claims = await llm.extractClaims(egressPayload.content);

      if (claims.length === 0) {
        if (trackedObjectiveClaims.length > 0) {
          await this.transitionObjectiveClaims(graph, trackedObjectiveClaims, {
            status: 'stale',
            reasonCode: 'no_claims_extracted',
            taskId: task.id,
            runId: run.id,
          });
        }
        return {
          success: true,
          output: {
            evidenceNodes: [],
            objectiveNodes: trackedObjectiveClaims.map((objective) => objective.id),
            credibilityScore: 0,
          },
          artifacts: [],
          metrics: {
            duration_ms: Date.now() - run.started_at,
            objective_lifecycle_updates: trackedObjectiveClaims.length,
          },
        };
      }

      // Step 3: Search for evidence
      this.emitProgress(events, task.id, 35, 'Searching for supporting evidence...');

      if (signal.aborted) throw new Error('Task cancelled');

      const web = tools.getWebAdapter();
      if (!web || !web.isAvailable()) {
        if (trackedObjectiveClaims.length > 0) {
          await this.transitionObjectiveClaims(graph, trackedObjectiveClaims, {
            status: 'contested',
            reasonCode: 'web_adapter_unavailable',
            taskId: task.id,
            runId: run.id,
          });
        }
        return {
          success: true,
          output: {
            evidenceNodes: [],
            objectiveNodes: trackedObjectiveClaims.map((objective) => objective.id),
            credibilityScore: 0,
          },
          artifacts: [],
          metrics: {
            duration_ms: Date.now() - run.started_at,
            objective_lifecycle_updates: trackedObjectiveClaims.length,
          },
        };
      }

      const evidenceResults: Array<{
        claim: string;
        sources: Array<{
          url: string;
          title: string;
          snippet: string;
        }>;
      }> = [];

      for (const claimObj of claims.slice(0, 5)) {
        // Limit claims to process
        const searchQuery = this.buildSearchQuery(claimObj.claim);
        const results = await web.search(searchQuery);
        evidenceResults.push({
          claim: claimObj.claim,
          sources: results.slice(0, input.policy.max_sources),
        });
      }

      // Step 4: Evaluate credibility
      this.emitProgress(events, task.id, 55, 'Evaluating source credibility...');

      if (signal.aborted) throw new Error('Task cancelled');

      const evidenceNodes: EvidenceNode[] = [];
      const now = Date.now();

      for (const result of evidenceResults) {
        for (const source of result.sources) {
          const domain = this.extractDomain(source.url);
          const domainWeight = input.policy.domain_weights[domain] ?? 0.5;

          evidenceNodes.push({
            id: uuidv4(),
            kind: 'Evidence',
            account_id: task.account_id,
            url: source.url,
            title: source.title,
            domain,
            snippet: source.snippet,
            fetch_timestamp: now,
            credibility_score: domainWeight,
            created_at: now,
            updated_at: now,
            metadata: {
              agent_id: task.agent_id,
              task_id: task.id,
              domain_weight: domainWeight,
            },
          });
        }
      }

      // Step 5: Create Evidence nodes
      this.emitProgress(events, task.id, 70, 'Creating evidence nodes...');

      if (signal.aborted) throw new Error('Task cancelled');

      for (const node of evidenceNodes) {
        await graph.createNode(node as any);
      }

      // Step 6: Create ObjectiveClaim nodes
      this.emitProgress(events, task.id, 85, 'Creating objective claims...');

      if (signal.aborted) throw new Error('Task cancelled');

      const objectiveClaimNodes: ObjectiveClaimNode[] = [];

      for (const result of evidenceResults) {
        const relatedEvidence = evidenceNodes.filter((e) =>
          result.sources.some((s) => s.url === e.url)
        );

        const avgCredibility =
          relatedEvidence.length > 0
            ? relatedEvidence.reduce((sum, e) => sum + e.credibility_score, 0) /
              relatedEvidence.length
            : 0;
        const objectiveStatus = this.resolveObjectiveTerminalState(
          avgCredibility,
          relatedEvidence.length
        );

        const objectiveClaim: ObjectiveClaimNode = {
          id: uuidv4(),
          kind: 'ObjectiveClaim',
          account_id: task.account_id,
          claim_text: result.claim,
          type: 'fact',
          status: objectiveStatus.status,
          confidence: avgCredibility,
          citations: relatedEvidence.map((evidence) => ({
            node_id: evidence.id,
          })),
          supports: [],
          contradicts: [],
          created_at: now,
          updated_at: now,
          metadata: {
            agent_id: task.agent_id,
            task_id: task.id,
            target_id: input.targetId,
            objective_lifecycle: {
              state: objectiveStatus.status,
              previous: 'verifying',
              reason: objectiveStatus.reasonCode,
              updated_at: now,
              task_id: task.id,
              run_id: run.id,
            },
          },
        };

        objectiveClaimNodes.push(objectiveClaim);
        await graph.createNode(objectiveClaim as any);

        // Create SOURCED_FROM edges
        for (const evidence of relatedEvidence) {
          await graph.createEdge({
            source_id: objectiveClaim.id,
            target_id: evidence.id,
            kind: 'SOURCED_FROM',
            metadata: {
              task_id: task.id,
              account_id: task.account_id,
              created_by: task.agent_id,
            },
          });
        }
      }

      // Step 7: Create UnifiedDoc node linking objective claims
      this.emitProgress(events, task.id, 95, 'Publishing unified objective doc...');

      if (signal.aborted) throw new Error('Task cancelled');

      const unifiedDoc: UnifiedDocNode = {
        id: uuidv4(),
        kind: 'UnifiedDoc',
        account_id: task.account_id,
        title: `Objective verification: ${input.targetId}`,
        ring: 'L1',
        content_markdown: this.buildUnifiedDocMarkdown(objectiveClaimNodes, evidenceNodes),
        token_count: this.estimateTokenCount(objectiveClaimNodes, evidenceNodes),
        citations: evidenceNodes.map((evidence) => ({
          node_id: evidence.id,
        })),
        claims_index: objectiveClaimNodes.map((objectiveClaim) => objectiveClaim.id),
        created_at: now,
        updated_at: now,
        metadata: {
          agent_id: task.agent_id,
          task_id: task.id,
          target_id: input.targetId,
        },
      };

      await graph.createNode(unifiedDoc as any);

      for (const objectiveClaim of objectiveClaimNodes) {
        await graph.createEdge({
          source_id: unifiedDoc.id,
          target_id: objectiveClaim.id,
          kind: 'DERIVES_FROM',
          metadata: {
            task_id: task.id,
            account_id: task.account_id,
            created_by: task.agent_id,
          },
        });
      }

      // Calculate overall credibility
      const overallCredibility =
        objectiveClaimNodes.length > 0
          ? objectiveClaimNodes.reduce((sum, objective) => sum + objective.confidence, 0) /
            objectiveClaimNodes.length
          : 0;
      const terminalState = this.resolveObjectiveTerminalState(
        overallCredibility,
        evidenceNodes.length
      );
      const evidenceNodeIds = evidenceNodes.map((evidence) => evidence.id);

      if (trackedObjectiveClaims.length > 0) {
        await this.transitionObjectiveClaims(graph, trackedObjectiveClaims, {
          status: terminalState.status,
          reasonCode: terminalState.reasonCode,
          taskId: task.id,
          runId: run.id,
          confidence: overallCredibility,
          evidenceNodeIds,
        });
      }

      // Store result as artifact
      const artifactResult = await storage.put(
        JSON.stringify(
          {
            claims: evidenceResults.map((result) => result.claim),
            evidenceCount: evidenceNodes.length,
            objectiveClaimCount: objectiveClaimNodes.length,
            unifiedDocId: unifiedDoc.id,
            overallCredibility,
            egress: {
              mode: egressPayload.mode,
              totalChars: egressPayload.totalChars,
              egressChars: egressPayload.egressChars,
              truncated: egressPayload.truncated,
              allowFullRawEgress,
            },
            objectiveLifecycle: {
              trackedObjectives: trackedObjectiveClaims.length,
              finalStatus: terminalState.status,
              reasonCode: terminalState.reasonCode,
            },
            generatedAt: now,
          },
          null,
          2
        )
      );
      artifacts.push(artifactResult.hash);

      this.emitProgress(events, task.id, 100, 'Verification complete!');

      return {
        success: true,
        output: {
          evidenceNodes: evidenceNodes.map((evidence) => evidence.id),
          objectiveNodes: [
            ...trackedObjectiveClaims.map((objective) => objective.id),
            ...objectiveClaimNodes.map((objectiveClaim) => objectiveClaim.id),
            unifiedDoc.id,
          ],
          credibilityScore: overallCredibility,
        },
        artifacts,
        metrics: {
          duration_ms: Date.now() - run.started_at,
          claims_extracted: claims.length,
          evidence_found: evidenceNodes.length,
          objectives_created: objectiveClaimNodes.length + 1 + trackedObjectiveClaims.length,
          unified_docs_created: 1,
          objective_lifecycle_updates: trackedObjectiveClaims.length,
        },
      };
    } catch (error) {
      if (trackedObjectiveClaims.length > 0) {
        await this.transitionObjectiveClaims(graph, trackedObjectiveClaims, {
          status: 'contested',
          reasonCode: 'verification_failed',
          taskId: task.id,
          runId: run.id,
        });
      }
      return {
        success: false,
        error: (error as Error).message,
        artifacts,
      };
    }
  }

  private resolveObjectiveTerminalState(
    confidence: number,
    evidenceCount: number
  ): { status: ObjectiveLifecycleStatus; reasonCode: string } {
    if (evidenceCount <= 0) {
      return { status: 'stale', reasonCode: 'no_evidence' };
    }
    if (confidence >= 0.75) {
      return { status: 'verified', reasonCode: 'evidence_verified' };
    }
    return { status: 'contested', reasonCode: 'low_confidence' };
  }

  private normalizeObjectiveStatus(value: unknown): ObjectiveLifecycleStatus {
    if (value === 'unverified') {
      return 'provisional';
    }
    if (
      value === 'provisional' ||
      value === 'verifying' ||
      value === 'verified' ||
      value === 'contested' ||
      value === 'stale'
    ) {
      return value;
    }
    return 'provisional';
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private getImportBatchId(node: ExistingObjectiveClaimNode): string | null {
    const metadata = this.toRecord(node.metadata);
    const value =
      metadata.import_id ??
      metadata.importId ??
      metadata.import_batch ??
      node.import_id ??
      node.importId;

    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async getImportBatchObjectiveClaims(
    graph: any,
    accountId: string,
    importBatchId: string
  ): Promise<ExistingObjectiveClaimNode[]> {
    if (typeof graph.getNodesByKind !== 'function') {
      return [];
    }

    const nodes = (await graph.getNodesByKind('ObjectiveClaim', accountId, {
      limit: 5000,
    })) as ExistingObjectiveClaimNode[];

    return nodes
      .filter((node) => this.getImportBatchId(node) === importBatchId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private mergeCitations(
    existing: ExistingObjectiveClaimNode['citations'],
    evidenceNodeIds: string[] | undefined
  ): Array<{ node_id: string; span?: string }> {
    const merged = new Map<string, { node_id: string; span?: string }>();
    for (const citation of existing || []) {
      if (citation?.node_id) {
        merged.set(`${citation.node_id}:${citation.span || ''}`, {
          node_id: citation.node_id,
          span: citation.span,
        });
      }
    }
    for (const evidenceNodeId of evidenceNodeIds || []) {
      merged.set(`${evidenceNodeId}:`, { node_id: evidenceNodeId });
    }
    return Array.from(merged.values());
  }

  private async transitionObjectiveClaims(
    graph: any,
    claims: ExistingObjectiveClaimNode[],
    input: {
      status: ObjectiveLifecycleStatus;
      reasonCode: string;
      taskId: string;
      runId: string;
      confidence?: number;
      evidenceNodeIds?: string[];
    }
  ): Promise<void> {
    if (claims.length === 0 || typeof graph.createNode !== 'function') {
      return;
    }

    const now = Date.now();
    for (const claim of claims) {
      const metadata = this.toRecord(claim.metadata);
      const existingLifecycle = this.toRecord(metadata.objective_lifecycle);
      const existingVerification = this.toRecord(metadata.verification);
      const previousStatus = this.normalizeObjectiveStatus(claim.status);
      const mergedCitations = this.mergeCitations(claim.citations, input.evidenceNodeIds);
      const nextConfidence =
        typeof input.confidence === 'number'
          ? Math.max(0, Math.min(1, input.confidence))
          : typeof claim.confidence === 'number'
            ? Math.max(0, Math.min(1, claim.confidence))
            : 0.4;

      const updatedNode: ExistingObjectiveClaimNode = {
        ...claim,
        kind: 'ObjectiveClaim',
        status: input.status,
        confidence: nextConfidence,
        citations: mergedCitations,
        updated_at: now,
        metadata: {
          ...metadata,
          objective_lifecycle: {
            ...existingLifecycle,
            state: input.status,
            previous: previousStatus,
            reason: input.reasonCode,
            updated_at: now,
            task_id: input.taskId,
            run_id: input.runId,
          },
          verification: {
            ...existingVerification,
            reason_code: input.reasonCode,
            updated_at: now,
            task_id: input.taskId,
            run_id: input.runId,
            confidence: nextConfidence,
            evidence_count: input.evidenceNodeIds?.length ?? 0,
          },
        },
      };

      await graph.createNode(updatedNode as any);
      claim.status = input.status;
      claim.confidence = nextConfidence;
      claim.citations = mergedCitations;
      claim.updated_at = now;
      claim.metadata = this.toRecord(updatedNode.metadata);
    }
  }

  private buildUnifiedDocMarkdown(
    objectiveClaimNodes: ObjectiveClaimNode[],
    evidenceNodes: EvidenceNode[]
  ): string {
    const claimLines = objectiveClaimNodes.map((objectiveClaim, index) => {
      const pct = Math.round(objectiveClaim.confidence * 100);
      const status = objectiveClaim.status;
      return `${index + 1}. ${objectiveClaim.claim_text} (confidence: ${pct}%, status: ${status})`;
    });

    const evidenceLines = evidenceNodes.map((evidence, index) => {
      const pct = Math.round(evidence.credibility_score * 100);
      return `${index + 1}. [${evidence.title}](${evidence.url}) (${evidence.domain}, credibility: ${pct}%)`;
    });

    return [
      '# Objective Verification Summary',
      '',
      '## Claims',
      claimLines.length > 0 ? claimLines.join('\n') : 'No objective claims generated.',
      '',
      '## Evidence',
      evidenceLines.length > 0 ? evidenceLines.join('\n') : 'No evidence sources found.',
      '',
    ].join('\n');
  }

  private estimateTokenCount(
    objectiveClaimNodes: ObjectiveClaimNode[],
    evidenceNodes: EvidenceNode[]
  ): number {
    const rawText = [
      ...objectiveClaimNodes.map((objectiveClaim) => objectiveClaim.claim_text),
      ...evidenceNodes.map((evidence) => evidence.snippet || evidence.title),
    ].join(' ');
    const wordCount = rawText.trim().length > 0 ? rawText.trim().split(/\s+/).length : 0;
    // Approximate GPT tokenization at ~0.75 words/token.
    return Math.max(1, Math.ceil(wordCount / 0.75));
  }

  /**
   * Get content from target (group or source)
   */
  private async getTargetContent(
    targetId: string,
    graph: any,
    accountId: string
  ): Promise<{ id: string; content: string } | null> {
    // Try as source first
    const source = await graph.getSource(targetId, accountId);
    if (source) {
      return { id: targetId, content: source.content };
    }

    // Try as group - get combined content of all sources
    const sources = await graph.listSources(targetId, accountId, { limit: 100 });
    if (sources.length > 0) {
      const contents: string[] = [];
      for (const s of sources) {
        const sourceData = await graph.getSource(s.id, accountId);
        if (sourceData) {
          contents.push(sourceData.content);
        }
      }
      return { id: targetId, content: contents.join('\n\n') };
    }

    // Try as import batch identifier (used for async post-import objective build)
    const graphWithBatchLookup = graph as {
      getSourcesByImportBatch?: (
        importBatchId: string,
        accountId: string,
        filters?: { limit?: number }
      ) => Promise<Array<{ id: string; [key: string]: unknown }>>;
    };

    if (typeof graphWithBatchLookup.getSourcesByImportBatch === 'function') {
      const batchSources = await graphWithBatchLookup.getSourcesByImportBatch(targetId, accountId, {
        limit: 200,
      });
      if (batchSources.length > 0) {
        const contents: string[] = [];
        for (const source of batchSources) {
          const sourceData = await graph.getSource(source.id, accountId);
          if (sourceData?.content) {
            contents.push(sourceData.content);
            continue;
          }

          const fallbackContent = this.extractSourceLikeContent(source);
          if (fallbackContent) {
            contents.push(fallbackContent);
          }
        }

        if (contents.length > 0) {
          return { id: targetId, content: contents.join('\n\n') };
        }
      }
    }

    return null;
  }

  private extractSourceLikeContent(source: Record<string, unknown>): string | null {
    if (typeof source.content === 'string' && source.content.length > 0) {
      return source.content;
    }
    if (typeof source.text === 'string' && source.text.length > 0) {
      return source.text;
    }

    const metadata =
      source.metadata && typeof source.metadata === 'object'
        ? (source.metadata as Record<string, unknown>)
        : null;
    if (metadata) {
      if (typeof metadata.content === 'string' && metadata.content.length > 0) {
        return metadata.content;
      }
      if (typeof metadata.text === 'string' && metadata.text.length > 0) {
        return metadata.text;
      }
    }

    return null;
  }

  /**
   * Build a search query from a claim
   */
  private buildSearchQuery(claim: string): string {
    // Simple implementation: use the claim as-is
    // A more sophisticated version would extract key terms
    return claim.slice(0, 100); // Limit query length
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Emit progress event
   */
  private emitProgress(events: any, taskId: string, percent: number, message: string): void {
    events.emit({
      type: 'task:progress',
      taskId,
      percent,
      message,
      timestamp: Date.now(),
    });
  }
}
