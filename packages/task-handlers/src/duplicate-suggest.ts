/**
 * DUPLICATE_SUGGEST Task Handler
 *
 * Proposes duplicate clusters with similarity scores.
 * Key principle: NEVER auto-merges - only proposes clusters for user review.
 *
 * Workflow:
 * 1. Fetch sources from the specified scope (group/board/import_batch)
 * 2. Compute pairwise similarity using content hashes and LLM classification
 * 3. Cluster similar sources
 * 4. Store clusters as artifact (JSON) and optionally as DuplicateCluster nodes
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  TaskHandler,
  TaskContext,
  TaskResult,
  TaskStep,
  DuplicateSuggestInput,
  DuplicateSuggestOutput,
  DuplicateCluster,
  ToolRegistry,
} from '@keimenon/agent-core';

/**
 * DuplicateCluster node structure
 */
interface DuplicateClusterNode {
  id: string;
  kind: 'DuplicateCluster';
  account_id: string;
  canonical_id: string;
  member_count: number;
  avg_similarity: number;
  created_at: number;
  updated_at: number;
  metadata: {
    scope: string;
    scope_id: string;
    agent_id: string;
    task_id: string;
    algorithm: string;
    threshold: number;
  };
}

/**
 * Source pair for similarity computation
 */
interface SourcePair {
  idA: string;
  idB: string;
  contentA: string;
  contentB: string;
}

/**
 * DUPLICATE_SUGGEST Handler
 *
 * Proposes duplicate clusters without auto-merging.
 */
export class DuplicateSuggestHandler
  implements TaskHandler<DuplicateSuggestInput, DuplicateSuggestOutput>
{
  readonly type = 'DUPLICATE_SUGGEST' as const;
  readonly name = 'Duplicate Suggester';
  readonly description = 'Propose duplicate clusters with similarity scores';

  /**
   * Validate task input
   */
  validate(input: DuplicateSuggestInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!['group', 'board', 'import_batch'].includes(input.scope)) {
      errors.push('scope must be one of: group, board, import_batch');
    }

    if (!input.scopeId) {
      errors.push('scopeId is required');
    }

    if (!input.thresholdPolicy) {
      errors.push('thresholdPolicy is required');
    } else {
      if (
        typeof input.thresholdPolicy.min_similarity !== 'number' ||
        input.thresholdPolicy.min_similarity < 0 ||
        input.thresholdPolicy.min_similarity > 1
      ) {
        errors.push('thresholdPolicy.min_similarity must be a number between 0 and 1');
      }

      if (!input.thresholdPolicy.algorithm) {
        errors.push('thresholdPolicy.algorithm is required');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Plan execution steps
   */
  async plan(
    input: DuplicateSuggestInput,
    ctx: TaskContext<DuplicateSuggestInput>
  ): Promise<TaskStep[]> {
    return [
      {
        id: 'fetch_sources',
        name: 'Fetch Sources',
        description: `Fetch sources from ${input.scope} ${input.scopeId}`,
        estimated_ms: 1000,
      },
      {
        id: 'compute_hashes',
        name: 'Compute Content Hashes',
        description: 'Generate content hashes for quick comparison',
        estimated_ms: 500,
      },
      {
        id: 'find_candidates',
        name: 'Find Duplicate Candidates',
        description: 'Identify potential duplicates using hash similarity',
        estimated_ms: 2000,
      },
      {
        id: 'classify_pairs',
        name: 'Classify Pairs',
        description: 'Use LLM to classify similarity of candidate pairs',
        estimated_ms: 15000,
      },
      {
        id: 'cluster_duplicates',
        name: 'Cluster Duplicates',
        description: 'Group similar sources into clusters',
        estimated_ms: 1000,
      },
      {
        id: 'store_results',
        name: 'Store Results',
        description: 'Save clusters as artifact and optionally as nodes',
        estimated_ms: 500,
      },
    ];
  }

  /**
   * Check if handler can execute
   */
  canExecute(tools: ToolRegistry): { can: boolean; reason?: string } {
    // Can run without LLM (hash-only mode) but better with LLM
    return { can: true };
  }

  /**
   * Execute the task
   */
  async run(
    input: DuplicateSuggestInput,
    ctx: TaskContext<DuplicateSuggestInput>
  ): Promise<TaskResult<DuplicateSuggestOutput>> {
    const { graph, storage, tools, events, signal, task, run } = ctx;
    const artifacts: string[] = [];

    try {
      // Step 1: Fetch sources from scope
      this.emitProgress(events, task.id, 10, 'Fetching sources from scope...');

      if (signal.aborted) throw new Error('Task cancelled');

      const sources = await this.fetchSourcesFromScope(
        input.scope,
        input.scopeId,
        graph,
        task.account_id
      );

      if (sources.length < 2) {
        return {
          success: true,
          output: {
            clusters: [],
            artifactPath: '',
          },
          artifacts: [],
          metrics: {
            duration_ms: Date.now() - run.started_at,
          },
        };
      }

      // Step 2: Compute content hashes
      this.emitProgress(events, task.id, 20, 'Computing content hashes...');

      if (signal.aborted) throw new Error('Task cancelled');

      const sourceMap = new Map<string, { id: string; content: string; hash: string }>();
      for (const source of sources) {
        const content = await graph.getSource(source.id, task.account_id);
        if (content) {
          sourceMap.set(source.id, {
            id: source.id,
            content: content.content,
            hash: this.simpleHash(content.content),
          });
        }
      }

      // Step 3: Find duplicate candidates using hash similarity
      this.emitProgress(events, task.id, 35, 'Finding duplicate candidates...');

      if (signal.aborted) throw new Error('Task cancelled');

      const candidatePairs = this.findCandidatePairs(
        sourceMap,
        input.thresholdPolicy.algorithm
      );

      if (candidatePairs.length === 0) {
        // No candidates found, return empty result
        const emptyResult = { clusters: [] };
        const artifactResult = await storage.put(JSON.stringify(emptyResult, null, 2));
        artifacts.push(artifactResult.hash);

        return {
          success: true,
          output: {
            clusters: [],
            artifactPath: artifactResult.path,
          },
          artifacts,
          metrics: {
            duration_ms: Date.now() - run.started_at,
          },
        };
      }

      // Step 4: Classify pairs using LLM (if available)
      this.emitProgress(events, task.id, 50, 'Classifying duplicate pairs...');

      if (signal.aborted) throw new Error('Task cancelled');

      const classifiedPairs = await this.classifyPairs(
        candidatePairs,
        tools,
        input.thresholdPolicy.min_similarity
      );

      // Step 5: Cluster duplicates
      this.emitProgress(events, task.id, 75, 'Clustering duplicates...');

      if (signal.aborted) throw new Error('Task cancelled');

      const clusters = this.clusterDuplicates(
        classifiedPairs,
        input.thresholdPolicy.min_similarity
      );

      // Step 6: Store results
      this.emitProgress(events, task.id, 90, 'Storing results...');

      if (signal.aborted) throw new Error('Task cancelled');

      // Store as JSON artifact
      const clusterResult = {
        clusters,
        metadata: {
          scope: input.scope,
          scopeId: input.scopeId,
          algorithm: input.thresholdPolicy.algorithm,
          threshold: input.thresholdPolicy.min_similarity,
          sourceCount: sources.length,
          pairsAnalyzed: candidatePairs.length,
          generatedAt: Date.now(),
        },
      };

      const artifactResult = await storage.put(JSON.stringify(clusterResult, null, 2));
      artifacts.push(artifactResult.hash);

      // Optionally create DuplicateCluster nodes
      if (input.createNodes !== false && clusters.length > 0) {
        await this.createClusterNodes(
          clusters,
          input,
          graph,
          task
        );

        // Create CANDIDATE_DUP edges
        await this.createCandidateEdges(
          classifiedPairs,
          graph,
          task
        );
      }

      this.emitProgress(events, task.id, 100, 'Duplicate analysis complete!');

      return {
        success: true,
        output: {
          clusters,
          artifactPath: artifactResult.path,
        },
        artifacts,
        metrics: {
          duration_ms: Date.now() - run.started_at,
          sources_analyzed: sources.length,
          pairs_classified: classifiedPairs.length,
          clusters_found: clusters.length,
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
   * Fetch sources from the specified scope
   */
  private async fetchSourcesFromScope(
    scope: string,
    scopeId: string,
    graph: any,
    accountId: string
  ): Promise<any[]> {
    switch (scope) {
      case 'group':
        return graph.listSources(scopeId, accountId, { limit: 1000 });

      case 'board':
        // Get all groups in the board, then get all sources
        const groups = await graph.listGroups(scopeId, accountId);
        const allSources: any[] = [];
        for (const group of groups) {
          const sources = await graph.listSources(group.id, accountId, { limit: 1000 });
          allSources.push(...sources);
        }
        return allSources;

      case 'import_batch':
        // Get sources from import batch
        return graph.getSourcesByImportBatch(scopeId, accountId, { limit: 1000 });

      default:
        return [];
    }
  }

  /**
   * Simple hash function for content comparison
   */
  private simpleHash(content: string): string {
    // Normalize content: lowercase, remove extra whitespace
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();

    // Simple hash using char codes
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Find candidate pairs using content similarity
   */
  private findCandidatePairs(
    sourceMap: Map<string, { id: string; content: string; hash: string }>,
    algorithm: string
  ): SourcePair[] {
    const pairs: SourcePair[] = [];
    const sources = Array.from(sourceMap.values());
    const seenPairs = new Set<string>();

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const a = sources[i];
        const b = sources[j];

        // Create canonical pair key
        const pairKey = a.id < b.id ? `${a.id}||${b.id}` : `${b.id}||${a.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        // Quick similarity check based on algorithm
        let isCandidate = false;

        if (algorithm === 'hash') {
          // Exact hash match
          isCandidate = a.hash === b.hash;
        } else if (algorithm === 'jaccard' || algorithm === 'hybrid') {
          // Jaccard similarity on tokens
          const similarity = this.jaccardSimilarity(a.content, b.content);
          isCandidate = similarity > 0.3; // Low threshold for candidates
        } else {
          // Default: length similarity as quick filter
          const lenRatio = Math.min(a.content.length, b.content.length) /
                          Math.max(a.content.length, b.content.length);
          isCandidate = lenRatio > 0.5;
        }

        if (isCandidate) {
          pairs.push({
            idA: a.id,
            idB: b.id,
            contentA: a.content,
            contentB: b.content,
          });
        }
      }
    }

    return pairs;
  }

  /**
   * Calculate Jaccard similarity between two texts
   */
  private jaccardSimilarity(textA: string, textB: string): number {
    const tokensA = new Set(textA.toLowerCase().split(/\s+/));
    const tokensB = new Set(textB.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }

  /**
   * Classify pairs using LLM or fallback to heuristics
   */
  private async classifyPairs(
    pairs: SourcePair[],
    tools: ToolRegistry,
    threshold: number
  ): Promise<Array<{ idA: string; idB: string; similarity: number }>> {
    const llm = tools.getLLMAdapter();

    if (llm && llm.isAvailable()) {
      // Use LLM for classification
      const textPairs = pairs.map(p => [p.contentA, p.contentB] as [string, string]);
      const results = await llm.classifyDupes(textPairs);

      return pairs.map((pair, i) => ({
        idA: pair.idA,
        idB: pair.idB,
        similarity: results[i]?.similarity ?? 0,
      }));
    } else {
      // Fallback to Jaccard similarity
      return pairs.map(pair => ({
        idA: pair.idA,
        idB: pair.idB,
        similarity: this.jaccardSimilarity(pair.contentA, pair.contentB),
      }));
    }
  }

  /**
   * Cluster duplicates using Union-Find algorithm
   */
  private clusterDuplicates(
    pairs: Array<{ idA: string; idB: string; similarity: number }>,
    threshold: number
  ): DuplicateCluster[] {
    // Filter by threshold
    const validPairs = pairs.filter(p => p.similarity >= threshold);

    if (validPairs.length === 0) return [];

    // Build adjacency map
    const adjacency = new Map<string, Array<{ id: string; similarity: number }>>();

    for (const pair of validPairs) {
      if (!adjacency.has(pair.idA)) adjacency.set(pair.idA, []);
      if (!adjacency.has(pair.idB)) adjacency.set(pair.idB, []);

      adjacency.get(pair.idA)!.push({ id: pair.idB, similarity: pair.similarity });
      adjacency.get(pair.idB)!.push({ id: pair.idA, similarity: pair.similarity });
    }

    // Find connected components using BFS
    const visited = new Set<string>();
    const clusters: DuplicateCluster[] = [];

    for (const startId of adjacency.keys()) {
      if (visited.has(startId)) continue;

      const component: Array<{ id: string; similarity: number }> = [];
      const queue = [startId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        // Find max similarity to any already-visited node in cluster
        let maxSim = 1.0;
        for (const member of component) {
          const edge = validPairs.find(
            p => (p.idA === current && p.idB === member.id) ||
                 (p.idB === current && p.idA === member.id)
          );
          if (edge) maxSim = Math.max(maxSim, edge.similarity);
        }

        component.push({ id: current, similarity: component.length === 0 ? 1.0 : maxSim });

        const neighbors = adjacency.get(current) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.id)) {
            queue.push(neighbor.id);
          }
        }
      }

      if (component.length > 1) {
        // Pick canonical as the one with highest average similarity
        const similarities = new Map<string, number>();
        for (const member of component) {
          let totalSim = 0;
          let count = 0;
          for (const pair of validPairs) {
            if (pair.idA === member.id || pair.idB === member.id) {
              totalSim += pair.similarity;
              count++;
            }
          }
          similarities.set(member.id, count > 0 ? totalSim / count : 0);
        }

        const canonicalId = [...similarities.entries()]
          .sort((a, b) => b[1] - a[1])[0][0];

        clusters.push({
          id: uuidv4(),
          canonical_id: canonicalId,
          members: component.map(m => ({
            id: m.id,
            similarity: m.id === canonicalId ? 1.0 : m.similarity,
          })),
        });
      }
    }

    return clusters;
  }

  /**
   * Create DuplicateCluster nodes in the graph
   */
  private async createClusterNodes(
    clusters: DuplicateCluster[],
    input: DuplicateSuggestInput,
    graph: any,
    task: any
  ): Promise<void> {
    const now = Date.now();

    for (const cluster of clusters) {
      const avgSimilarity = cluster.members.reduce((sum, m) => sum + m.similarity, 0) /
                           cluster.members.length;

      const node: DuplicateClusterNode = {
        id: cluster.id,
        kind: 'DuplicateCluster',
        account_id: task.account_id,
        canonical_id: cluster.canonical_id,
        member_count: cluster.members.length,
        avg_similarity: avgSimilarity,
        created_at: now,
        updated_at: now,
        metadata: {
          scope: input.scope,
          scope_id: input.scopeId,
          agent_id: task.agent_id,
          task_id: task.id,
          algorithm: input.thresholdPolicy.algorithm,
          threshold: input.thresholdPolicy.min_similarity,
        },
      };

      await graph.createNode(node as any);
    }
  }

  /**
   * Create CANDIDATE_DUP edges between similar sources
   */
  private async createCandidateEdges(
    pairs: Array<{ idA: string; idB: string; similarity: number }>,
    graph: any,
    task: any
  ): Promise<void> {
    const edges = pairs
      .filter(p => p.similarity >= 0.5) // Only create edges for significant similarity
      .map(pair => ({
        source_id: pair.idA,
        target_id: pair.idB,
        kind: 'CANDIDATE_DUP' as const,
        weight: pair.similarity,
        metadata: {
          similarity: pair.similarity,
          task_id: task.id,
          account_id: task.account_id,
          created_by: task.agent_id,
        },
      }));

    if (edges.length > 0) {
      await graph.createEdges(edges);
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
