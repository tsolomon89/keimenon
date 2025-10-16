"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifiedByEdgeSchema = exports.SupportsRefutesEdgeSchema = exports.EquivalentToEdgeSchema = exports.InScopeForEdgeSchema = exports.DerivesFromEdgeSchema = exports.SequestersEdgeSchema = exports.ContainsEdgeSchema = exports.BaseEdgeSchema = void 0;
const zod_1 = require("zod");
// Base edge schema
exports.BaseEdgeSchema = zod_1.z.object({
    id: zod_1.z.string(),
    kind: zod_1.z.string(),
    from: zod_1.z.string(), // node ID
    to: zod_1.z.string(), // node ID
    created_at: zod_1.z.number(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// CONTAINS edge (Group -> Source/Message/Claim/Doc/Folder)
exports.ContainsEdgeSchema = exports.BaseEdgeSchema.extend({
    kind: zod_1.z.literal('CONTAINS'),
    rank: zod_1.z.number().optional(),
});
// SEQUESTERS edge (with policy flags)
exports.SequestersEdgeSchema = exports.BaseEdgeSchema.extend({
    kind: zod_1.z.literal('SEQUESTERS'),
    hidden_from_llm: zod_1.z.boolean().default(false),
    hidden_from_tools: zod_1.z.boolean().default(false),
    ui_only: zod_1.z.boolean().default(false),
    reason: zod_1.z.enum(['secret', 'noisy', 'untrusted', 'license', 'work_in_progress']),
    until: zod_1.z.string().optional(), // ISO date string
});
// DERIVES_FROM edge (with span/citation info)
exports.DerivesFromEdgeSchema = exports.BaseEdgeSchema.extend({
    kind: zod_1.z.literal('DERIVES_FROM'),
    span: zod_1.z.string().optional(), // e.g., "p3:s12-34" or "line:42-58"
    confidence: zod_1.z.number().min(0).max(1).optional(),
});
// IN_SCOPE_FOR edge
exports.InScopeForEdgeSchema = exports.BaseEdgeSchema.extend({
    kind: zod_1.z.literal('IN_SCOPE_FOR'),
    rank: zod_1.z.number().optional(),
    policy_chips: zod_1.z.array(zod_1.z.string()).optional(),
});
// EQUIVALENT_TO / DUP_OF edge
exports.EquivalentToEdgeSchema = exports.BaseEdgeSchema.extend({
    kind: zod_1.z.enum(['EQUIVALENT_TO', 'DUP_OF']),
    score: zod_1.z.number().min(0).max(1),
    canonical: zod_1.z.string(), // ID of canonical node
});
// SUPPORTS / REFUTES edge (claim relationships)
exports.SupportsRefutesEdgeSchema = exports.BaseEdgeSchema.extend({
    kind: zod_1.z.enum(['SUPPORTS', 'REFUTES']),
    strength: zod_1.z.number().min(0).max(1).optional(),
});
// VERIFIED_BY edge
exports.VerifiedByEdgeSchema = exports.BaseEdgeSchema.extend({
    kind: zod_1.z.literal('VERIFIED_BY'),
    verifier_run_id: zod_1.z.string(),
    status: zod_1.z.enum(['pass', 'fail', 'inconclusive']),
    artifacts: zod_1.z.record(zod_1.z.any()).optional(),
    expires_at: zod_1.z.number().optional(),
});
//# sourceMappingURL=edges.js.map