"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetEventSchema = exports.UsageMeterSchema = exports.BoardSchema = exports.WorkspaceSchema = exports.PlanTierSchema = void 0;
const zod_1 = require("zod");
// Plan tiers
exports.PlanTierSchema = zod_1.z.enum(['admin_debug', 'free', 'pro', 'business']);
// Workspace
exports.WorkspaceSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    plan: exports.PlanTierSchema,
    owner_id: zod_1.z.string(),
    created_at: zod_1.z.number(),
    updated_at: zod_1.z.number(),
    settings: zod_1.z.record(zod_1.z.any()).optional(),
});
// Board
exports.BoardSchema = zod_1.z.object({
    id: zod_1.z.string(),
    workspace_id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    created_at: zod_1.z.number(),
    updated_at: zod_1.z.number(),
    settings: zod_1.z.object({
        default_lens: zod_1.z.string().default('2D'),
        layout_seed: zod_1.z.number().optional(),
    }).optional(),
});
// UsageMeter (tracking costed actions)
exports.UsageMeterSchema = zod_1.z.object({
    workspace_id: zod_1.z.string(),
    period_start: zod_1.z.number(),
    period_end: zod_1.z.number(),
    counters: zod_1.z.object({
        llm_tokens: zod_1.z.number().default(0),
        verifier_runs: zod_1.z.number().default(0),
        api_calls: zod_1.z.number().default(0),
        storage_gb: zod_1.z.number().default(0),
        emails_sent: zod_1.z.number().default(0),
    }),
    updated_at: zod_1.z.number(),
});
// BudgetEvent (audit trail)
exports.BudgetEventSchema = zod_1.z.object({
    ts: zod_1.z.number(),
    workspace_id: zod_1.z.string(),
    actor: zod_1.z.string(), // user ID
    action: zod_1.z.string(),
    reason: zod_1.z.string(),
    plan: exports.PlanTierSchema,
    policy: zod_1.z.string().optional(),
    receipt_id: zod_1.z.string().optional(),
});
//# sourceMappingURL=plans.js.map