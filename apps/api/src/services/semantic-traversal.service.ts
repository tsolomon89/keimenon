import { createHash } from 'crypto';
import type Database from 'better-sqlite3';
import {
  ContextPack,
  ContextPackSnippet,
  TraversalEdgeRecord,
  TraversalExcludedRecord,
  TraversalNodeRecord,
  TraversalPathRecord,
  TraversalPlan,
  TraversalPlanSchema,
  TraversalResult,
  UnifiedDocumentResult,
} from '@keimenon/types';
import { buildDeterministicPrincipalId } from './graph-hierarchy.service';

interface NodeRow {
  id: string;
  kind: string;
  properties: string;
  created_at?: number;
  updated_at?: number;
}

interface EdgeRow {
  id: string;
  kind: string;
  from_id: string;
  to_id: string;
  properties: string | null;
  created_at?: number;
}

interface SearchState {
  id: string;
  hop: number;
  score: number;
  pathNodeIds: string[];
  pathEdgeIds: string[];
}

const DEFAULT_EDGE_KINDS_BY_STRATEGY: Record<TraversalPlan['expansionStrategy'], string[]> = {
  phrase: ['MENTIONS', 'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC', 'ABOUT', 'HAS_SPAN'],
  topic: ['ABOUT', 'BELONGS_TO_TOPIC', 'MENTIONS', 'CO_OCCURS_WITH', 'HAS_SPAN'],
  similarity: ['SIMILAR_TO', 'NEAR_DUP', 'DUP_OF', 'EQUIVALENT_TO'],
  provenance: [
    'DERIVES_FROM',
    'SOURCED_FROM',
    'HAS_SPAN',
    'COMPILED_FROM',
    'STITCHED_FROM',
    'PRODUCED_BY',
  ],
  mixed: [
    'MENTIONS',
    'CO_OCCURS_WITH',
    'BELONGS_TO_TOPIC',
    'ABOUT',
    'SIMILAR_TO',
    'NEAR_DUP',
    'DUP_OF',
    'EQUIVALENT_TO',
    'DERIVES_FROM',
    'SOURCED_FROM',
    'HAS_SPAN',
    'COMPILED_FROM',
    'STITCHED_FROM',
  ],
};

const DEFAULT_ALLOWED_NODE_KINDS = new Set([
  'Source',
  'SourceDoc',
  'Message',
  'SourceSpan',
  'Phrase',
  'Topic',
  'Group',
  'Folder',
  'UnifiedDoc',
  'CanonicalDoc',
  'ObjectiveClaim',
  'VerifiedSource',
  'VerifiedClaim',
  'Principal',
  'ConversationThread',
]);

export class SemanticTraversalService {
  constructor(private readonly database: Database.Database) {}

  traverse(accountId: string, rawPlan: unknown): TraversalResult {
    const plan = this.normalizePlan(rawPlan);
    const allowedNodeKinds = new Set(
      plan.allowedNodeKinds || Array.from(DEFAULT_ALLOWED_NODE_KINDS)
    );
    const allowedEdgeKinds = new Set(
      plan.allowedEdgeKinds || DEFAULT_EDGE_KINDS_BY_STRATEGY[plan.expansionStrategy]
    );

    const roots = this.getNodesByIds(accountId, plan.rootNodeIds);
    const missingRoots = plan.rootNodeIds.filter((id) => !roots.has(id));
    if (missingRoots.length > 0) {
      throw new Error(
        `Traversal roots are outside account scope or missing: ${missingRoots.join(', ')}`
      );
    }

    const sequestered = plan.includeSequestered
      ? new Set<string>()
      : this.getSequesteredNodeIds(accountId);
    const visited = new Map<string, SearchState>();
    const edgeById = new Map<string, TraversalEdgeRecord>();
    const excluded: TraversalExcludedRecord[] = [];
    const queue: SearchState[] = [];

    for (const rootId of plan.rootNodeIds.slice().sort()) {
      const root = roots.get(rootId)!;
      if (!allowedNodeKinds.has(root.kind)) {
        excluded.push({ id: rootId, reason: 'kind_filtered', detail: root.kind });
        continue;
      }
      if (sequestered.has(rootId)) {
        excluded.push({ id: rootId, reason: 'sequestered' });
        continue;
      }
      const state = {
        id: rootId,
        hop: 0,
        score: 1,
        pathNodeIds: [rootId],
        pathEdgeIds: [],
      };
      visited.set(rootId, state);
      queue.push(state);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.hop >= plan.maxHops) {
        continue;
      }

      const incidentEdges = this.getIncidentEdges(accountId, [current.id], allowedEdgeKinds);
      for (const edge of incidentEdges) {
        const edgeRecord = this.toTraversalEdge(edge);
        if (edgeRecord.weight < plan.minEdgeWeight || edgeRecord.confidence < plan.minConfidence) {
          excluded.push({ id: edge.id, reason: 'edge_filtered', detail: edge.kind });
          continue;
        }

        const nextId = edge.from_id === current.id ? edge.to_id : edge.from_id;
        if (sequestered.has(nextId)) {
          excluded.push({ id: nextId, reason: 'sequestered' });
          continue;
        }

        const nextNode = this.getNodesByIds(accountId, [nextId]).get(nextId);
        if (!nextNode) {
          excluded.push({ id: nextId, reason: 'account_scope' });
          continue;
        }
        if (!allowedNodeKinds.has(nextNode.kind)) {
          excluded.push({ id: nextId, reason: 'kind_filtered', detail: nextNode.kind });
          continue;
        }

        // Topic lifecycle filtering
        if (nextNode.kind === 'Topic') {
          const topicProps = this.parseProperties(nextNode.properties);
          const topicStatus = String(topicProps.topic_status || '');
          const mergeTargetId =
            typeof topicProps.merge_target_id === 'string' ? topicProps.merge_target_id : '';

          // Rejected topics are never traversed
          if (topicStatus === 'rejected') {
            excluded.push({ id: nextId, reason: 'kind_filtered', detail: 'topic_rejected' });
            continue;
          }

          // Suggested topics are only included when explicitly requested
          if (topicStatus === 'suggested' && !plan.includeSuggestedTopics) {
            excluded.push({ id: nextId, reason: 'kind_filtered', detail: 'topic_suggested' });
            continue;
          }

          // Merged topics redirect to their merge target
          if (mergeTargetId && mergeTargetId !== nextId) {
            const mergeTarget = this.getNodesByIds(accountId, [mergeTargetId]).get(mergeTargetId);
            if (mergeTarget && allowedNodeKinds.has(mergeTarget.kind)) {
              // Replace nextId with merge target — don't process the merged topic
              const redirectedEdge = {
                ...edge,
                [edge.from_id === current.id ? 'to_id' : 'from_id']: mergeTargetId,
              };
              const redirectedRecord = this.toTraversalEdge(redirectedEdge as typeof edge);
              edgeById.set(redirectedRecord.id, redirectedRecord);
              const redirectScore = Number(
                (current.score * redirectedRecord.weight * 0.86).toFixed(9)
              );
              const existingRedirect = visited.get(mergeTargetId);
              if (!existingRedirect || existingRedirect.score < redirectScore) {
                const redirectState = {
                  id: mergeTargetId,
                  hop: current.hop + 1,
                  score: redirectScore,
                  pathNodeIds: [...current.pathNodeIds, mergeTargetId],
                  pathEdgeIds: [...current.pathEdgeIds, edge.id],
                };
                visited.set(mergeTargetId, redirectState);
                queue.push(redirectState);
              }
              continue;
            }
          }
        }

        edgeById.set(edgeRecord.id, edgeRecord);
        const nextScore = Number((current.score * edgeRecord.weight * 0.86).toFixed(9));
        const existing = visited.get(nextId);
        if (existing && existing.score >= nextScore) {
          continue;
        }

        const nextState = {
          id: nextId,
          hop: current.hop + 1,
          score: nextScore,
          pathNodeIds: [...current.pathNodeIds, nextId],
          pathEdgeIds: [...current.pathEdgeIds, edge.id],
        };
        visited.set(nextId, nextState);
        queue.push(nextState);
      }

      queue.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    }

    const nodeRows = this.getNodesByIds(accountId, Array.from(visited.keys()));
    const nodes = Array.from(visited.values())
      .map((state) => this.toTraversalNode(nodeRows.get(state.id)!, state))
      .sort((a, b) => a.hop - b.hop || b.score - a.score || a.id.localeCompare(b.id));
    const edges = Array.from(edgeById.values()).sort(
      (a, b) => b.weight - a.weight || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)
    );
    const paths = Array.from(visited.values())
      .filter((state) => state.pathEdgeIds.length > 0)
      .map<TraversalPathRecord>((state) => ({
        nodeIds: state.pathNodeIds,
        edgeIds: state.pathEdgeIds,
        score: state.score,
      }))
      .sort((a, b) => b.score - a.score || a.nodeIds.join('|').localeCompare(b.nodeIds.join('|')));

    return {
      plan,
      rootNodeIds: plan.rootNodeIds,
      nodes,
      edges,
      paths,
      excluded: this.dedupeExcluded(excluded),
    };
  }

  buildContextPack(accountId: string, rawPlan: unknown): ContextPack {
    const traversal = this.traverse(accountId, {
      ...(typeof rawPlan === 'object' && rawPlan ? (rawPlan as Record<string, unknown>) : {}),
      outputMode: 'context_pack',
    });
    const plan = traversal.plan;
    const nodeById = new Map(traversal.nodes.map((node) => [node.id, node]));
    const edgeIds = traversal.edges.map((edge) => edge.id);
    const rankingScores = Object.fromEntries(
      traversal.nodes.map((node) => [node.id, Number(node.score.toFixed(9))])
    );

    const snippets = this.buildSnippets(accountId, traversal, nodeById);
    const selectedSnippets: ContextPackSnippet[] = [];
    const excluded = [...traversal.excluded];
    let usedChars = 0;
    let truncated = false;

    for (const snippet of snippets) {
      if (
        selectedSnippets.length >= plan.maxSnippets ||
        usedChars + snippet.text.length > plan.maxChars
      ) {
        truncated = true;
        excluded.push({
          id: snippet.id,
          reason: 'budget_exceeded',
          detail: `maxChars=${plan.maxChars}, maxSnippets=${plan.maxSnippets}`,
        });
        continue;
      }
      selectedSnippets.push(snippet);
      usedChars += snippet.text.length;
    }

    const phraseTopicPath = traversal.nodes
      .filter((node) => node.kind === 'Phrase' || node.kind === 'Topic')
      .map((node) => ({
        nodeId: node.id,
        kind: node.kind as 'Phrase' | 'Topic',
        label: node.label,
        score: node.score,
      }))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

    const sourceIds = Array.from(
      new Set(
        selectedSnippets
          .map((snippet) => snippet.sourceId)
          .concat(
            traversal.nodes
              .filter((node) =>
                ['Source', 'SourceDoc', 'Message', 'UnifiedDoc'].includes(node.kind)
              )
              .map((node) => node.id)
          )
      )
    ).sort();

    const provenance = selectedSnippets.map((snippet) => ({
      sourceId: snippet.sourceId,
      spanId: snippet.spanId,
      startChar: snippet.startChar,
      endChar: snippet.endChar,
      edgeIds: snippet.pathEdgeIds,
    }));

    const packSeed = JSON.stringify({
      accountId,
      plan,
      snippets: selectedSnippets.map((snippet) => snippet.id),
      edges: edgeIds,
    });

    return {
      id: `ctx_${this.hash(packSeed, 32)}`,
      accountId,
      plan,
      sourceIds,
      edgeIds,
      snippets: selectedSnippets,
      phraseTopicPath,
      rankingScores,
      provenance,
      excluded: this.dedupeExcluded(excluded),
      budget: {
        maxChars: plan.maxChars,
        usedChars,
        maxSnippets: plan.maxSnippets,
        truncated,
      },
      createdAt: Date.now(),
    };
  }

  createUnifiedDocument(
    accountId: string,
    userId: string,
    rawPlan: unknown,
    options: { title?: string; producerPrincipalId?: string } = {}
  ): UnifiedDocumentResult {
    const contextPack = this.buildContextPack(accountId, {
      ...(typeof rawPlan === 'object' && rawPlan ? (rawPlan as Record<string, unknown>) : {}),
      outputMode: 'canonical_doc',
    });
    const title = options.title?.trim() || this.deriveTitle(contextPack);
    const contentMarkdown = this.buildUnifiedMarkdown(title, contextPack);
    const now = Date.now();
    const nodeId = `udoc_${this.hash(
      JSON.stringify({
        accountId,
        title,
        contextPackId: contextPack.id,
        snippets: contextPack.snippets.map((snippet) => snippet.id),
      }),
      32
    )}`;
    const citations = contextPack.provenance.map((item) => ({
      node_id: item.spanId || item.sourceId,
      span:
        typeof item.startChar === 'number' && typeof item.endChar === 'number'
          ? `char:${item.startChar}-${item.endChar}`
          : undefined,
    }));

    this.insertNode({
      id: nodeId,
      kind: 'UnifiedDoc',
      properties: {
        id: nodeId,
        kind: 'UnifiedDoc',
        title,
        ring: 'L2',
        content_markdown: contentMarkdown,
        token_count: this.countTokens(contentMarkdown),
        citations,
        claims_index: [],
        created_at: now,
        updated_at: now,
        metadata: {
          graph_scope: 'knowledge',
          visible_by_default: true,
          source_role: 'agent_output',
          synthesis_mode: 'deterministic',
          context_pack_id: contextPack.id,
          traversal_plan: contextPack.plan,
          traversal_edge_ids: contextPack.edgeIds,
          source_ids: contextPack.sourceIds,
        },
      },
      accountId,
      userId,
      now,
    });

    const derivedEdgeIds: string[] = [];
    const seenTargets = new Set<string>();
    for (const provenance of contextPack.provenance) {
      const targetId = provenance.spanId || provenance.sourceId;
      if (seenTargets.has(targetId)) {
        continue;
      }
      seenTargets.add(targetId);
      const edgeId = `edge_derives_unified_${this.hash(`${accountId}:${nodeId}:${targetId}`, 32)}`;
      this.insertEdge({
        id: edgeId,
        kind: 'DERIVES_FROM',
        from: nodeId,
        to: targetId,
        accountId,
        userId,
        now,
        properties: {
          id: edgeId,
          kind: 'DERIVES_FROM',
          from: nodeId,
          to: targetId,
          confidence: 0.88,
          span:
            typeof provenance.startChar === 'number' && typeof provenance.endChar === 'number'
              ? `char:${provenance.startChar}-${provenance.endChar}`
              : undefined,
          created_at: now,
          metadata: {
            relation: 'unified_doc_source_span_provenance',
            context_pack_id: contextPack.id,
            source_id: provenance.sourceId,
            span_id: provenance.spanId,
            traversal_edge_ids: provenance.edgeIds,
          },
        },
      });
      derivedEdgeIds.push(edgeId);
    }

    let producedByEdgeId: string | undefined;
    const producerPrincipalId =
      options.producerPrincipalId || buildDeterministicPrincipalId(accountId, userId);
    if (this.nodeExists(accountId, producerPrincipalId)) {
      producedByEdgeId = `edge_produced_by_${this.hash(`${accountId}:${nodeId}:${producerPrincipalId}`, 32)}`;
      this.insertEdge({
        id: producedByEdgeId,
        kind: 'PRODUCED_BY',
        from: nodeId,
        to: producerPrincipalId,
        accountId,
        userId,
        now,
        properties: {
          id: producedByEdgeId,
          kind: 'PRODUCED_BY',
          from: nodeId,
          to: producerPrincipalId,
          run_id: contextPack.id,
          task_type: 'DETERMINISTIC_UNIFIED_DOC',
          created_at: now,
          metadata: {
            relation: 'deterministic_synthesis_from_context_pack',
            context_pack_id: contextPack.id,
          },
        },
      });
    }

    return {
      nodeId,
      title,
      contentMarkdown,
      contextPack,
      derivedEdgeIds,
      producedByEdgeId,
    };
  }

  private normalizePlan(rawPlan: unknown): TraversalPlan {
    const parsed = TraversalPlanSchema.parse(rawPlan);
    return {
      ...parsed,
      rootNodeIds: Array.from(new Set(parsed.rootNodeIds)).sort(),
      allowedNodeKinds: parsed.allowedNodeKinds
        ? Array.from(new Set(parsed.allowedNodeKinds)).sort()
        : undefined,
      allowedEdgeKinds: parsed.allowedEdgeKinds
        ? Array.from(new Set(parsed.allowedEdgeKinds)).sort()
        : undefined,
    };
  }

  private getNodesByIds(accountId: string, nodeIds: string[]): Map<string, NodeRow> {
    const ids = Array.from(new Set(nodeIds.filter((id) => id.length > 0)));
    const result = new Map<string, NodeRow>();
    if (ids.length === 0) {
      return result;
    }

    for (let offset = 0; offset < ids.length; offset += 500) {
      const chunk = ids.slice(offset, offset + 500);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = this.database
        .prepare(
          `
            SELECT id, kind, properties, created_at, updated_at
            FROM nodes
            WHERE account_id = ? AND id IN (${placeholders})
          `
        )
        .all(accountId, ...chunk) as NodeRow[];
      for (const row of rows) {
        result.set(row.id, row);
      }
    }

    return result;
  }

  private getIncidentEdges(
    accountId: string,
    nodeIds: string[],
    allowedEdgeKinds: Set<string>
  ): EdgeRow[] {
    const ids = Array.from(new Set(nodeIds));
    const kinds = Array.from(allowedEdgeKinds);
    if (ids.length === 0 || kinds.length === 0) {
      return [];
    }

    const idPlaceholders = ids.map(() => '?').join(', ');
    const kindPlaceholders = kinds.map(() => '?').join(', ');
    return this.database
      .prepare(
        `
          SELECT id, kind, from_id, to_id, properties, created_at
          FROM edges
          WHERE account_id = ?
            AND kind IN (${kindPlaceholders})
            AND (from_id IN (${idPlaceholders}) OR to_id IN (${idPlaceholders}))
          ORDER BY created_at ASC, id ASC
        `
      )
      .all(accountId, ...kinds, ...ids, ...ids) as EdgeRow[];
  }

  private getSequesteredNodeIds(accountId: string): Set<string> {
    const rows = this.database
      .prepare(`SELECT to_id FROM edges WHERE account_id = ? AND kind = 'SEQUESTERS'`)
      .all(accountId) as Array<{ to_id: string }>;
    const sequestered = new Set(rows.map((row) => row.to_id));
    if (sequestered.size === 0) {
      return sequestered;
    }

    const ids = Array.from(sequestered);
    const placeholders = ids.map(() => '?').join(', ');
    const descendantRows = this.database
      .prepare(
        `
          SELECT to_id
          FROM edges
          WHERE account_id = ?
            AND kind IN ('HAS_SPAN', 'CONTAINS', 'IN_GROUP')
            AND from_id IN (${placeholders})
        `
      )
      .all(accountId, ...ids) as Array<{ to_id: string }>;
    for (const row of descendantRows) {
      sequestered.add(row.to_id);
    }
    return sequestered;
  }

  private buildSnippets(
    accountId: string,
    traversal: TraversalResult,
    nodeById: Map<string, TraversalNodeRecord>
  ): ContextPackSnippet[] {
    const pathByNodeId = new Map<string, TraversalPathRecord>();
    for (const path of traversal.paths) {
      const terminal = path.nodeIds[path.nodeIds.length - 1];
      const existing = pathByNodeId.get(terminal);
      if (!existing || existing.score < path.score) {
        pathByNodeId.set(terminal, path);
      }
    }

    const spanNodeIds = traversal.nodes
      .filter((node) => node.kind === 'SourceSpan')
      .map((node) => node.id);
    const spanRows = this.getNodesByIds(accountId, spanNodeIds);
    const snippets: ContextPackSnippet[] = [];

    for (const spanId of spanNodeIds.sort()) {
      const row = spanRows.get(spanId);
      if (!row) {
        continue;
      }
      const props = this.parseProperties(row.properties);
      const sourceId = String(props.source_id || '');
      if (!sourceId) {
        continue;
      }
      const path = pathByNodeId.get(spanId) || {
        nodeIds: [spanId],
        edgeIds: [],
        score: nodeById.get(spanId)?.score || 0.1,
      };
      snippets.push({
        id: `snippet_${this.hash(`${spanId}:${props.start_char}:${props.end_char}`, 20)}`,
        sourceId,
        sourceKind: 'Source',
        spanId,
        text: String(props.text || ''),
        startChar: this.optionalNumber(props.start_char),
        endChar: this.optionalNumber(props.end_char),
        score: Number(path.score.toFixed(9)),
        pathNodeIds: path.nodeIds,
        pathEdgeIds: path.edgeIds,
      });
    }

    return snippets.sort(
      (a, b) =>
        b.score - a.score ||
        a.sourceId.localeCompare(b.sourceId) ||
        (a.startChar ?? 0) - (b.startChar ?? 0) ||
        a.id.localeCompare(b.id)
    );
  }

  private toTraversalNode(row: NodeRow, state: SearchState): TraversalNodeRecord {
    const properties = this.parseProperties(row.properties);
    return {
      id: row.id,
      kind: row.kind,
      label: this.nodeLabel(row.kind, properties, row.id),
      hop: state.hop,
      score: state.score,
      properties,
    };
  }

  private toTraversalEdge(row: EdgeRow): TraversalEdgeRecord {
    const properties = this.parseProperties(row.properties);
    const metadata =
      properties.metadata && typeof properties.metadata === 'object'
        ? (properties.metadata as Record<string, unknown>)
        : {};
    const weight = this.edgeWeight(row.kind, properties, metadata);
    const confidence = this.edgeConfidence(properties, metadata);
    const explanation =
      String(metadata.explanation || properties.explanation || '').trim() ||
      `${row.kind} edge from ${row.from_id} to ${row.to_id}`;

    return {
      id: row.id,
      kind: row.kind,
      from: row.from_id,
      to: row.to_id,
      weight,
      confidence,
      explanation,
      properties,
    };
  }

  private edgeWeight(
    kind: string,
    properties: Record<string, unknown>,
    metadata: Record<string, unknown>
  ): number {
    const candidates = [
      properties.weight,
      properties.relevance,
      properties.score,
      properties.similarity,
      properties.confidence,
      metadata.weight,
      metadata.relevance,
      metadata.score,
      metadata.similarity,
      metadata.confidence,
    ];
    for (const value of candidates) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return Math.max(0, Math.min(1, numeric));
      }
    }
    if (kind === 'MENTIONS') {
      const count = Number(properties.count ?? metadata.count ?? 1);
      return Math.max(0.25, Math.min(1, 0.45 + Math.log1p(count) / 4));
    }
    if (kind === 'HAS_SPAN') {
      return 0.8;
    }
    return 0.5;
  }

  private edgeConfidence(
    properties: Record<string, unknown>,
    metadata: Record<string, unknown>
  ): number {
    const candidates = [
      properties.confidence,
      metadata.confidence,
      properties.extraction_confidence,
    ];
    for (const value of candidates) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return Math.max(0, Math.min(1, numeric));
      }
    }
    return 0.75;
  }

  private deriveTitle(contextPack: ContextPack): string {
    const topTopic = contextPack.phraseTopicPath.find((entry) => entry.kind === 'Topic');
    const topPhrase = contextPack.phraseTopicPath.find((entry) => entry.kind === 'Phrase');
    const label = topTopic?.label || topPhrase?.label || 'Selected Knowledge';
    return `Unified: ${label}`;
  }

  private buildUnifiedMarkdown(title: string, contextPack: ContextPack): string {
    const topicLabels = contextPack.phraseTopicPath
      .filter((entry) => entry.kind === 'Topic')
      .slice(0, 6)
      .map((entry) => entry.label);
    const phraseLabels = contextPack.phraseTopicPath
      .filter((entry) => entry.kind === 'Phrase')
      .slice(0, 10)
      .map((entry) => entry.label);

    const lines: string[] = [];
    lines.push(`# ${title}`);
    lines.push('');
    lines.push('## Summary');
    lines.push(
      `This deterministic synthesis uses ${contextPack.snippets.length} source-backed snippet(s) from ${contextPack.sourceIds.length} source node(s).`
    );
    if (topicLabels.length > 0) {
      lines.push(`Primary topic path: ${topicLabels.join(', ')}.`);
    }
    if (phraseLabels.length > 0) {
      lines.push(`Key phrases: ${phraseLabels.join(', ')}.`);
    }

    lines.push('');
    lines.push('## Sections');
    const sectionLabel = topicLabels[0] || phraseLabels[0] || 'Evidence';
    lines.push(`### ${sectionLabel}`);
    for (const snippet of contextPack.snippets) {
      const spanRef =
        typeof snippet.startChar === 'number' && typeof snippet.endChar === 'number'
          ? `${snippet.spanId || snippet.sourceId}@${snippet.startChar}-${snippet.endChar}`
          : snippet.spanId || snippet.sourceId;
      lines.push(`- ${snippet.text.trim()} [${spanRef}]`);
    }

    lines.push('');
    lines.push('## Provenance');
    for (const provenance of contextPack.provenance) {
      const span =
        typeof provenance.startChar === 'number' && typeof provenance.endChar === 'number'
          ? ` char:${provenance.startChar}-${provenance.endChar}`
          : '';
      lines.push(
        `- source=${provenance.sourceId}${provenance.spanId ? ` span=${provenance.spanId}` : ''}${span}`
      );
    }

    lines.push('');
    lines.push('## Traversal Metadata');
    lines.push(`- context_pack_id: ${contextPack.id}`);
    lines.push(`- root_node_ids: ${contextPack.plan.rootNodeIds.join(', ')}`);
    lines.push(`- max_hops: ${contextPack.plan.maxHops}`);
    lines.push(`- edge_ids: ${contextPack.edgeIds.join(', ')}`);

    return `${lines.join('\n')}\n`;
  }

  private insertNode(input: {
    id: string;
    kind: string;
    properties: Record<string, unknown>;
    accountId: string;
    userId: string;
    now: number;
  }): void {
    const columns = this.tableColumns('nodes');
    const names = [
      'id',
      'kind',
      'properties',
      'account_id',
      'created_by',
      'created_at',
      'updated_at',
    ].filter((column) => columns.has(column));
    const values: Record<string, unknown> = {
      id: input.id,
      kind: input.kind,
      properties: JSON.stringify(input.properties),
      account_id: input.accountId,
      created_by: input.userId,
      created_at: input.now,
      updated_at: input.now,
    };
    if (columns.has('data_tag')) {
      names.push('data_tag');
      values.data_tag = 'real';
    }

    const placeholders = names.map(() => '?').join(', ');
    this.database
      .prepare(`INSERT OR REPLACE INTO nodes (${names.join(', ')}) VALUES (${placeholders})`)
      .run(...names.map((name) => values[name]));
  }

  private insertEdge(input: {
    id: string;
    kind: string;
    from: string;
    to: string;
    properties: Record<string, unknown>;
    accountId: string;
    userId: string;
    now: number;
  }): void {
    const columns = this.tableColumns('edges');
    const names = [
      'id',
      'kind',
      'from_id',
      'to_id',
      'properties',
      'account_id',
      'created_by',
      'created_at',
    ].filter((column) => columns.has(column));
    const values: Record<string, unknown> = {
      id: input.id,
      kind: input.kind,
      from_id: input.from,
      to_id: input.to,
      properties: JSON.stringify(input.properties),
      account_id: input.accountId,
      created_by: input.userId,
      created_at: input.now,
    };
    if (columns.has('data_tag')) {
      names.push('data_tag');
      values.data_tag = 'real';
    }

    const placeholders = names.map(() => '?').join(', ');
    this.database
      .prepare(`INSERT OR REPLACE INTO edges (${names.join(', ')}) VALUES (${placeholders})`)
      .run(...names.map((name) => values[name]));
  }

  private nodeExists(accountId: string, nodeId: string): boolean {
    const row = this.database
      .prepare(`SELECT id FROM nodes WHERE account_id = ? AND id = ?`)
      .get(accountId, nodeId) as { id?: string } | undefined;
    return Boolean(row?.id);
  }

  private tableColumns(tableName: 'nodes' | 'edges'): Set<string> {
    const rows = this.database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;
    return new Set(rows.map((row) => row.name));
  }

  private parseProperties(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string' || raw.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private nodeLabel(kind: string, properties: Record<string, unknown>, fallback: string): string {
    const candidates = [
      properties.title,
      properties.name,
      properties.text,
      properties.normalized_text,
      properties.lemma,
      properties.display_name,
      properties.claim_text,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return `${kind} ${fallback.slice(0, 8)}`;
  }

  private optionalNumber(value: unknown): number | undefined {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private countTokens(value: string): number {
    return value.split(/\s+/).filter((token) => token.length > 0).length;
  }

  private dedupeExcluded(excluded: TraversalExcludedRecord[]): TraversalExcludedRecord[] {
    const seen = new Set<string>();
    const result: TraversalExcludedRecord[] = [];
    for (const item of excluded) {
      const key = `${item.id}:${item.reason}:${item.detail || ''}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(item);
    }
    return result.sort((a, b) => a.id.localeCompare(b.id) || a.reason.localeCompare(b.reason));
  }

  private hash(value: string, length: number): string {
    return createHash('sha256').update(value).digest('hex').slice(0, length);
  }
}
