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

// Source node
export const SourceNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Source'),
  url: z.string().optional(),
  file_path: z.string().optional(),
  fingerprint: z.string(), // Content hash
  mime_type: z.string(),
  size_bytes: z.number(),
  title: z.string().optional(),
  content_location: z.string().optional(), // e.g., "local://documents/sources/{id}.md"
  provenance: z.object({
    origin: z.string(),
    retrieved_at: z.number().optional(),
    attested: z.boolean().default(false),
  }).optional(),
});

export type SourceNode = z.infer<typeof SourceNodeSchema>;

// Group node
export const GroupNodeSchema = BaseNodeSchema.extend({
  kind: z.literal('Group'),
  name: z.string(),
  purpose: z.string().optional(),
  member_count: z.number().default(0),
  trust_metrics: z.object({
    objectivity: z.number().min(0).max(1).optional(),
    subjectivity: z.number().min(0).max(1).optional(),
    verification_ratio: z.number().min(0).max(1).optional(),
  }).optional(),
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
  status: z.enum(['unverified', 'verified', 'contested', 'stale']).default('unverified'),
  confidence: z.number().min(0).max(1).default(0.4),
  citations: z.array(z.object({
    node_id: z.string(),
    span: z.string().optional(), // e.g., "p3:s12-34"
  })),
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
  citations: z.array(z.object({
    node_id: z.string(),
    span: z.string().optional(),
  })),
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

// ChatThread
export const ChatThreadSchema = BaseNodeSchema.extend({
  kind: z.literal('ChatThread'),
  title: z.string(),
  system_preamble: z.string().optional(),
  persona: z.object({
    name: z.string(),
    model: z.string(),
    tools_allowed: z.array(z.string()),
  }).optional(),
});

export type ChatThread = z.infer<typeof ChatThreadSchema>;

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

// Union type for all nodes
export type AnyNode =
  | SourceNode
  | GroupNode
  | FolderNode
  | ObjectiveClaim
  | UnifiedDoc
  | Constellation
  | UserNode
  | ChatThread
  | MessageNode
  | CodeBlockNode;
