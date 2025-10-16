import { z } from 'zod';
export declare const PlanTierSchema: z.ZodEnum<["admin_debug", "free", "pro", "business"]>;
export type PlanTier = z.infer<typeof PlanTierSchema>;
export declare const WorkspaceSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    plan: z.ZodEnum<["admin_debug", "free", "pro", "business"]>;
    owner_id: z.ZodString;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: number;
    updated_at: number;
    name: string;
    plan: "admin_debug" | "free" | "pro" | "business";
    owner_id: string;
    settings?: Record<string, any> | undefined;
}, {
    id: string;
    created_at: number;
    updated_at: number;
    name: string;
    plan: "admin_debug" | "free" | "pro" | "business";
    owner_id: string;
    settings?: Record<string, any> | undefined;
}>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export declare const BoardSchema: z.ZodObject<{
    id: z.ZodString;
    workspace_id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    created_at: z.ZodNumber;
    updated_at: z.ZodNumber;
    settings: z.ZodOptional<z.ZodObject<{
        default_lens: z.ZodDefault<z.ZodString>;
        layout_seed: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        default_lens: string;
        layout_seed?: number | undefined;
    }, {
        default_lens?: string | undefined;
        layout_seed?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: number;
    updated_at: number;
    name: string;
    workspace_id: string;
    settings?: {
        default_lens: string;
        layout_seed?: number | undefined;
    } | undefined;
    description?: string | undefined;
}, {
    id: string;
    created_at: number;
    updated_at: number;
    name: string;
    workspace_id: string;
    settings?: {
        default_lens?: string | undefined;
        layout_seed?: number | undefined;
    } | undefined;
    description?: string | undefined;
}>;
export type Board = z.infer<typeof BoardSchema>;
export declare const UsageMeterSchema: z.ZodObject<{
    workspace_id: z.ZodString;
    period_start: z.ZodNumber;
    period_end: z.ZodNumber;
    counters: z.ZodObject<{
        llm_tokens: z.ZodDefault<z.ZodNumber>;
        verifier_runs: z.ZodDefault<z.ZodNumber>;
        api_calls: z.ZodDefault<z.ZodNumber>;
        storage_gb: z.ZodDefault<z.ZodNumber>;
        emails_sent: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        storage_gb: number;
        llm_tokens: number;
        verifier_runs: number;
        api_calls: number;
        emails_sent: number;
    }, {
        storage_gb?: number | undefined;
        llm_tokens?: number | undefined;
        verifier_runs?: number | undefined;
        api_calls?: number | undefined;
        emails_sent?: number | undefined;
    }>;
    updated_at: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    updated_at: number;
    workspace_id: string;
    period_start: number;
    period_end: number;
    counters: {
        storage_gb: number;
        llm_tokens: number;
        verifier_runs: number;
        api_calls: number;
        emails_sent: number;
    };
}, {
    updated_at: number;
    workspace_id: string;
    period_start: number;
    period_end: number;
    counters: {
        storage_gb?: number | undefined;
        llm_tokens?: number | undefined;
        verifier_runs?: number | undefined;
        api_calls?: number | undefined;
        emails_sent?: number | undefined;
    };
}>;
export type UsageMeter = z.infer<typeof UsageMeterSchema>;
export declare const BudgetEventSchema: z.ZodObject<{
    ts: z.ZodNumber;
    workspace_id: z.ZodString;
    actor: z.ZodString;
    action: z.ZodString;
    reason: z.ZodString;
    plan: z.ZodEnum<["admin_debug", "free", "pro", "business"]>;
    policy: z.ZodOptional<z.ZodString>;
    receipt_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    plan: "admin_debug" | "free" | "pro" | "business";
    ts: number;
    workspace_id: string;
    actor: string;
    action: string;
    policy?: string | undefined;
    receipt_id?: string | undefined;
}, {
    reason: string;
    plan: "admin_debug" | "free" | "pro" | "business";
    ts: number;
    workspace_id: string;
    actor: string;
    action: string;
    policy?: string | undefined;
    receipt_id?: string | undefined;
}>;
export type BudgetEvent = z.infer<typeof BudgetEventSchema>;
//# sourceMappingURL=plans.d.ts.map