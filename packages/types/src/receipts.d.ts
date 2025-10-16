import { z } from 'zod';
export declare const ScopeSetSchema: z.ZodObject<{
    id: z.ZodString;
    board_id: z.ZodString;
    scope_nodes: z.ZodArray<z.ZodString, "many">;
    policy: z.ZodObject<{
        exclude_sequestered: z.ZodDefault<z.ZodBoolean>;
        include_edges: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        exclude_sequestered: boolean;
        include_edges: boolean;
    }, {
        exclude_sequestered?: boolean | undefined;
        include_edges?: boolean | undefined;
    }>;
    created_at: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: number;
    board_id: string;
    scope_nodes: string[];
    policy: {
        exclude_sequestered: boolean;
        include_edges: boolean;
    };
}, {
    id: string;
    created_at: number;
    board_id: string;
    scope_nodes: string[];
    policy: {
        exclude_sequestered?: boolean | undefined;
        include_edges?: boolean | undefined;
    };
}>;
export type ScopeSet = z.infer<typeof ScopeSetSchema>;
export declare const ReceiptSchema: z.ZodObject<{
    id: z.ZodString;
    board_id: z.ZodString;
    scope_nodes: z.ZodArray<z.ZodString, "many">;
    policy: z.ZodObject<{
        exclude_sequestered: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        exclude_sequestered: boolean;
    }, {
        exclude_sequestered: boolean;
    }>;
    lens: z.ZodOptional<z.ZodObject<{
        metric: z.ZodString;
        seed: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        metric: string;
        seed?: number | undefined;
    }, {
        metric: string;
        seed?: number | undefined;
    }>>;
    ranker: z.ZodOptional<z.ZodObject<{
        order: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        order: string[];
    }, {
        order: string[];
    }>>;
    model: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: number;
    board_id: string;
    scope_nodes: string[];
    policy: {
        exclude_sequestered: boolean;
    };
    metadata?: Record<string, any> | undefined;
    model?: string | undefined;
    lens?: {
        metric: string;
        seed?: number | undefined;
    } | undefined;
    ranker?: {
        order: string[];
    } | undefined;
}, {
    id: string;
    timestamp: number;
    board_id: string;
    scope_nodes: string[];
    policy: {
        exclude_sequestered: boolean;
    };
    metadata?: Record<string, any> | undefined;
    model?: string | undefined;
    lens?: {
        metric: string;
        seed?: number | undefined;
    } | undefined;
    ranker?: {
        order: string[];
    } | undefined;
}>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export declare const AgentRunSchema: z.ZodObject<{
    run_id: z.ZodString;
    agent_id: z.ZodString;
    scope_id: z.ZodString;
    receipt_id: z.ZodOptional<z.ZodString>;
    budget: z.ZodObject<{
        max_tokens: z.ZodNumber;
        max_cost_usd: z.ZodNumber;
        timeout_s: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        max_tokens: number;
        max_cost_usd: number;
        timeout_s: number;
    }, {
        max_tokens: number;
        max_cost_usd: number;
        timeout_s: number;
    }>;
    plan: z.ZodArray<z.ZodString, "many">;
    artifacts: z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        ref: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        ref: string;
    }, {
        kind: string;
        ref: string;
    }>, "many">;
    events: z.ZodArray<z.ZodObject<{
        ts: z.ZodNumber;
        level: z.ZodEnum<["info", "warn", "error"]>;
        msg: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        ts: number;
        level: "info" | "warn" | "error";
        msg: string;
    }, {
        ts: number;
        level: "info" | "warn" | "error";
        msg: string;
    }>, "many">;
    status: z.ZodEnum<["success", "error", "partial"]>;
    error: z.ZodOptional<z.ZodString>;
    started_at: z.ZodNumber;
    completed_at: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status: "error" | "success" | "partial";
    artifacts: {
        kind: string;
        ref: string;
    }[];
    plan: string[];
    run_id: string;
    agent_id: string;
    scope_id: string;
    budget: {
        max_tokens: number;
        max_cost_usd: number;
        timeout_s: number;
    };
    events: {
        ts: number;
        level: "info" | "warn" | "error";
        msg: string;
    }[];
    started_at: number;
    receipt_id?: string | undefined;
    error?: string | undefined;
    completed_at?: number | undefined;
}, {
    status: "error" | "success" | "partial";
    artifacts: {
        kind: string;
        ref: string;
    }[];
    plan: string[];
    run_id: string;
    agent_id: string;
    scope_id: string;
    budget: {
        max_tokens: number;
        max_cost_usd: number;
        timeout_s: number;
    };
    events: {
        ts: number;
        level: "info" | "warn" | "error";
        msg: string;
    }[];
    started_at: number;
    receipt_id?: string | undefined;
    error?: string | undefined;
    completed_at?: number | undefined;
}>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export declare const VerifierRunSchema: z.ZodObject<{
    run_id: z.ZodString;
    kind: z.ZodEnum<["HTTP_CHECK", "SCHEMA_MATCH", "EXAMPLE_CALL", "COMPUTATION", "UNIT_TEST", "REPRO_NOTEBOOK", "PROOF_ASSISTANT"]>;
    claim_ids: z.ZodArray<z.ZodString, "many">;
    inputs: z.ZodRecord<z.ZodString, z.ZodAny>;
    outputs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    status: z.ZodEnum<["pass", "fail", "inconclusive"]>;
    artifacts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    expires_at: z.ZodOptional<z.ZodNumber>;
    created_at: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    kind: "HTTP_CHECK" | "SCHEMA_MATCH" | "EXAMPLE_CALL" | "COMPUTATION" | "UNIT_TEST" | "REPRO_NOTEBOOK" | "PROOF_ASSISTANT";
    created_at: number;
    status: "pass" | "fail" | "inconclusive";
    run_id: string;
    claim_ids: string[];
    inputs: Record<string, any>;
    artifacts?: Record<string, any> | undefined;
    expires_at?: number | undefined;
    outputs?: Record<string, any> | undefined;
}, {
    kind: "HTTP_CHECK" | "SCHEMA_MATCH" | "EXAMPLE_CALL" | "COMPUTATION" | "UNIT_TEST" | "REPRO_NOTEBOOK" | "PROOF_ASSISTANT";
    created_at: number;
    status: "pass" | "fail" | "inconclusive";
    run_id: string;
    claim_ids: string[];
    inputs: Record<string, any>;
    artifacts?: Record<string, any> | undefined;
    expires_at?: number | undefined;
    outputs?: Record<string, any> | undefined;
}>;
export type VerifierRun = z.infer<typeof VerifierRunSchema>;
//# sourceMappingURL=receipts.d.ts.map