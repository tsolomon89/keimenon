/**
 * VERIFY_SOURCE_CHAIN Task Handler (Pro+ Feature - Stub)
 *
 * Creates evidence chains from web search.
 * Claims "supported by X sources with Y credibility" - NOT "true".
 *
 * Workflow:
 * 1. Extract claims from target (group or source)
 * 2. Search web for supporting evidence
 * 3. Evaluate source credibility using domain weights
 * 4. Create Evidence and Objective nodes
 * 5. Link with SOURCED_FROM edges
 *
 * NOTE: This is a Pro+ feature. Free tier will return a "feature unavailable" error.
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
 * Objective node structure (verified claim)
 */
interface ObjectiveNode {
  id: string;
  kind: 'Objective';
  account_id: string;
  claim: string;
  confidence: number;
  source_count: number;
  created_at: number;
  updated_at: number;
  metadata: {
    agent_id: string;
    task_id: string;
    target_id: string;
  };
}

/**
 * VERIFY_SOURCE_CHAIN Handler (Pro+ Stub)
 *
 * This handler is a stub for the Pro+ verification feature.
 * It demonstrates the interface but requires Pro+ tier to execute.
 */
export class VerifySourceChainHandler
  implements TaskHandler<VerifySourceChainInput, VerifySourceChainOutput>
{
  readonly type = 'VERIFY_SOURCE_CHAIN' as const;
  readonly name = 'Source Chain Verifier';
  readonly description = 'Create evidence chains from web search (Pro+ feature)';
  readonly tierRequired = 'pro' as const;

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
        id: 'check_tier',
        name: 'Check Account Tier',
        description: 'Verify Pro+ subscription',
        estimated_ms: 100,
      },
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
        id: 'create_objective_nodes',
        name: 'Create Objective Nodes',
        description: 'Create verified claim nodes with confidence scores',
        estimated_ms: 1000,
      },
      {
        id: 'link_sources',
        name: 'Link Sources',
        description: 'Create SOURCED_FROM edges',
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

    const web = tools.getWebAdapter();
    if (!web || !web.isAvailable()) {
      return { can: false, reason: 'Web adapter not available' };
    }

    return { can: true };
  }

  /**
   * Execute the task
   *
   * NOTE: This is a stub implementation. Full implementation requires:
   * - Pro+ tier verification
   * - Real web search integration
   * - Credibility scoring algorithm
   */
  async run(
    input: VerifySourceChainInput,
    ctx: TaskContext<VerifySourceChainInput>
  ): Promise<TaskResult<VerifySourceChainOutput>> {
    const { graph, storage, tools, events, signal, task, run } = ctx;
    const artifacts: string[] = [];

    try {
      // Step 1: Check account tier (stub - always fails for now)
      this.emitProgress(events, task.id, 5, 'Checking account tier...');

      // In a real implementation, this would check the account's subscription
      const isPro = await this.checkProTier(task.account_id);

      if (!isPro) {
        return {
          success: false,
          error: 'VERIFY_SOURCE_CHAIN requires Pro+ subscription. Upgrade to access this feature.',
          artifacts: [],
        };
      }

      // The following code would execute for Pro+ users
      // For now, we return the tier error above

      // Step 2: Extract claims from target
      this.emitProgress(events, task.id, 15, 'Extracting claims from target...');

      if (signal.aborted) throw new Error('Task cancelled');

      const targetContent = await this.getTargetContent(
        input.targetId,
        graph,
        task.account_id
      );

      if (!targetContent) {
        return {
          success: false,
          error: 'Target not found or has no content',
          artifacts: [],
        };
      }

      const llm = tools.getLLMAdapter();
      if (!llm) {
        return {
          success: false,
          error: 'LLM adapter not available',
          artifacts: [],
        };
      }

      const claims = await llm.extractClaims(targetContent.content);

      if (claims.length === 0) {
        return {
          success: true,
          output: {
            evidenceNodes: [],
            objectiveNodes: [],
            credibilityScore: 0,
          },
          artifacts: [],
          metrics: {
            duration_ms: Date.now() - run.started_at,
          },
        };
      }

      // Step 3: Search for evidence
      this.emitProgress(events, task.id, 35, 'Searching for supporting evidence...');

      if (signal.aborted) throw new Error('Task cancelled');

      const web = tools.getWebAdapter();
      if (!web) {
        return {
          success: false,
          error: 'Web adapter not available',
          artifacts: [],
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

      for (const claimObj of claims.slice(0, 5)) { // Limit claims to process
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

      // Step 6: Create Objective nodes
      this.emitProgress(events, task.id, 85, 'Creating objective nodes...');

      if (signal.aborted) throw new Error('Task cancelled');

      const objectiveNodes: ObjectiveNode[] = [];

      for (const result of evidenceResults) {
        const relatedEvidence = evidenceNodes.filter(e =>
          result.sources.some(s => s.url === e.url)
        );

        const avgCredibility = relatedEvidence.length > 0
          ? relatedEvidence.reduce((sum, e) => sum + e.credibility_score, 0) / relatedEvidence.length
          : 0;

        const objective: ObjectiveNode = {
          id: uuidv4(),
          kind: 'Objective',
          account_id: task.account_id,
          claim: result.claim,
          confidence: avgCredibility,
          source_count: relatedEvidence.length,
          created_at: now,
          updated_at: now,
          metadata: {
            agent_id: task.agent_id,
            task_id: task.id,
            target_id: input.targetId,
          },
        };

        objectiveNodes.push(objective);
        await graph.createNode(objective as any);

        // Create SOURCED_FROM edges
        for (const evidence of relatedEvidence) {
          await graph.createEdge({
            source_id: objective.id,
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

      // Calculate overall credibility
      const overallCredibility = objectiveNodes.length > 0
        ? objectiveNodes.reduce((sum, o) => sum + o.confidence, 0) / objectiveNodes.length
        : 0;

      // Store result as artifact
      const artifactResult = await storage.put(JSON.stringify({
        claims: evidenceResults.map(r => r.claim),
        evidenceCount: evidenceNodes.length,
        objectiveCount: objectiveNodes.length,
        overallCredibility,
        generatedAt: now,
      }, null, 2));
      artifacts.push(artifactResult.hash);

      this.emitProgress(events, task.id, 100, 'Verification complete!');

      return {
        success: true,
        output: {
          evidenceNodes: evidenceNodes.map(e => e.id),
          objectiveNodes: objectiveNodes.map(o => o.id),
          credibilityScore: overallCredibility,
        },
        artifacts,
        metrics: {
          duration_ms: Date.now() - run.started_at,
          claims_extracted: claims.length,
          evidence_found: evidenceNodes.length,
          objectives_created: objectiveNodes.length,
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
   * Check if account has Pro+ tier
   * Stub implementation - always returns false
   */
  private async checkProTier(accountId: string): Promise<boolean> {
    // TODO: Implement actual tier checking
    // This would query the account's subscription status
    return false;
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
