import { z } from 'zod';

// Platform types
export type Platform = 'chatgpt' | 'claude' | 'gemini' | 'unknown';

// Normalized message (output of parsers)
export const NormalizedMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.number(), // Unix timestamp
  index: z.number(), // Position in conversation
  hash: z.string(), // SHA-256 of normalized content
  attachments: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

// Normalized conversation (collection of messages)
export const NormalizedConversationSchema = z.object({
  conversation_id: z.string(),
  platform: z.enum(['chatgpt', 'claude', 'gemini', 'unknown']),
  title: z.string(),
  created_at: z.number(), // Unix timestamp
  updated_at: z.number().optional(),
  messages: z.array(NormalizedMessageSchema),
  metadata: z.record(z.any()).optional(),
});

export type NormalizedConversation = z.infer<typeof NormalizedConversationSchema>;

// Parse result
export const ParseResultSchema = z.object({
  conversations: z.array(NormalizedConversationSchema),
  platform: z.enum(['chatgpt', 'claude', 'gemini', 'unknown']),
  source_file: z.string(),
  stats: z.object({
    total_conversations: z.number(),
    total_messages: z.number(),
    user_messages: z.number(),
    assistant_messages: z.number(),
    system_messages: z.number(),
    parse_errors: z.number(),
  }),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;

// Parser interface
export interface ChatParser {
  platform: Platform;
  parse(data: unknown, sourceFile: string): Promise<ParseResult>;
  canParse(data: unknown): boolean;
}

// Import configuration
export const ImportConfigSchema = z.object({
  // Role & length filters
  sources_role_subset: z.enum(['user', 'assistant', 'both']).default('user'),
  sources_min_chars_user: z.number().default(400),
  sources_min_chars_assistant: z.number().default(400),

  // Grouping strategy
  sources_stitch_strategy: z.enum(['by_title', 'by_chat', 'by_chat_role']).default('by_title'),
  sources_preserve_chat_integrity: z.boolean().default(true),
  sources_cap: z.number().default(150),

  // Duplication policy
  sources_attach_mode: z.enum(['non-unique', 'unique']).default('non-unique'),
  similarity_threshold: z.number().min(0).max(1).default(0.35),

  // Code extraction
  export_code: z.boolean().default(true),
  code_global_dedupe: z.boolean().default(true),
  code_min_chars: z.number().default(50),

  // Output format
  sources_export_format: z.enum(['md', 'txt', 'json']).default('md'),
  include_assistant_context: z.boolean().default(false),

  // Duplicate detection
  duplicate_detection_enabled: z.boolean().default(false),
  duplicate_exact_match: z.boolean().default(true),
  duplicate_similarity_threshold: z.number().min(0).max(1).default(0.85),
  duplicate_cross_conversation: z.boolean().default(true),
  duplicate_algorithm: z.enum(['jaccard', 'levenshtein', 'cosine', 'embedding']).default('jaccard'),
  duplicate_normalize_tokens: z.boolean().default(true),
  duplicate_min_token_overlap: z.number().default(5),
  duplicate_length_ratio_tolerance: z.number().min(0).max(1).default(0.2),
  duplicate_ignore_whitespace: z.boolean().default(true),
  duplicate_ignore_case: z.boolean().default(false),
  duplicate_ignore_timestamp: z.boolean().default(true),
  duplicate_require_review: z.boolean().default(true),
  duplicate_auto_approve_exact: z.boolean().default(false),
  duplicate_auto_merge_threshold: z.number().min(0).max(1).default(0.95),
});

export type ImportConfig = z.infer<typeof ImportConfigSchema>;

// User segment (for Sources Mode stitching)
export const UserSegmentSchema = z.object({
  segment_id: z.string(),
  conversation_id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  hash: z.string(),
  char_count: z.number(),
  timestamp: z.number(),
  message_idx_start: z.number(),
  message_idx_end: z.number(),
  original_title: z.string(),
});

export type UserSegment = z.infer<typeof UserSegmentSchema>;

// Stitched source document
export const SourceDocSchema = z.object({
  source_id: z.string(),
  canonical_title: z.string(),
  content_markdown: z.string(),
  segments: z.array(z.string()), // segment IDs
  n_segments: z.number(),
  n_chars: z.number(),
  created_ts_min: z.number(),
  created_ts_max: z.number(),
  provenance: z.array(z.object({
    conversation_id: z.string(),
    message_idx_start: z.number(),
    message_idx_end: z.number(),
    timestamp_min: z.number(),
    timestamp_max: z.number(),
    original_title: z.string(),
  })),
});

export type SourceDoc = z.infer<typeof SourceDocSchema>;

// Code asset
export const CodeAssetSchema = z.object({
  id: z.string(),
  language: z.string(),
  ext: z.string(), // without leading dot
  code: z.string(),
  hash: z.string(),
  derived_from_message_id: z.string(),
  conversation_id: z.string(),
  timestamp: z.number(),
});

export type CodeAsset = z.infer<typeof CodeAssetSchema>;

// Jaccard similarity token set
export interface TokenSet {
  tokens: Set<string>;
  text: string;
}
