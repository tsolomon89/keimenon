import { z } from 'zod';

// Base node schema
export const BaseNodeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  created_at: z.number(), // Unix timestamp
  updated_at: z.number(),
  metadata: z.record(z.any()).optional(),
});

export type BaseNode = z.infer<typeof BaseNodeSchema>;

// --- World Model V5: Enhanced Provenance Schema ---

/**
 * ProvenanceSchema - Every source must answer:
 * - WHO introduced this? (origin_principal_id)
 * - HOW? (origin_type)
 * - FROM WHAT? (origin_ref)
 * - IS IT VERIFIED? (trust_state)
 */
export const ProvenanceSchema = z.object({
  // WHO: Principal who introduced this source
  origin_principal_id: z.string(),

  // HOW: Mechanism of introduction
  origin_type: z.enum([
    'user_upload', // Human uploaded a file
    'chat_import', // Human imported from chat export
    'agent_import', // Agent fetched from web
    'agent_generated', // Agent created (summary, brief)
    'system_seed', // System-provided (templates, etc.)
    'migrated', // Migration from legacy data
  ]),

  // FROM WHAT: Reference to origin
  origin_ref: z.string(), // file_hash | url | run_id | conversation_id

  // IS IT VERIFIED: Trust classification
  trust_state: z.enum([
    'ugc', // User-generated content, self-attested
    'external_claim', // External source, unverified
    'verified_source', // Verified by trusted authority
  ]),

  // Additional context (optional)
  original_url: z.string().url().optional(),
  retrieved_at: z.number().optional(),
  capture_hash: z.string().optional(), // For web captures

  // Attestation chain (who vouches for this)
  attested_by: z.array(z.string()).optional(),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Legacy provenance schema for backward compatibility
 * @deprecated Use ProvenanceSchema instead
 */
export const LegacyProvenanceSchema = z.object({
  origin: z.string(),
  retrieved_at: z.number().optional(),
  attested: z.boolean().default(false),
});

// --- World Model V5: Unified Principal Model ---

/**
 * PrincipalCapabilitiesSchema - Policy-controlled capabilities
 * Authorization checks capabilities, NOT principal_kind
 */
export const PrincipalCapabilitiesSchema = z.object({
  can_upload: z.boolean().default(true), // Create sources from uploads
  can_run_tools: z.boolean().default(false), // Execute tool calls (agents)
  can_import_web: z.boolean().default(false), // Fetch external sources (agents)
  can_own_account: z.boolean().default(false), // Be account owner (humans)
  can_approve_runs: z.boolean().default(false), // Approve agent outputs (humans)
});

export type PrincipalCapabilities = z.infer<typeof PrincipalCapabilitiesSchema>;

/**
 * PrincipalNodeSchema - Unified principal model
 *
 * The equivalence claim: Contact = Agent = Human because all are principals
 * with permissions, provenance, and relationships.
 * Agent-ness is a permissioned skillset, not a different species.
 */
export const PrincipalNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Principal'),

  // Identity
  display_name: z.string(),
  email: z.string().email().optional(), // Humans typically have email

  // Classification (for UI display, NOT for authorization)
  principal_kind: z.enum(['human', 'agent', 'contact']),

  // Policy-controlled capabilities (authorization uses THESE, not kind)
  capabilities: PrincipalCapabilitiesSchema,

  // Permission tier / role
  policy_profile_id: z.string().optional(), // Links to PolicyProfile record

  // Creator tracking
  created_by: z.string().optional(), // Principal who created this principal

  // Agent-specific fields (when principal_kind === 'agent')
  agent_config: z
    .object({
      model: z.string().optional(),
      tools_allowed: z.array(z.string()).optional(),
      system_prompt: z.string().optional(),
    })
    .optional(),

  // Contact-specific fields (when principal_kind === 'contact')
  contact_info: z
    .object({
      external_id: z.string().optional(), // ID in external system
      source_platform: z.string().optional(), // e.g., 'chatgpt', 'claude', 'email'
    })
    .optional(),
});

export type PrincipalNode = z.infer<typeof PrincipalNodeSchema>;

// --- World Model V5: Source Role Schema ---

/**
 * SourceRoleSchema - Role determines visibility, context inclusion, and UI treatment
 */
export const SourceRoleSchema = z.enum([
  'imported', // Default: chat import, file upload
  'workspace', // User's active working space
  'brief', // Agent-generated summary
  'agent_output', // Agent-created artifact (research results, etc.)
  'research_bundle', // Collection of sources from research task
]);

export type SourceRole = z.infer<typeof SourceRoleSchema>;

// Source node (Enhanced with World Model V5 fields)
export const SourceNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Source'),
  url: z.string().optional(),
  file_path: z.string().optional(),
  fingerprint: z.string(), // Content hash
  mime_type: z.string(),
  size_bytes: z.number(),
  title: z.string().optional(),
  content_location: z.string().optional(), // e.g., "local://documents/sources/{id}.md"

  // --- World Model V5: Enhanced Provenance ---
  // REQUIRED for new sources (migration provides defaults for existing)
  provenance: z
    .union([
      ProvenanceSchema, // New enhanced provenance
      LegacyProvenanceSchema, // Legacy for backward compat
    ])
    .optional(), // Optional during migration, will become required

  // --- World Model V5: Source Role ---
  // Role determines visibility, context inclusion, and UI treatment
  source_role: SourceRoleSchema.default('imported'),

  // --- World Model V5: Workspace Fields ---
  // Agent attachment (for workspace/brief/agent_output sources)
  attached_agents: z.array(z.string()).optional(), // Principal IDs of attached agents

  // Context pins (the linchpin nodes that define this workspace's scope)
  context_pins: z.array(z.string()).optional(), // Node IDs (selected subgraph roots)
});

export type SourceNode = z.infer<typeof SourceNodeSchema>;

// --- Pro Import V2 Nodes ---

// SourceSpan node (immutable addressable span inside a source/message)
export const SourceSpanNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('SourceSpan'),
  source_id: z.string(),
  message_id: z.string().optional(),
  conversation_id: z.string().optional(),
  text: z.string(),
  normalized_text: z.string(),
  start_char: z.number().min(0),
  end_char: z.number().min(0),
  boundary_kind: z.enum(['line', 'sentence', 'paragraph', 'token_window']).default('sentence'),
  span_hash: z.string(),
});

export type SourceSpanNode = z.infer<typeof SourceSpanNodeSchema>;

// Packet node (repeated fragment with deterministic mass)
export const PacketNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Packet'),
  text: z.string(),
  normalized_text: z.string(),
  occurrences: z.number().min(1).default(1),
  mass: z.number().default(0),
  coverage: z.number().min(0).default(0),
  idf: z.number().min(0).default(0),
  entropy_factor: z.number().min(0).default(0),
  packet_hash: z.string(),
});

export type PacketNode = z.infer<typeof PacketNodeSchema>;

// AtomicUnit node (char/trigram substrate for resilient linking)
export const AtomicUnitNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('AtomicUnit'),
  unit_type: z.enum(['char', 'trigram']),
  value: z.string(),
  normalized_value: z.string(),
  unit_hash: z.string(),
});

export type AtomicUnitNode = z.infer<typeof AtomicUnitNodeSchema>;

// SourceDoc node (stitched user segments)
export const SourceDocSchema = BaseNodeSchema.extend({
  kind: z.literal('SourceDoc'),
  title: z.string(),
  n_segments: z.number(),
  n_chars: z.number(),
  created_ts_min: z.number(),
  created_ts_max: z.number(),
  content_location: z.string().optional(), // e.g., "local://documents/sourcedocs/{id}.md"
  provenance: z.array(
    z.object({
      conversation_id: z.string(),
      message_idx_start: z.number(),
      message_idx_end: z.number(),
      timestamp_min: z.number().optional(),
      timestamp_max: z.number().optional(),
      original_title: z.string().optional(),
    })
  ),
  metadata: z.record(z.any()).default({}),
});

export type SourceDoc = z.infer<typeof SourceDocSchema>;

// Group node
export const GroupNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Group'),
  name: z.string(),
  purpose: z.string().optional(),
  member_count: z.number().default(0),
  trust_metrics: z
    .object({
      objectivity: z.number().min(0).max(1).optional(),
      subjectivity: z.number().min(0).max(1).optional(),
      verification_ratio: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type GroupNode = z.infer<typeof GroupNodeSchema>;

// Folder node
export const FolderNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Folder'),
  name: z.string(),
  parent_id: z.string().optional(),
});

export type FolderNode = z.infer<typeof FolderNodeSchema>;

// ObjectiveClaim node
export const ObjectiveClaimSchema = BaseNodeSchema.extend({
  kind: z.literal('ObjectiveClaim'),
  claim_text: z.string(),
  type: z.enum(['fact', 'endpoint', 'parameter', 'definition', 'metric', 'config']),
  archetype: z
    .enum([
      'factual_claim',
      'endpoint_contract',
      'parameter_constraint',
      'definition_anchor',
      'metric_signal',
      'configuration_rule',
    ])
    .default('factual_claim'),
  status: z
    .preprocess(
      (value) => (value === 'unverified' ? 'provisional' : value),
      z.enum(['provisional', 'verifying', 'verified', 'contested', 'stale'])
    )
    .default('provisional'),
  confidence: z.number().min(0).max(1).default(0.4),
  citations: z.array(
    z.object({
      node_id: z.string(),
      span: z.string().optional(), // e.g., "p3:s12-34"
    })
  ),
  supports: z.array(z.string()).default([]), // claim IDs
  contradicts: z.array(z.string()).default([]), // claim IDs
});

export type ObjectiveClaim = z.infer<typeof ObjectiveClaimSchema>;

// UnifiedDoc node
export const UnifiedDocSchema = BaseNodeSchema.extend({
  kind: z.literal('UnifiedDoc'),
  title: z.string(),
  ring: z.enum(['L0', 'L1', 'L2', 'L3']),
  content_markdown: z.string().optional(), // Optional when content_location is used
  content_location: z.string().optional(), // e.g., "local://documents/unified/{id}.md"
  token_count: z.number(),
  citations: z.array(
    z.object({
      node_id: z.string(),
      span: z.string().optional(),
    })
  ),
  claims_index: z.array(z.string()), // claim IDs
});

export type UnifiedDoc = z.infer<typeof UnifiedDocSchema>;

// Constellation (aggregated view)
export const ConstellationSchema = BaseNodeSchema.extend({
  kind: z.literal('Constellation'),
  members: z.array(z.string()), // node IDs
  centroid: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional(),
  }),
  metric: z.string(), // e.g., "provenance", "semantic"
  collapsed: z.boolean().default(true),
});

export type Constellation = z.infer<typeof ConstellationSchema>;

// UserNode
export const UserNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('UserNode'),
  email: z.string().email(),
  name: z.string(),
  preferences: z.record(z.any()).optional(),
  policies: z.record(z.any()).optional(),
});

export type UserNode = z.infer<typeof UserNodeSchema>;

// AccountNode (NEW - for M:N user-account visualization)
export const AccountNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('AccountNode'),
  // Link to SQL account
  sql_account_id: z.string(),
  // Display properties
  name: z.string(),
  account_type: z.enum(['admin', 'client']),
  account_class: z.enum(['free', 'professional', 'business']),
  // Metadata
  owner_user_id: z.string().optional(),
  member_count: z.number().default(0),
  // Visual properties (for keimenon)
  color: z.string().optional(),
  icon: z.string().optional(),
  // Policies (account-level settings)
  policies: z.record(z.any()).optional(),
});

export type AccountNode = z.infer<typeof AccountNodeSchema>;

// ChatThread (Legacy alias for ConversationThread)
export const ChatThreadSchema = BaseNodeSchema.extend({
  kind: z.literal('ChatThread'),
  title: z.string(),
  system_preamble: z.string().optional(),
  persona: z
    .object({
      name: z.string(),
      model: z.string(),
      tools_allowed: z.array(z.string()),
    })
    .optional(),
});

export type ChatThread = z.infer<typeof ChatThreadSchema>;

// --- World Model V5: ConversationThread as Formal Join ---

/**
 * ContextSpecSchema - Context specification for conversations
 */
export const ContextSpecSchema = z.object({
  source_ids: z.array(z.string()), // Explicit source nodes
  group_ids: z.array(z.string()).default([]), // Groups as context sets
  workspace_id: z.string().optional(), // Workspace source providing context
  include_pinned: z.boolean().default(true), // Include user's pinned sources
  expansion_rule: z.enum(['none', 'neighbors', 'connected']).default('none'),
});

export type ContextSpec = z.infer<typeof ContextSpecSchema>;

/**
 * ConversationThreadSchema - Formal join over (principal, agent, context, purpose)
 *
 * A conversation is not "a chat UI feature"; it's a trace:
 * principal ↔ agent ↔ context-set-of-nodes ↔ outputs/runs
 */
export const ConversationThreadSchema = BaseNodeSchema.extend({
  kind: z.literal('ConversationThread'),

  // The Join Components
  human_principal_id: z.string(), // Human who initiated
  agent_principal_id: z.string().optional(), // Agent participant (optional for notes)
  context_set_id: z.string().optional(), // Snapshot or live pointer to context

  // Purpose (what kind of task is this?)
  purpose: z
    .enum([
      'summarize', // Summarize sources
      'cluster', // Group/dedupe related items
      'draft', // Write new content
      'research', // Investigate a topic
      'refactor', // Reorganize existing content
      'verify', // Fact-check claims
      'general', // Open-ended chat
    ])
    .default('general'),

  // Context specification (alternative to context_set_id for ad-hoc contexts)
  context_spec: ContextSpecSchema.optional(),

  // Existing fields (preserved for compatibility with ChatThread)
  title: z.string(),
  system_preamble: z.string().optional(),
  persona: z
    .object({
      name: z.string(),
      model: z.string(),
      tools_allowed: z.array(z.string()),
    })
    .optional(),
});

export type ConversationThread = z.infer<typeof ConversationThreadSchema>;

// Board node (Kanban/Whiteboard container)
export const BoardNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Board'),
  name: z.string(),
  description: z.string().optional(),
  columns: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      query: z.record(z.any()).optional(), // Smart column criteria
    })
  ),
  view_mode: z.enum(['kanban', 'list', 'grid']).default('kanban'),
  query: z.record(z.any()).optional(), // Smart board criteria
});

export type BoardNode = z.infer<typeof BoardNodeSchema>;

// Message node
export const MessageNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Message'),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().optional(), // Optional when content_location is used
  content_location: z.string().optional(), // e.g., "local://documents/messages/{conv_id}/{msg_id}.md"
  content_hash: z.string().optional(), // SHA256 hash for deduplication
  char_count: z.number().optional(),
  thread_id: z.string(),
  timestamp: z.number(),
  attachments: z.array(z.string()).optional(), // file IDs
});

export type MessageNode = z.infer<typeof MessageNodeSchema>;

// CodeBlock node (stored as Source subtype)
export const CodeBlockNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('CodeBlock'),
  language: z.string(),
  code: z.string().optional(), // Optional when content_location is used
  content_location: z.string().optional(), // e.g., "local://documents/code/{id}.{ext}"
  content_hash: z.string(),
  line_count: z.number(),
  char_count: z.number(),
  is_fenced: z.boolean().default(true),
  has_comments: z.boolean().default(false),
  derived_from_message_id: z.string().optional(),
});

export type CodeBlockNode = z.infer<typeof CodeBlockNodeSchema>;

// --- Vision V2: UGC Spine Nodes ---

// Lexeme node (Canonical word token)
export const LexemeNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Lexeme'),
  lemma: z.string(), // Normalized form
  pos: z.string().optional(), // Part of speech
  frequency: z.number().default(0),
});

export type LexemeNode = z.infer<typeof LexemeNodeSchema>;

// Phrase node (Canonical multiword unit / Entity)
export const PhraseNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Phrase'),
  text: z.string(),
  normalized_text: z.string(),
  type: z.enum(['n-gram', 'entity', 'concept']).default('n-gram'),
  entity_type: z.string().optional(), // e.g., "PERSON", "ORG"
  frequency: z.number().default(0),
});

export type PhraseNode = z.infer<typeof PhraseNodeSchema>;

// Topic node (Cluster of phrases)
export const TopicNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Topic'),
  name: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()), // Phrase IDs or text
  strength: z.number().default(1.0),

  // Topic lifecycle
  topic_status: z.enum(['suggested', 'promoted', 'rejected']).default('suggested'),
  promoted_at: z.number().optional(),
  promoted_by: z.string().optional(), // Principal ID who promoted
  merge_target_id: z.string().optional(), // Redirect target when merged
});

export type TopicNode = z.infer<typeof TopicNodeSchema>;

// --- Vision V2: Verified Graph Nodes ---

// VerifiedSource node (External authority)
export const VerifiedSourceNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('VerifiedSource'),
  url: z.string().url(),
  title: z.string(),
  publisher: z.string().optional(),
  author: z.string().optional(),
  published_at: z.number().optional(),
  accessed_at: z.number(),
  trust_score: z.number().min(0).max(1).default(0.5),
});

export type VerifiedSourceNode = z.infer<typeof VerifiedSourceNodeSchema>;

// VerifiedClaim node (Fact anchored to verified source)
export const VerifiedClaimNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('VerifiedClaim'),
  claim_text: z.string(),
  source_id: z.string(), // ID of VerifiedSourceNode
  evidence_excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  status: z.enum(['proposed', 'verified', 'disputed', 'refuted']).default('proposed'),
});

export type VerifiedClaimNode = z.infer<typeof VerifiedClaimNodeSchema>;

// Union type for all nodes
export type AnyNode =
  | SourceNode
  | SourceSpanNode
  | PacketNode
  | AtomicUnitNode
  | SourceDoc
  | GroupNode
  | FolderNode
  | ObjectiveClaim
  | UnifiedDoc
  | Constellation
  | UserNode
  | AccountNode
  | BoardNode
  | ChatThread
  | MessageNode
  | CodeBlockNode
  // V2 Additions
  | LexemeNode
  | PhraseNode
  | TopicNode
  | VerifiedSourceNode
  | VerifiedClaimNode
  // World Model V5 Additions
  | PrincipalNode
  | ConversationThread
  | AgentRun;

// AgentRun node
export const AgentRunSchema = BaseNodeSchema.extend({
  kind: z.literal('AgentRun'),
  actor_principal_id: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  skill_used: z.string(),
  duration_ms: z.number().optional(),
  status: z.enum(['success', 'error']),
  error_message: z.string().optional(),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;

// ProposedGraphOutput
export const ProposedGraphOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ProposedClaim'),
    claim_text: z.string(),
    source_ids: z.array(z.string()).optional(),
    confidence: z.number().optional(),
    reasoning: z.string().optional(),
  }),
  z.object({
    kind: z.literal('ProposedSource'),
    url: z.string(),
    description: z.string().optional(),
    confidence: z.number().optional(),
    reasoning: z.string().optional(),
  }),
  z.object({
    kind: z.literal('Gap'),
    description: z.string(),
    suggested_action: z.string().optional(),
    confidence: z.number().optional(),
    reasoning: z.string().optional(),
  }),
  z.object({
    kind: z.literal('CitationIssue'),
    claim_id: z.string().optional(),
    issue: z.string(),
    severity: z.enum(['low', 'medium', 'high']).optional(),
    confidence: z.number().optional(),
    reasoning: z.string().optional(),
  }),
]);

export type ProposedGraphOutput = z.infer<typeof ProposedGraphOutputSchema>;
