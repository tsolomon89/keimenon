import { z } from 'zod';

// LimitsPolicy (per-plan enforcement)
export const LimitsPolicySchema = z.object({
  max_file_size_mb: z.number().default(10),
  allowed_mime_types: z.array(z.string()),
  daily_ingest_limit: z.number().default(50),
  max_sources: z.number().default(500),
  max_nodes: z.number().default(20000),
  max_groups: z.number().default(50),
  storage_gb: z.number().default(5),
  upload_rate_limit_per_min: z.number().default(5),
  chat_calls_per_day: z.number().default(0),
  embedding_calls_per_day: z.number().default(0),
  verifier_runs_per_day: z.number().default(0),
  compute_timeout_ms: z.number().default(8000),
  max_concurrency: z.number().default(2),
  retention_days: z.number().default(30),
  lenses_enabled: z.array(z.string()).default(['2D']),
  doc_targets_tokens: z.array(z.number()).default([5000]),
  fallback_when_exceeded: z.string().default('block_then_prompt_upgrade'),
  overage_circuit_breaker: z.object({
    storage_pct: z.number().default(95),
    node_pct: z.number().default(95),
    requests_per_min: z.number().default(120),
  }),
});

export type LimitsPolicy = z.infer<typeof LimitsPolicySchema>;

// Entitlement (feature flags + quotas per plan)
export const EntitlementSchema = z.object({
  plan: z.enum(['admin_debug', 'free', 'pro', 'business']),
  features: z.object({
    ingest_files: z.boolean(),
    autogroup: z.boolean(),
    sequester: z.boolean(),
    constellations: z.boolean(),
    lenses: z.array(z.string()), // ['2D', '3D', 'Galaxy', etc.]
    chat_models: z.array(z.string()),
    verification_tools: z.array(z.string()),
    unified_doc_targets: z.array(z.number()),
    crm: z.boolean(),
    email_send: z.boolean(),
    webhooks: z.boolean(),
  }),
  quotas: z.object({
    sources: z.number(),
    groups: z.number(),
    nodes: z.number(),
    storage_gb: z.number(),
    llm_tokens_month: z.number(),
    verifier_runs_day: z.number(),
  }),
});

export type Entitlement = z.infer<typeof EntitlementSchema>;

// ModelPolicy (model access + cost caps)
export const ModelPolicySchema = z.object({
  allow: z.array(z.string()), // Model IDs
  deny: z.array(z.string()).default([]),
  max_tokens: z.number().optional(),
  max_cost_usd: z.number().optional(),
  tool_permit: z.array(z.string()).default([]),
  pii_rules: z.record(z.any()).optional(),
});

export type ModelPolicy = z.infer<typeof ModelPolicySchema>;

// SequesterPolicy reasons
export const SequesterReasonSchema = z.enum([
  'secret',
  'noisy',
  'untrusted',
  'license',
  'work_in_progress',
]);

export type SequesterReason = z.infer<typeof SequesterReasonSchema>;
