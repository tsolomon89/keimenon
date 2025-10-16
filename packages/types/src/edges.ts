import { z } from 'zod';

// Base edge schema
export const BaseEdgeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  from: z.string(), // node ID
  to: z.string(), // node ID
  created_at: z.number(),
  metadata: z.record(z.any()).optional(),
});

export type BaseEdge = z.infer<typeof BaseEdgeSchema>;

// CONTAINS edge (Group -> Source/Message/Claim/Doc/Folder)
export const ContainsEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('CONTAINS'),
  rank: z.number().optional(),
});

export type ContainsEdge = z.infer<typeof ContainsEdgeSchema>;

// SEQUESTERS edge (with policy flags)
export const SequestersEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('SEQUESTERS'),
  hidden_from_llm: z.boolean().default(false),
  hidden_from_tools: z.boolean().default(false),
  ui_only: z.boolean().default(false),
  reason: z.enum(['secret', 'noisy', 'untrusted', 'license', 'work_in_progress']),
  until: z.string().optional(), // ISO date string
});

export type SequestersEdge = z.infer<typeof SequestersEdgeSchema>;

// DERIVES_FROM edge (with span/citation info)
export const DerivesFromEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('DERIVES_FROM'),
  span: z.string().optional(), // e.g., "p3:s12-34" or "line:42-58"
  confidence: z.number().min(0).max(1).optional(),
});

export type DerivesFromEdge = z.infer<typeof DerivesFromEdgeSchema>;

// IN_SCOPE_FOR edge
export const InScopeForEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('IN_SCOPE_FOR'),
  rank: z.number().optional(),
  policy_chips: z.array(z.string()).optional(),
});

export type InScopeForEdge = z.infer<typeof InScopeForEdgeSchema>;

// EQUIVALENT_TO / DUP_OF edge
export const EquivalentToEdgeSchema = BaseEdgeSchema.extend({
  kind: z.enum(['EQUIVALENT_TO', 'DUP_OF']),
  score: z.number().min(0).max(1),
  canonical: z.string(), // ID of canonical node
});

export type EquivalentToEdge = z.infer<typeof EquivalentToEdgeSchema>;

// SUPPORTS / REFUTES edge (claim relationships)
export const SupportsRefutesEdgeSchema = BaseEdgeSchema.extend({
  kind: z.enum(['SUPPORTS', 'REFUTES']),
  strength: z.number().min(0).max(1).optional(),
});

export type SupportsRefutesEdge = z.infer<typeof SupportsRefutesEdgeSchema>;

// VERIFIED_BY edge
export const VerifiedByEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('VERIFIED_BY'),
  verifier_run_id: z.string(),
  status: z.enum(['pass', 'fail', 'inconclusive']),
  artifacts: z.record(z.any()).optional(),
  expires_at: z.number().optional(),
});

export type VerifiedByEdge = z.infer<typeof VerifiedByEdgeSchema>;

// EXACT_DUP edge (content-addressed exact duplicates)
export const ExactDupEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('EXACT_DUP'),
  canonical: z.string(),       // node_id of canonical node
  content_id: z.string(),      // shared content_id (cid_abc123...)
});

export type ExactDupEdge = z.infer<typeof ExactDupEdgeSchema>;

// NEAR_DUP edge (similarity-based near duplicates)
export const NearDupEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('NEAR_DUP'),
  canonical: z.string(),       // node_id of canonical node
  score: z.number().min(0).max(1),
  features_used: z.array(z.string()), // e.g., ['jaccard', 'cosine', 'structure']
  algorithm: z.enum(['jaccard', 'cosine', 'minhash', 'ast', 'combined']),
});

export type NearDupEdge = z.infer<typeof NearDupEdgeSchema>;

// SPAN_CONTAINS edge (hierarchical containment via byte spans)
export const SpanContainsEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('SPAN_CONTAINS'),
  byte_start: z.number(),
  byte_end: z.number(),
  blob_hash: z.string(),       // Which blob this span is in
});

export type SpanContainsEdge = z.infer<typeof SpanContainsEdgeSchema>;

// CLUSTER_MEMBER edge (node belongs to cluster)
export const ClusterMemberEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('CLUSTER_MEMBER'),
  cluster_id: z.string(),
  score: z.number().min(0).max(1),  // Similarity to canonical
});

export type ClusterMemberEdge = z.infer<typeof ClusterMemberEdgeSchema>;

// Union type for all edges
export type AnyEdge =
  | ContainsEdge
  | SequestersEdge
  | DerivesFromEdge
  | InScopeForEdge
  | EquivalentToEdge
  | SupportsRefutesEdge
  | VerifiedByEdge
  | ExactDupEdge
  | NearDupEdge
  | SpanContainsEdge
  | ClusterMemberEdge;
