import { z } from 'zod';
export declare const BaseEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: string;
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    kind: string;
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
}>;
export type BaseEdge = z.infer<typeof BaseEdgeSchema>;
export declare const ContainsEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"CONTAINS">;
    rank: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "CONTAINS";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    rank?: number | undefined;
}, {
    id: string;
    kind: "CONTAINS";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    rank?: number | undefined;
}>;
export type ContainsEdge = z.infer<typeof ContainsEdgeSchema>;
export declare const SequestersEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"SEQUESTERS">;
    hidden_from_llm: z.ZodDefault<z.ZodBoolean>;
    hidden_from_tools: z.ZodDefault<z.ZodBoolean>;
    ui_only: z.ZodDefault<z.ZodBoolean>;
    reason: z.ZodEnum<["secret", "noisy", "untrusted", "license", "work_in_progress"]>;
    until: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "SEQUESTERS";
    created_at: number;
    from: string;
    to: string;
    hidden_from_llm: boolean;
    hidden_from_tools: boolean;
    ui_only: boolean;
    reason: "secret" | "noisy" | "untrusted" | "license" | "work_in_progress";
    metadata?: Record<string, any> | undefined;
    until?: string | undefined;
}, {
    id: string;
    kind: "SEQUESTERS";
    created_at: number;
    from: string;
    to: string;
    reason: "secret" | "noisy" | "untrusted" | "license" | "work_in_progress";
    metadata?: Record<string, any> | undefined;
    hidden_from_llm?: boolean | undefined;
    hidden_from_tools?: boolean | undefined;
    ui_only?: boolean | undefined;
    until?: string | undefined;
}>;
export type SequestersEdge = z.infer<typeof SequestersEdgeSchema>;
export declare const DerivesFromEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"DERIVES_FROM">;
    span: z.ZodOptional<z.ZodString>;
    confidence: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "DERIVES_FROM";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    confidence?: number | undefined;
    span?: string | undefined;
}, {
    id: string;
    kind: "DERIVES_FROM";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    confidence?: number | undefined;
    span?: string | undefined;
}>;
export type DerivesFromEdge = z.infer<typeof DerivesFromEdgeSchema>;
export declare const InScopeForEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"IN_SCOPE_FOR">;
    rank: z.ZodOptional<z.ZodNumber>;
    policy_chips: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "IN_SCOPE_FOR";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    rank?: number | undefined;
    policy_chips?: string[] | undefined;
}, {
    id: string;
    kind: "IN_SCOPE_FOR";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    rank?: number | undefined;
    policy_chips?: string[] | undefined;
}>;
export type InScopeForEdge = z.infer<typeof InScopeForEdgeSchema>;
export declare const EquivalentToEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodEnum<["EQUIVALENT_TO", "DUP_OF"]>;
    score: z.ZodNumber;
    canonical: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "EQUIVALENT_TO" | "DUP_OF";
    created_at: number;
    from: string;
    to: string;
    score: number;
    canonical: string;
    metadata?: Record<string, any> | undefined;
}, {
    id: string;
    kind: "EQUIVALENT_TO" | "DUP_OF";
    created_at: number;
    from: string;
    to: string;
    score: number;
    canonical: string;
    metadata?: Record<string, any> | undefined;
}>;
export type EquivalentToEdge = z.infer<typeof EquivalentToEdgeSchema>;
export declare const SupportsRefutesEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodEnum<["SUPPORTS", "REFUTES"]>;
    strength: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "SUPPORTS" | "REFUTES";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    strength?: number | undefined;
}, {
    id: string;
    kind: "SUPPORTS" | "REFUTES";
    created_at: number;
    from: string;
    to: string;
    metadata?: Record<string, any> | undefined;
    strength?: number | undefined;
}>;
export type SupportsRefutesEdge = z.infer<typeof SupportsRefutesEdgeSchema>;
export declare const VerifiedByEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    created_at: z.ZodNumber;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    kind: z.ZodLiteral<"VERIFIED_BY">;
    verifier_run_id: z.ZodString;
    status: z.ZodEnum<["pass", "fail", "inconclusive"]>;
    artifacts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    expires_at: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "VERIFIED_BY";
    created_at: number;
    status: "pass" | "fail" | "inconclusive";
    from: string;
    to: string;
    verifier_run_id: string;
    metadata?: Record<string, any> | undefined;
    artifacts?: Record<string, any> | undefined;
    expires_at?: number | undefined;
}, {
    id: string;
    kind: "VERIFIED_BY";
    created_at: number;
    status: "pass" | "fail" | "inconclusive";
    from: string;
    to: string;
    verifier_run_id: string;
    metadata?: Record<string, any> | undefined;
    artifacts?: Record<string, any> | undefined;
    expires_at?: number | undefined;
}>;
export type VerifiedByEdge = z.infer<typeof VerifiedByEdgeSchema>;
export type AnyEdge = ContainsEdge | SequestersEdge | DerivesFromEdge | InScopeForEdge | EquivalentToEdge | SupportsRefutesEdge | VerifiedByEdge;
//# sourceMappingURL=edges.d.ts.map