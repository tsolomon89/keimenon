import { z } from 'zod';
export declare const LimitsPolicySchema: z.ZodObject<{
    max_file_size_mb: z.ZodDefault<z.ZodNumber>;
    allowed_mime_types: z.ZodArray<z.ZodString, "many">;
    daily_ingest_limit: z.ZodDefault<z.ZodNumber>;
    max_sources: z.ZodDefault<z.ZodNumber>;
    max_nodes: z.ZodDefault<z.ZodNumber>;
    max_groups: z.ZodDefault<z.ZodNumber>;
    storage_gb: z.ZodDefault<z.ZodNumber>;
    upload_rate_limit_per_min: z.ZodDefault<z.ZodNumber>;
    chat_calls_per_day: z.ZodDefault<z.ZodNumber>;
    embedding_calls_per_day: z.ZodDefault<z.ZodNumber>;
    verifier_runs_per_day: z.ZodDefault<z.ZodNumber>;
    compute_timeout_ms: z.ZodDefault<z.ZodNumber>;
    max_concurrency: z.ZodDefault<z.ZodNumber>;
    retention_days: z.ZodDefault<z.ZodNumber>;
    lenses_enabled: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    doc_targets_tokens: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
    fallback_when_exceeded: z.ZodDefault<z.ZodString>;
    overage_circuit_breaker: z.ZodObject<{
        storage_pct: z.ZodDefault<z.ZodNumber>;
        node_pct: z.ZodDefault<z.ZodNumber>;
        requests_per_min: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        storage_pct: number;
        node_pct: number;
        requests_per_min: number;
    }, {
        storage_pct?: number | undefined;
        node_pct?: number | undefined;
        requests_per_min?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    max_file_size_mb: number;
    allowed_mime_types: string[];
    daily_ingest_limit: number;
    max_sources: number;
    max_nodes: number;
    max_groups: number;
    storage_gb: number;
    upload_rate_limit_per_min: number;
    chat_calls_per_day: number;
    embedding_calls_per_day: number;
    verifier_runs_per_day: number;
    compute_timeout_ms: number;
    max_concurrency: number;
    retention_days: number;
    lenses_enabled: string[];
    doc_targets_tokens: number[];
    fallback_when_exceeded: string;
    overage_circuit_breaker: {
        storage_pct: number;
        node_pct: number;
        requests_per_min: number;
    };
}, {
    allowed_mime_types: string[];
    overage_circuit_breaker: {
        storage_pct?: number | undefined;
        node_pct?: number | undefined;
        requests_per_min?: number | undefined;
    };
    max_file_size_mb?: number | undefined;
    daily_ingest_limit?: number | undefined;
    max_sources?: number | undefined;
    max_nodes?: number | undefined;
    max_groups?: number | undefined;
    storage_gb?: number | undefined;
    upload_rate_limit_per_min?: number | undefined;
    chat_calls_per_day?: number | undefined;
    embedding_calls_per_day?: number | undefined;
    verifier_runs_per_day?: number | undefined;
    compute_timeout_ms?: number | undefined;
    max_concurrency?: number | undefined;
    retention_days?: number | undefined;
    lenses_enabled?: string[] | undefined;
    doc_targets_tokens?: number[] | undefined;
    fallback_when_exceeded?: string | undefined;
}>;
export type LimitsPolicy = z.infer<typeof LimitsPolicySchema>;
export declare const EntitlementSchema: z.ZodObject<{
    plan: z.ZodEnum<["admin_debug", "free", "pro", "business"]>;
    features: z.ZodObject<{
        ingest_files: z.ZodBoolean;
        autogroup: z.ZodBoolean;
        sequester: z.ZodBoolean;
        constellations: z.ZodBoolean;
        lenses: z.ZodArray<z.ZodString, "many">;
        chat_models: z.ZodArray<z.ZodString, "many">;
        verification_tools: z.ZodArray<z.ZodString, "many">;
        unified_doc_targets: z.ZodArray<z.ZodNumber, "many">;
        crm: z.ZodBoolean;
        email_send: z.ZodBoolean;
        webhooks: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        ingest_files: boolean;
        autogroup: boolean;
        sequester: boolean;
        constellations: boolean;
        lenses: string[];
        chat_models: string[];
        verification_tools: string[];
        unified_doc_targets: number[];
        crm: boolean;
        email_send: boolean;
        webhooks: boolean;
    }, {
        ingest_files: boolean;
        autogroup: boolean;
        sequester: boolean;
        constellations: boolean;
        lenses: string[];
        chat_models: string[];
        verification_tools: string[];
        unified_doc_targets: number[];
        crm: boolean;
        email_send: boolean;
        webhooks: boolean;
    }>;
    quotas: z.ZodObject<{
        sources: z.ZodNumber;
        groups: z.ZodNumber;
        nodes: z.ZodNumber;
        storage_gb: z.ZodNumber;
        llm_tokens_month: z.ZodNumber;
        verifier_runs_day: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        storage_gb: number;
        sources: number;
        groups: number;
        nodes: number;
        llm_tokens_month: number;
        verifier_runs_day: number;
    }, {
        storage_gb: number;
        sources: number;
        groups: number;
        nodes: number;
        llm_tokens_month: number;
        verifier_runs_day: number;
    }>;
}, "strip", z.ZodTypeAny, {
    plan: "admin_debug" | "free" | "pro" | "business";
    features: {
        ingest_files: boolean;
        autogroup: boolean;
        sequester: boolean;
        constellations: boolean;
        lenses: string[];
        chat_models: string[];
        verification_tools: string[];
        unified_doc_targets: number[];
        crm: boolean;
        email_send: boolean;
        webhooks: boolean;
    };
    quotas: {
        storage_gb: number;
        sources: number;
        groups: number;
        nodes: number;
        llm_tokens_month: number;
        verifier_runs_day: number;
    };
}, {
    plan: "admin_debug" | "free" | "pro" | "business";
    features: {
        ingest_files: boolean;
        autogroup: boolean;
        sequester: boolean;
        constellations: boolean;
        lenses: string[];
        chat_models: string[];
        verification_tools: string[];
        unified_doc_targets: number[];
        crm: boolean;
        email_send: boolean;
        webhooks: boolean;
    };
    quotas: {
        storage_gb: number;
        sources: number;
        groups: number;
        nodes: number;
        llm_tokens_month: number;
        verifier_runs_day: number;
    };
}>;
export type Entitlement = z.infer<typeof EntitlementSchema>;
export declare const ModelPolicySchema: z.ZodObject<{
    allow: z.ZodArray<z.ZodString, "many">;
    deny: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    max_tokens: z.ZodOptional<z.ZodNumber>;
    max_cost_usd: z.ZodOptional<z.ZodNumber>;
    tool_permit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    pii_rules: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    allow: string[];
    deny: string[];
    tool_permit: string[];
    max_tokens?: number | undefined;
    max_cost_usd?: number | undefined;
    pii_rules?: Record<string, any> | undefined;
}, {
    allow: string[];
    deny?: string[] | undefined;
    max_tokens?: number | undefined;
    max_cost_usd?: number | undefined;
    tool_permit?: string[] | undefined;
    pii_rules?: Record<string, any> | undefined;
}>;
export type ModelPolicy = z.infer<typeof ModelPolicySchema>;
export declare const SequesterReasonSchema: z.ZodEnum<["secret", "noisy", "untrusted", "license", "work_in_progress"]>;
export type SequesterReason = z.infer<typeof SequesterReasonSchema>;
//# sourceMappingURL=policies.d.ts.map