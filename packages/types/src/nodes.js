"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeBlockNodeSchema = exports.MessageNodeSchema = exports.ChatThreadSchema = exports.UserNodeSchema = exports.ConstellationSchema = exports.UnifiedDocSchema = exports.ObjectiveClaimSchema = exports.FolderNodeSchema = exports.GroupNodeSchema = exports.SourceNodeSchema = exports.BaseNodeSchema = void 0;
const zod_1 = require("zod");
// Base node schema
exports.BaseNodeSchema = zod_1.z.object({
    id: zod_1.z.string(),
    kind: zod_1.z.string(),
    created_at: zod_1.z.number(), // Unix timestamp
    updated_at: zod_1.z.number(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// Source node
exports.SourceNodeSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('Source'),
    url: zod_1.z.string().optional(),
    file_path: zod_1.z.string().optional(),
    fingerprint: zod_1.z.string(), // Content hash
    mime_type: zod_1.z.string(),
    size_bytes: zod_1.z.number(),
    title: zod_1.z.string().optional(),
    content_location: zod_1.z.string().optional(), // e.g., "local://documents/sources/{id}.md"
    provenance: zod_1.z.object({
        origin: zod_1.z.string(),
        retrieved_at: zod_1.z.number().optional(),
        attested: zod_1.z.boolean().default(false),
    }).optional(),
});
// Group node
exports.GroupNodeSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('Group'),
    name: zod_1.z.string(),
    purpose: zod_1.z.string().optional(),
    member_count: zod_1.z.number().default(0),
    trust_metrics: zod_1.z.object({
        objectivity: zod_1.z.number().min(0).max(1).optional(),
        subjectivity: zod_1.z.number().min(0).max(1).optional(),
        verification_ratio: zod_1.z.number().min(0).max(1).optional(),
    }).optional(),
});
// Folder node
exports.FolderNodeSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('Folder'),
    name: zod_1.z.string(),
    parent_id: zod_1.z.string().optional(),
});
// ObjectiveClaim node
exports.ObjectiveClaimSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('ObjectiveClaim'),
    claim_text: zod_1.z.string(),
    type: zod_1.z.enum(['fact', 'endpoint', 'parameter', 'definition', 'metric', 'config']),
    status: zod_1.z.enum(['unverified', 'verified', 'contested', 'stale']).default('unverified'),
    confidence: zod_1.z.number().min(0).max(1).default(0.4),
    citations: zod_1.z.array(zod_1.z.object({
        node_id: zod_1.z.string(),
        span: zod_1.z.string().optional(), // e.g., "p3:s12-34"
    })),
    supports: zod_1.z.array(zod_1.z.string()).default([]), // claim IDs
    contradicts: zod_1.z.array(zod_1.z.string()).default([]), // claim IDs
});
// UnifiedDoc node
exports.UnifiedDocSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('UnifiedDoc'),
    title: zod_1.z.string(),
    ring: zod_1.z.enum(['L0', 'L1', 'L2', 'L3']),
    content_markdown: zod_1.z.string().optional(), // Optional when content_location is used
    content_location: zod_1.z.string().optional(), // e.g., "local://documents/unified/{id}.md"
    token_count: zod_1.z.number(),
    citations: zod_1.z.array(zod_1.z.object({
        node_id: zod_1.z.string(),
        span: zod_1.z.string().optional(),
    })),
    claims_index: zod_1.z.array(zod_1.z.string()), // claim IDs
});
// Constellation (aggregated view)
exports.ConstellationSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('Constellation'),
    members: zod_1.z.array(zod_1.z.string()), // node IDs
    centroid: zod_1.z.object({
        x: zod_1.z.number(),
        y: zod_1.z.number(),
        z: zod_1.z.number().optional(),
    }),
    metric: zod_1.z.string(), // e.g., "provenance", "semantic"
    collapsed: zod_1.z.boolean().default(true),
});
// UserNode
exports.UserNodeSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('UserNode'),
    email: zod_1.z.string().email(),
    name: zod_1.z.string(),
    preferences: zod_1.z.record(zod_1.z.any()).optional(),
    policies: zod_1.z.record(zod_1.z.any()).optional(),
});
// ChatThread
exports.ChatThreadSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('ChatThread'),
    title: zod_1.z.string(),
    system_preamble: zod_1.z.string().optional(),
    persona: zod_1.z.object({
        name: zod_1.z.string(),
        model: zod_1.z.string(),
        tools_allowed: zod_1.z.array(zod_1.z.string()),
    }).optional(),
});
// Message node
exports.MessageNodeSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('Message'),
    role: zod_1.z.enum(['user', 'assistant', 'system']),
    content: zod_1.z.string().optional(), // Optional when content_location is used
    content_location: zod_1.z.string().optional(), // e.g., "local://documents/messages/{conv_id}/{msg_id}.md"
    content_hash: zod_1.z.string().optional(), // SHA256 hash for deduplication
    char_count: zod_1.z.number().optional(),
    thread_id: zod_1.z.string(),
    timestamp: zod_1.z.number(),
    attachments: zod_1.z.array(zod_1.z.string()).optional(), // file IDs
});
// CodeBlock node (stored as Source subtype)
exports.CodeBlockNodeSchema = exports.BaseNodeSchema.extend({
    kind: zod_1.z.literal('CodeBlock'),
    language: zod_1.z.string(),
    code: zod_1.z.string().optional(), // Optional when content_location is used
    content_location: zod_1.z.string().optional(), // e.g., "local://documents/code/{id}.{ext}"
    content_hash: zod_1.z.string(),
    line_count: zod_1.z.number(),
    char_count: zod_1.z.number(),
    is_fenced: zod_1.z.boolean().default(true),
    has_comments: zod_1.z.boolean().default(false),
    derived_from_message_id: zod_1.z.string().optional(),
});
//# sourceMappingURL=nodes.js.map