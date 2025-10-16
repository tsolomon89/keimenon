import { z } from 'zod';
export declare const BaseNodeSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: string;
    created_at: number;
    updated_at: number;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    kind: string;
    created_at: number;
    updated_at: number;
    metadata?: Record<string, any> | undefined;
}>;
export type BaseNode = z.infer<typeof BaseNodeSchema>;
export declare const SourceNodeSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"Source">;
    url: z.ZodOptional<z.ZodString>;
    file_path: z.ZodOptional<z.ZodString>;
    fingerprint: z.ZodString;
    mime_type: z.ZodString;
    size_bytes: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    content_location: z.ZodOptional<z.ZodString>;
    provenance: z.ZodOptional<z.ZodObject<{
        origin: z.ZodString;
        retrieved_at: z.ZodOptional<z.ZodNumber>;
        attested: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        origin: string;
        attested: boolean;
        retrieved_at?: number | undefined;
    }, {
        origin: string;
        retrieved_at?: number | undefined;
        attested?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "Source";
    created_at: number;
    updated_at: number;
    fingerprint: string;
    mime_type: string;
    size_bytes: number;
    metadata?: Record<string, any> | undefined;
    url?: string | undefined;
    file_path?: string | undefined;
    title?: string | undefined;
    content_location?: string | undefined;
    provenance?: {
        origin: string;
        attested: boolean;
        retrieved_at?: number | undefined;
    } | undefined;
}, {
    id: string;
    kind: "Source";
    created_at: number;
    updated_at: number;
    fingerprint: string;
    mime_type: string;
    size_bytes: number;
    metadata?: Record<string, any> | undefined;
    url?: string | undefined;
    file_path?: string | undefined;
    title?: string | undefined;
    content_location?: string | undefined;
    provenance?: {
        origin: string;
        retrieved_at?: number | undefined;
        attested?: boolean | undefined;
    } | undefined;
}>;
export type SourceNode = z.infer<typeof SourceNodeSchema>;
export declare const GroupNodeSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"Group">;
    name: z.ZodString;
    purpose: z.ZodOptional<z.ZodString>;
    member_count: z.ZodDefault<z.ZodNumber>;
    trust_metrics: z.ZodOptional<z.ZodObject<{
        objectivity: z.ZodOptional<z.ZodNumber>;
        subjectivity: z.ZodOptional<z.ZodNumber>;
        verification_ratio: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        objectivity?: number | undefined;
        subjectivity?: number | undefined;
        verification_ratio?: number | undefined;
    }, {
        objectivity?: number | undefined;
        subjectivity?: number | undefined;
        verification_ratio?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "Group";
    created_at: number;
    updated_at: number;
    name: string;
    member_count: number;
    metadata?: Record<string, any> | undefined;
    purpose?: string | undefined;
    trust_metrics?: {
        objectivity?: number | undefined;
        subjectivity?: number | undefined;
        verification_ratio?: number | undefined;
    } | undefined;
}, {
    id: string;
    kind: "Group";
    created_at: number;
    updated_at: number;
    name: string;
    metadata?: Record<string, any> | undefined;
    purpose?: string | undefined;
    member_count?: number | undefined;
    trust_metrics?: {
        objectivity?: number | undefined;
        subjectivity?: number | undefined;
        verification_ratio?: number | undefined;
    } | undefined;
}>;
export type GroupNode = z.infer<typeof GroupNodeSchema>;
export declare const FolderNodeSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"Folder">;
    name: z.ZodString;
    parent_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "Folder";
    created_at: number;
    updated_at: number;
    name: string;
    metadata?: Record<string, any> | undefined;
    parent_id?: string | undefined;
}, {
    id: string;
    kind: "Folder";
    created_at: number;
    updated_at: number;
    name: string;
    metadata?: Record<string, any> | undefined;
    parent_id?: string | undefined;
}>;
export type FolderNode = z.infer<typeof FolderNodeSchema>;
export declare const ObjectiveClaimSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"ObjectiveClaim">;
    claim_text: z.ZodString;
    type: z.ZodEnum<["fact", "endpoint", "parameter", "definition", "metric", "config"]>;
    status: z.ZodDefault<z.ZodEnum<["unverified", "verified", "contested", "stale"]>>;
    confidence: z.ZodDefault<z.ZodNumber>;
    citations: z.ZodArray<z.ZodObject<{
        node_id: z.ZodString;
        span: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        node_id: string;
        span?: string | undefined;
    }, {
        node_id: string;
        span?: string | undefined;
    }>, "many">;
    supports: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    contradicts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "ObjectiveClaim";
    created_at: number;
    updated_at: number;
    type: "fact" | "endpoint" | "parameter" | "definition" | "metric" | "config";
    status: "unverified" | "verified" | "contested" | "stale";
    claim_text: string;
    confidence: number;
    citations: {
        node_id: string;
        span?: string | undefined;
    }[];
    supports: string[];
    contradicts: string[];
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    kind: "ObjectiveClaim";
    created_at: number;
    updated_at: number;
    type: "fact" | "endpoint" | "parameter" | "definition" | "metric" | "config";
    claim_text: string;
    citations: {
        node_id: string;
        span?: string | undefined;
    }[];
    metadata?: Record<string, any> | undefined;
    status?: "unverified" | "verified" | "contested" | "stale" | undefined;
    confidence?: number | undefined;
    supports?: string[] | undefined;
    contradicts?: string[] | undefined;
}>;
export type ObjectiveClaim = z.infer<typeof ObjectiveClaimSchema>;
export declare const UnifiedDocSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"UnifiedDoc">;
    title: z.ZodString;
    ring: z.ZodEnum<["L0", "L1", "L2", "L3"]>;
    content_markdown: z.ZodOptional<z.ZodString>;
    content_location: z.ZodOptional<z.ZodString>;
    token_count: z.ZodNumber;
    citations: z.ZodArray<z.ZodObject<{
        node_id: z.ZodString;
        span: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        node_id: string;
        span?: string | undefined;
    }, {
        node_id: string;
        span?: string | undefined;
    }>, "many">;
    claims_index: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "UnifiedDoc";
    created_at: number;
    updated_at: number;
    title: string;
    citations: {
        node_id: string;
        span?: string | undefined;
    }[];
    ring: "L0" | "L1" | "L2" | "L3";
    token_count: number;
    claims_index: string[];
    metadata?: Record<string, any> | undefined;
    content_location?: string | undefined;
    content_markdown?: string | undefined;
}, {
    id: string;
    kind: "UnifiedDoc";
    created_at: number;
    updated_at: number;
    title: string;
    citations: {
        node_id: string;
        span?: string | undefined;
    }[];
    ring: "L0" | "L1" | "L2" | "L3";
    token_count: number;
    claims_index: string[];
    metadata?: Record<string, any> | undefined;
    content_location?: string | undefined;
    content_markdown?: string | undefined;
}>;
export type UnifiedDoc = z.infer<typeof UnifiedDocSchema>;
export declare const ConstellationSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"Constellation">;
    members: z.ZodArray<z.ZodString, "many">;
    centroid: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
        z?: number | undefined;
    }, {
        x: number;
        y: number;
        z?: number | undefined;
    }>;
    metric: z.ZodString;
    collapsed: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "Constellation";
    created_at: number;
    updated_at: number;
    metric: string;
    members: string[];
    centroid: {
        x: number;
        y: number;
        z?: number | undefined;
    };
    collapsed: boolean;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    kind: "Constellation";
    created_at: number;
    updated_at: number;
    metric: string;
    members: string[];
    centroid: {
        x: number;
        y: number;
        z?: number | undefined;
    };
    metadata?: Record<string, any> | undefined;
    collapsed?: boolean | undefined;
}>;
export type Constellation = z.infer<typeof ConstellationSchema>;
export declare const UserNodeSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"UserNode">;
    email: z.ZodString;
    name: z.ZodString;
    preferences: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    policies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "UserNode";
    created_at: number;
    updated_at: number;
    name: string;
    email: string;
    metadata?: Record<string, any> | undefined;
    preferences?: Record<string, any> | undefined;
    policies?: Record<string, any> | undefined;
}, {
    id: string;
    kind: "UserNode";
    created_at: number;
    updated_at: number;
    name: string;
    email: string;
    metadata?: Record<string, any> | undefined;
    preferences?: Record<string, any> | undefined;
    policies?: Record<string, any> | undefined;
}>;
export type UserNode = z.infer<typeof UserNodeSchema>;
export declare const ChatThreadSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"ChatThread">;
    title: z.ZodString;
    system_preamble: z.ZodOptional<z.ZodString>;
    persona: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        model: z.ZodString;
        tools_allowed: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        model: string;
        tools_allowed: string[];
    }, {
        name: string;
        model: string;
        tools_allowed: string[];
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "ChatThread";
    created_at: number;
    updated_at: number;
    title: string;
    metadata?: Record<string, any> | undefined;
    system_preamble?: string | undefined;
    persona?: {
        name: string;
        model: string;
        tools_allowed: string[];
    } | undefined;
}, {
    id: string;
    kind: "ChatThread";
    created_at: number;
    updated_at: number;
    title: string;
    metadata?: Record<string, any> | undefined;
    system_preamble?: string | undefined;
    persona?: {
        name: string;
        model: string;
        tools_allowed: string[];
    } | undefined;
}>;
export type ChatThread = z.infer<typeof ChatThreadSchema>;
export declare const MessageNodeSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"Message">;
    role: z.ZodEnum<["user", "assistant", "system"]>;
    content: z.ZodOptional<z.ZodString>;
    content_location: z.ZodOptional<z.ZodString>;
    content_hash: z.ZodOptional<z.ZodString>;
    char_count: z.ZodOptional<z.ZodNumber>;
    thread_id: z.ZodString;
    timestamp: z.ZodNumber;
    attachments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "Message";
    created_at: number;
    updated_at: number;
    role: "user" | "assistant" | "system";
    thread_id: string;
    timestamp: number;
    metadata?: Record<string, any> | undefined;
    content_location?: string | undefined;
    content?: string | undefined;
    content_hash?: string | undefined;
    char_count?: number | undefined;
    attachments?: string[] | undefined;
}, {
    id: string;
    kind: "Message";
    created_at: number;
    updated_at: number;
    role: "user" | "assistant" | "system";
    thread_id: string;
    timestamp: number;
    metadata?: Record<string, any> | undefined;
    content_location?: string | undefined;
    content?: string | undefined;
    content_hash?: string | undefined;
    char_count?: number | undefined;
    attachments?: string[] | undefined;
}>;
export type MessageNode = z.infer<typeof MessageNodeSchema>;
export declare const CodeBlockNodeSchema: z.ZodObject<{
    id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"CodeBlock">;
    language: z.ZodString;
    code: z.ZodOptional<z.ZodString>;
    content_location: z.ZodOptional<z.ZodString>;
    content_hash: z.ZodString;
    line_count: z.ZodNumber;
    char_count: z.ZodNumber;
    is_fenced: z.ZodDefault<z.ZodBoolean>;
    has_comments: z.ZodDefault<z.ZodBoolean>;
    derived_from_message_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "CodeBlock";
    created_at: number;
    updated_at: number;
    content_hash: string;
    char_count: number;
    language: string;
    line_count: number;
    is_fenced: boolean;
    has_comments: boolean;
    code?: string | undefined;
    metadata?: Record<string, any> | undefined;
    content_location?: string | undefined;
    derived_from_message_id?: string | undefined;
}, {
    id: string;
    kind: "CodeBlock";
    created_at: number;
    updated_at: number;
    content_hash: string;
    char_count: number;
    language: string;
    line_count: number;
    code?: string | undefined;
    metadata?: Record<string, any> | undefined;
    content_location?: string | undefined;
    is_fenced?: boolean | undefined;
    has_comments?: boolean | undefined;
    derived_from_message_id?: string | undefined;
}>;
export type CodeBlockNode = z.infer<typeof CodeBlockNodeSchema>;
export type AnyNode = SourceNode | GroupNode | FolderNode | ObjectiveClaim | UnifiedDoc | Constellation | UserNode | ChatThread | MessageNode | CodeBlockNode;
//# sourceMappingURL=nodes.d.ts.map