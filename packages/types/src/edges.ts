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
  canonical: z.string(), // node_id of canonical node
  content_id: z.string(), // shared content_id (cid_abc123...)
});

export type ExactDupEdge = z.infer<typeof ExactDupEdgeSchema>;

// NEAR_DUP edge (similarity-based near duplicates)
export const NearDupEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('NEAR_DUP'),
  canonical: z.string(), // node_id of canonical node
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
  blob_hash: z.string(), // Which blob this span is in
});

export type SpanContainsEdge = z.infer<typeof SpanContainsEdgeSchema>;

// CLUSTER_MEMBER edge (node belongs to cluster)
export const ClusterMemberEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('CLUSTER_MEMBER'),
  cluster_id: z.string(),
  score: z.number().min(0).max(1), // Similarity to canonical
});

export type ClusterMemberEdge = z.infer<typeof ClusterMemberEdgeSchema>;

// --- Pro Import V2 Edges ---

// HAS_SPAN edge (Source → SourceSpan)
export const HasSpanEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('HAS_SPAN'),
  start_char: z.number().min(0).optional(),
  end_char: z.number().min(0).optional(),
  boundary_kind: z.enum(['line', 'sentence', 'paragraph', 'token_window']).optional(),
});

export type HasSpanEdge = z.infer<typeof HasSpanEdgeSchema>;

// OCCURS_IN_SPAN edge (Packet → SourceSpan)
export const OccursInSpanEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('OCCURS_IN_SPAN'),
  count: z.number().min(1).default(1),
  mass: z.number().optional(),
});

export type OccursInSpanEdge = z.infer<typeof OccursInSpanEdgeSchema>;

// COMPOSED_OF_ATOMIC edge (Packet → AtomicUnit)
export const ComposedOfAtomicEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('COMPOSED_OF_ATOMIC'),
  unit_type: z.enum(['char', 'trigram']).optional(),
  position: z.number().min(0).optional(),
});

export type ComposedOfAtomicEdge = z.infer<typeof ComposedOfAtomicEdgeSchema>;

// --- Vision V2: UGC Spine Edges ---

// MENTIONS edge (UGCDoc → Lexeme/Phrase)
export const MentionsEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('MENTIONS'),
  count: z.number().default(1), // Occurrence count in source
  positions: z.array(z.number()).optional(), // Character positions
});

export type MentionsEdge = z.infer<typeof MentionsEdgeSchema>;

// ABOUT edge (UGCDoc → Topic)
export const AboutEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('ABOUT'),
  relevance: z.number().min(0).max(1).default(0.5), // Topic relevance score
});

export type AboutEdge = z.infer<typeof AboutEdgeSchema>;

// CO_OCCURS_WITH edge (Phrase ↔ Phrase)
export const CoOccursWithEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('CO_OCCURS_WITH'),
  count: z.number().default(1), // Co-occurrence count
  pmi: z.number().optional(), // Pointwise Mutual Information
});

export type CoOccursWithEdge = z.infer<typeof CoOccursWithEdgeSchema>;

// BELONGS_TO_TOPIC edge (Phrase → Topic)
export const BelongsToTopicEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('BELONGS_TO_TOPIC'),
  weight: z.number().min(0).max(1).default(0.5), // Phrase importance in topic
});

export type BelongsToTopicEdge = z.infer<typeof BelongsToTopicEdgeSchema>;

// --- Vision V2: Verified Edges ---

// SOURCED_FROM edge (VerifiedClaim → VerifiedSource)
export const SourcedFromEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('SOURCED_FROM'),
  excerpt_span: z.string().optional(), // Location in source (e.g., "p3:s12-34")
  extraction_confidence: z.number().min(0).max(1).default(0.8),
});

export type SourcedFromEdge = z.infer<typeof SourcedFromEdgeSchema>;

// --- World Model V5: Principal & Workspace Edges ---

// CREATED_BY edge (Source/Workspace → Principal who created it)
export const CreatedByEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('CREATED_BY'),
  // from: Source (especially workspace), to: Principal (creator)
});

export type CreatedByEdge = z.infer<typeof CreatedByEdgeSchema>;

// ATTACHED_TO edge (Source/Workspace → Principal agent)
export const AttachedToEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('ATTACHED_TO'),
  // from: Source (workspace), to: Principal (agent)
  role: z.enum(['primary', 'collaborator', 'observer']).default('primary'),
});

export type AttachedToEdge = z.infer<typeof AttachedToEdgeSchema>;

// PINS_CONTEXT edge (Source/Workspace → Any Node as context root)
export const PinsContextEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('PINS_CONTEXT'),
  // from: Source (workspace), to: Any Node (context root)
  pin_type: z.enum(['explicit', 'derived']).default('explicit'),
});

export type PinsContextEdge = z.infer<typeof PinsContextEdgeSchema>;

// INITIATED_BY edge (ConversationThread → Principal who started it)
export const InitiatedByEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('INITIATED_BY'),
  // from: ConversationThread, to: Principal (human initiator)
});

export type InitiatedByEdge = z.infer<typeof InitiatedByEdgeSchema>;

// PARTICIPATED_IN edge (Principal → ConversationThread)
export const ParticipatedInEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('PARTICIPATED_IN'),
  // from: Principal (agent), to: ConversationThread
  role: z.enum(['agent', 'human', 'observer']).default('agent'),
});

export type ParticipatedInEdge = z.infer<typeof ParticipatedInEdgeSchema>;

// PRODUCED_BY edge (Source/artifact → Run that created it)
export const ProducedByEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('PRODUCED_BY'),
  // from: Source (agent_output), to: Run ID (stored as node or reference)
  run_id: z.string(),
  task_type: z.string().optional(),
});

export type ProducedByEdge = z.infer<typeof ProducedByEdgeSchema>;

// HAS_MESSAGE edge (ConversationThread → Message)
export const HasMessageEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('HAS_MESSAGE'),
  // from: ConversationThread, to: Message
});

export type HasMessageEdge = z.infer<typeof HasMessageEdgeSchema>;

// AUTHORED_BY edge (Message → Principal)
export const AuthoredByEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('AUTHORED_BY'),
  // from: Message, to: Principal
});

export type AuthoredByEdge = z.infer<typeof AuthoredByEdgeSchema>;

// RUN_FOR edge (AgentRun → ConversationThread)
export const RunForEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('RUN_FOR'),
  // from: AgentRun, to: ConversationThread
});

export type RunForEdge = z.infer<typeof RunForEdgeSchema>;

// INPUT_MESSAGE edge (AgentRun → Message)
export const InputMessageEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('INPUT_MESSAGE'),
  // from: AgentRun, to: Message (User Message)
});

export type InputMessageEdge = z.infer<typeof InputMessageEdgeSchema>;

// PRODUCED_MESSAGE edge (AgentRun → Message)
export const ProducedMessageEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('PRODUCED_MESSAGE'),
  // from: AgentRun, to: Message (Assistant Message)
});

export type ProducedMessageEdge = z.infer<typeof ProducedMessageEdgeSchema>;

// USED_EVIDENCE edge (AgentRun → SourceSpan/Phrase/Topic)
export const UsedEvidenceEdgeSchema = BaseEdgeSchema.extend({
  kind: z.literal('USED_EVIDENCE'),
  // from: AgentRun, to: Any Node (Evidence)
});

export type UsedEvidenceEdge = z.infer<typeof UsedEvidenceEdgeSchema>;

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
  | ClusterMemberEdge
  | HasSpanEdge
  | OccursInSpanEdge
  | ComposedOfAtomicEdge
  // V2 Additions
  | MentionsEdge
  | AboutEdge
  | CoOccursWithEdge
  | BelongsToTopicEdge
  | SourcedFromEdge
  // World Model V5 Additions
  | CreatedByEdge
  | AttachedToEdge
  | PinsContextEdge
  | InitiatedByEdge
  | ParticipatedInEdge
  | ProducedByEdge
  | HasMessageEdge
  | AuthoredByEdge
  | RunForEdge
  | InputMessageEdge
  | ProducedMessageEdge
  | UsedEvidenceEdge;
