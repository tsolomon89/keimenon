"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifierRunSchema = exports.AgentRunSchema = exports.ReceiptSchema = exports.ScopeSetSchema = void 0;
const zod_1 = require("zod");
// ScopeSet (concrete, reproducible context)
exports.ScopeSetSchema = zod_1.z.object({
    id: zod_1.z.string(),
    board_id: zod_1.z.string(),
    scope_nodes: zod_1.z.array(zod_1.z.string()), // node IDs
    policy: zod_1.z.object({
        exclude_sequestered: zod_1.z.boolean().default(true),
        include_edges: zod_1.z.boolean().default(true),
    }),
    created_at: zod_1.z.number(),
});
// Receipt (snapshot for reproducibility)
exports.ReceiptSchema = zod_1.z.object({
    id: zod_1.z.string(),
    board_id: zod_1.z.string(),
    scope_nodes: zod_1.z.array(zod_1.z.string()),
    policy: zod_1.z.object({
        exclude_sequestered: zod_1.z.boolean(),
    }),
    lens: zod_1.z.object({
        metric: zod_1.z.string(), // e.g., "provenance", "semantic", "verification"
        seed: zod_1.z.number().optional(),
    }).optional(),
    ranker: zod_1.z.object({
        order: zod_1.z.array(zod_1.z.string()), // e.g., ["policy", "citation", "freshness", "authority", "embedding"]
    }).optional(),
    model: zod_1.z.string().optional(),
    timestamp: zod_1.z.number(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// AgentRun (execution record)
exports.AgentRunSchema = zod_1.z.object({
    run_id: zod_1.z.string(),
    agent_id: zod_1.z.string(),
    scope_id: zod_1.z.string(),
    receipt_id: zod_1.z.string().optional(),
    budget: zod_1.z.object({
        max_tokens: zod_1.z.number(),
        max_cost_usd: zod_1.z.number(),
        timeout_s: zod_1.z.number(),
    }),
    plan: zod_1.z.array(zod_1.z.string()), // steps
    artifacts: zod_1.z.array(zod_1.z.object({
        kind: zod_1.z.string(),
        ref: zod_1.z.string(),
    })),
    events: zod_1.z.array(zod_1.z.object({
        ts: zod_1.z.number(),
        level: zod_1.z.enum(['info', 'warn', 'error']),
        msg: zod_1.z.string(),
    })),
    status: zod_1.z.enum(['success', 'error', 'partial']),
    error: zod_1.z.string().optional(),
    started_at: zod_1.z.number(),
    completed_at: zod_1.z.number().optional(),
});
// VerifierRun
exports.VerifierRunSchema = zod_1.z.object({
    run_id: zod_1.z.string(),
    kind: zod_1.z.enum(['HTTP_CHECK', 'SCHEMA_MATCH', 'EXAMPLE_CALL', 'COMPUTATION', 'UNIT_TEST', 'REPRO_NOTEBOOK', 'PROOF_ASSISTANT']),
    claim_ids: zod_1.z.array(zod_1.z.string()),
    inputs: zod_1.z.record(zod_1.z.any()),
    outputs: zod_1.z.record(zod_1.z.any()).optional(),
    status: zod_1.z.enum(['pass', 'fail', 'inconclusive']),
    artifacts: zod_1.z.record(zod_1.z.any()).optional(),
    expires_at: zod_1.z.number().optional(),
    created_at: zod_1.z.number(),
});
//# sourceMappingURL=receipts.js.map