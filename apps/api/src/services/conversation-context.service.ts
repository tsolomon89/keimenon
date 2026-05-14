import { z } from 'zod';

export interface EvidenceItem {
  node_id: string;
  kind: string;
  source_id?: string;
  group_id?: string;
  text?: string;
  label?: string;
  provenance?: unknown;
}

export interface ConversationContextPack {
  conversation_id: string;
  source_ids: string[];
  group_ids: string[];
  evidence: EvidenceItem[];
  limits: {
    max_sources: number;
    max_groups: number;
    max_evidence_items: number;
  };
  truncation: {
    sources_truncated: boolean;
    groups_truncated: boolean;
    evidence_truncated: boolean;
    requested_sources: number;
    returned_sources: number;
    requested_groups: number;
    returned_groups: number;
    returned_evidence_items: number;
  };
}

const ContextSpecSchema = z.object({
  source_ids: z.array(z.string()).default([]),
  group_ids: z.array(z.string()).default([]),
  workspace_id: z.string().optional(),
  include_pinned: z.boolean().default(true),
  expansion_rule: z.enum(['none', 'neighbors', 'connected']).default('none'),
});

export type ContextSpec = z.infer<typeof ContextSpecSchema>;

export class ConversationContextService {
  private database: any;

  constructor(database: any) {
    this.database = database;
  }

  public buildContextPack(
    accountId: string,
    conversationId: string,
    rawContextSpec: unknown
  ): ConversationContextPack {
    const limits = {
      max_sources: 50,
      max_groups: 20,
      max_evidence_items: 100, // Safe threshold to prevent payload bloat
    };

    // Parse and normalize the incoming context_spec
    let contextSpec: ContextSpec;
    try {
      contextSpec = ContextSpecSchema.parse(rawContextSpec);
    } catch {
      contextSpec = ContextSpecSchema.parse({});
    }

    const requestedSourceIds = contextSpec.source_ids.slice(0, limits.max_sources);
    const requestedGroupIds = contextSpec.group_ids.slice(0, limits.max_groups);

    // 1. Resolve authorized groups and their child sources
    const resolvedGroupIds = new Set<string>();
    const resolvedSourceIds = new Set<string>(requestedSourceIds);
    const evidence: EvidenceItem[] = [];

    if (requestedGroupIds.length > 0) {
      const placeholders = requestedGroupIds.map(() => '?').join(',');
      const groupNodes = this.database
        .prepare(
          `SELECT id, properties FROM nodes WHERE account_id = ? AND kind IN ('Group', 'Folder') AND id IN (${placeholders})`
        )
        .all(accountId, ...requestedGroupIds) as any[];

      for (const row of groupNodes) {
        resolvedGroupIds.add(row.id);
        const props = this.parseProperties(row.properties);
        evidence.push({
          node_id: row.id,
          kind: 'Group',
          group_id: row.id,
          label: props.name || row.id,
        });
      }

      if (resolvedGroupIds.size > 0) {
        const resolvedGroupIdsArray = Array.from(resolvedGroupIds);
        const groupPlaceholders = resolvedGroupIdsArray.map(() => '?').join(',');

        // Find sources IN_GROUP
        const groupEdges = this.database
          .prepare(
            `SELECT from_id as source_id, to_id as group_id FROM edges WHERE account_id = ? AND kind = 'IN_GROUP' AND to_id IN (${groupPlaceholders})`
          )
          .all(accountId, ...resolvedGroupIdsArray) as any[];

        for (const edge of groupEdges) {
          resolvedSourceIds.add(edge.source_id);
        }
      }
    }

    // 2. Resolve authorized sources and collect text payload evidence
    const finalSourceIds = Array.from(resolvedSourceIds).slice(0, limits.max_sources);
    const validatedSourceIds = new Set<string>();

    if (finalSourceIds.length > 0) {
      const sourcePlaceholders = finalSourceIds.map(() => '?').join(',');
      const sourceNodes = this.database
        .prepare(
          `SELECT id, properties FROM nodes WHERE account_id = ? AND kind IN ('Source', 'SourceDoc', 'VerifiedSource', 'UnifiedDoc') AND id IN (${sourcePlaceholders})`
        )
        .all(accountId, ...finalSourceIds) as any[];

      for (const row of sourceNodes) {
        validatedSourceIds.add(row.id);
        const props = this.parseProperties(row.properties);
        evidence.push({
          node_id: row.id,
          kind: 'Source',
          source_id: row.id,
          label: props.name || props.title || row.id,
        });
      }

      // 3. Extract text snippets / SourceSpans constrained to the limits
      if (validatedSourceIds.size > 0) {
        const valSourceArray = Array.from(validatedSourceIds);
        const valPlaceholders = valSourceArray.map(() => '?').join(',');

        // We only pull the top N snippets for each source to avoid giant responses,
        // ordered by start_char or just id.
        const spanRows = this.database
          .prepare(
            `SELECT id, source_id, text FROM source_spans WHERE account_id = ? AND source_id IN (${valPlaceholders}) LIMIT ?`
          )
          .all(accountId, ...valSourceArray, limits.max_evidence_items) as any[];

        for (const span of spanRows) {
          evidence.push({
            node_id: span.id,
            kind: 'SourceSpan',
            source_id: span.source_id,
            text: span.text,
          });
        }
      }
    }

    const finalEvidence = evidence.slice(0, limits.max_evidence_items);

    return {
      conversation_id: conversationId,
      source_ids: Array.from(validatedSourceIds),
      group_ids: Array.from(resolvedGroupIds),
      evidence: finalEvidence,
      limits,
      truncation: {
        sources_truncated:
          contextSpec.source_ids.length > limits.max_sources ||
          resolvedSourceIds.size > limits.max_sources,
        groups_truncated: contextSpec.group_ids.length > limits.max_groups,
        evidence_truncated: evidence.length > limits.max_evidence_items,
        requested_sources: resolvedSourceIds.size,
        returned_sources: validatedSourceIds.size,
        requested_groups: contextSpec.group_ids.length,
        returned_groups: resolvedGroupIds.size,
        returned_evidence_items: finalEvidence.length,
      },
    };
  }

  private parseProperties(propertiesStr: string): any {
    try {
      return JSON.parse(propertiesStr || '{}');
    } catch {
      return {};
    }
  }
}
