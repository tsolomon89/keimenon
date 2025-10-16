"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequesterReasonSchema = exports.ModelPolicySchema = exports.EntitlementSchema = exports.LimitsPolicySchema = void 0;
const zod_1 = require("zod");
// LimitsPolicy (per-plan enforcement)
exports.LimitsPolicySchema = zod_1.z.object({
    max_file_size_mb: zod_1.z.number().default(10),
    allowed_mime_types: zod_1.z.array(zod_1.z.string()),
    daily_ingest_limit: zod_1.z.number().default(50),
    max_sources: zod_1.z.number().default(500),
    max_nodes: zod_1.z.number().default(20000),
    max_groups: zod_1.z.number().default(50),
    storage_gb: zod_1.z.number().default(5),
    upload_rate_limit_per_min: zod_1.z.number().default(5),
    chat_calls_per_day: zod_1.z.number().default(0),
    embedding_calls_per_day: zod_1.z.number().default(0),
    verifier_runs_per_day: zod_1.z.number().default(0),
    compute_timeout_ms: zod_1.z.number().default(8000),
    max_concurrency: zod_1.z.number().default(2),
    retention_days: zod_1.z.number().default(30),
    lenses_enabled: zod_1.z.array(zod_1.z.string()).default(['2D']),
    doc_targets_tokens: zod_1.z.array(zod_1.z.number()).default([5000]),
    fallback_when_exceeded: zod_1.z.string().default('block_then_prompt_upgrade'),
    overage_circuit_breaker: zod_1.z.object({
        storage_pct: zod_1.z.number().default(95),
        node_pct: zod_1.z.number().default(95),
        requests_per_min: zod_1.z.number().default(120),
    }),
});
// Entitlement (feature flags + quotas per plan)
exports.EntitlementSchema = zod_1.z.object({
    plan: zod_1.z.enum(['admin_debug', 'free', 'pro', 'business']),
    features: zod_1.z.object({
        ingest_files: zod_1.z.boolean(),
        autogroup: zod_1.z.boolean(),
        sequester: zod_1.z.boolean(),
        constellations: zod_1.z.boolean(),
        lenses: zod_1.z.array(zod_1.z.string()), // ['2D', '3D', 'Galaxy', etc.]
        chat_models: zod_1.z.array(zod_1.z.string()),
        verification_tools: zod_1.z.array(zod_1.z.string()),
        unified_doc_targets: zod_1.z.array(zod_1.z.number()),
        crm: zod_1.z.boolean(),
        email_send: zod_1.z.boolean(),
        webhooks: zod_1.z.boolean(),
    }),
    quotas: zod_1.z.object({
        sources: zod_1.z.number(),
        groups: zod_1.z.number(),
        nodes: zod_1.z.number(),
        storage_gb: zod_1.z.number(),
        llm_tokens_month: zod_1.z.number(),
        verifier_runs_day: zod_1.z.number(),
    }),
});
// ModelPolicy (model access + cost caps)
exports.ModelPolicySchema = zod_1.z.object({
    allow: zod_1.z.array(zod_1.z.string()), // Model IDs
    deny: zod_1.z.array(zod_1.z.string()).default([]),
    max_tokens: zod_1.z.number().optional(),
    max_cost_usd: zod_1.z.number().optional(),
    tool_permit: zod_1.z.array(zod_1.z.string()).default([]),
    pii_rules: zod_1.z.record(zod_1.z.any()).optional(),
});
// SequesterPolicy reasons
exports.SequesterReasonSchema = zod_1.z.enum([
    'secret',
    'noisy',
    'untrusted',
    'license',
    'work_in_progress',
]);
//# sourceMappingURL=policies.js.map