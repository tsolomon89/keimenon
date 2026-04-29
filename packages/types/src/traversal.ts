import { z } from 'zod';

export const TraversalExpansionStrategySchema = z.enum([
  'phrase',
  'topic',
  'similarity',
  'provenance',
  'mixed',
]);

export const TraversalOutputModeSchema = z.enum([
  'context_pack',
  'canonical_doc',
  'claim_map',
  'source_bundle',
]);

export const TraversalRawContentModeSchema = z.enum(['none', 'snippets', 'bounded']);

export const TraversalPlanSchema = z.object({
  rootNodeIds: z.array(z.string()).min(1).max(100),
  allowedNodeKinds: z.array(z.string()).optional(),
  allowedEdgeKinds: z.array(z.string()).optional(),
  maxHops: z.number().int().min(0).max(6).default(2),
  expansionStrategy: TraversalExpansionStrategySchema.default('mixed'),
  minEdgeWeight: z.number().min(0).max(1).default(0),
  minConfidence: z.number().min(0).max(1).default(0),
  includeSequestered: z.boolean().default(false),
  includeSuggestedTopics: z.boolean().default(false),
  includeRawContent: TraversalRawContentModeSchema.default('snippets'),
  outputMode: TraversalOutputModeSchema.default('context_pack'),
  maxChars: z.number().int().min(256).max(200000).default(12000),
  maxSnippets: z.number().int().min(1).max(500).default(80),
});

export type TraversalPlan = z.infer<typeof TraversalPlanSchema>;
export type TraversalExpansionStrategy = z.infer<typeof TraversalExpansionStrategySchema>;
export type TraversalOutputMode = z.infer<typeof TraversalOutputModeSchema>;
export type TraversalRawContentMode = z.infer<typeof TraversalRawContentModeSchema>;

export interface TraversalNodeRecord {
  id: string;
  kind: string;
  label: string;
  hop: number;
  score: number;
  properties: Record<string, unknown>;
}

export interface TraversalEdgeRecord {
  id: string;
  kind: string;
  from: string;
  to: string;
  weight: number;
  confidence: number;
  explanation: string;
  properties: Record<string, unknown>;
}

export interface TraversalPathRecord {
  nodeIds: string[];
  edgeIds: string[];
  score: number;
}

export interface TraversalExcludedRecord {
  id: string;
  reason: 'sequestered' | 'kind_filtered' | 'edge_filtered' | 'budget_exceeded' | 'account_scope';
  detail?: string;
}

export interface TraversalResult {
  plan: TraversalPlan;
  rootNodeIds: string[];
  nodes: TraversalNodeRecord[];
  edges: TraversalEdgeRecord[];
  paths: TraversalPathRecord[];
  excluded: TraversalExcludedRecord[];
}

export interface ContextPackSnippet {
  id: string;
  sourceId: string;
  sourceKind: string;
  spanId?: string;
  text: string;
  startChar?: number;
  endChar?: number;
  score: number;
  pathNodeIds: string[];
  pathEdgeIds: string[];
}

export interface ContextPack {
  id: string;
  accountId: string;
  plan: TraversalPlan;
  sourceIds: string[];
  edgeIds: string[];
  snippets: ContextPackSnippet[];
  phraseTopicPath: Array<{
    nodeId: string;
    kind: 'Phrase' | 'Topic';
    label: string;
    score: number;
  }>;
  rankingScores: Record<string, number>;
  provenance: Array<{
    sourceId: string;
    spanId?: string;
    startChar?: number;
    endChar?: number;
    edgeIds: string[];
  }>;
  excluded: TraversalExcludedRecord[];
  budget: {
    maxChars: number;
    usedChars: number;
    maxSnippets: number;
    truncated: boolean;
  };
  createdAt: number;
}

export interface UnifiedDocumentResult {
  nodeId: string;
  title: string;
  contentMarkdown: string;
  contextPack: ContextPack;
  derivedEdgeIds: string[];
  producedByEdgeId?: string;
}
