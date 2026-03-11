import { z } from 'zod';
import { SourceNodeSchema, GroupNodeSchema, ObjectiveClaimSchema, UnifiedDocSchema } from './nodes';
import { VerifierRunSchema } from './receipts';

// --- Common Types ---

export const BudgetSchema = z.object({
  tokens: z.number().optional(),
  cost_usd: z.number().optional(),
  timeout_ms: z.number().optional(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const SourceRefSchema = z.object({
  id: z.string(),
  url: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const BoardSnapshotRefSchema = z.object({
  board_id: z.string(),
  snapshot_id: z.string(),
});
export type BoardSnapshotRef = z.infer<typeof BoardSnapshotRefSchema>;

// --- Agent IO Types ---

// Gatherer
export const GathererInputSchema = z.object({
  intent: z.string(),
  seed_sources: z.array(SourceRefSchema),
  budget: BudgetSchema.optional(),
  board_context: BoardSnapshotRefSchema.optional(),
  planner_notes: z.string().optional(),
});
export type GathererInput = z.infer<typeof GathererInputSchema>;

export const GathererOutputSchema = z.object({
  sources_pending: z.array(SourceNodeSchema),
  notes: z.array(z.string()),
});
export type GathererOutput = z.infer<typeof GathererOutputSchema>;

// Autogrouper
export const AutogrouperInputSchema = z.object({
  sources: z.array(SourceRefSchema),
  hints: z.array(z.string()).optional(),
});
export type AutogrouperInput = z.infer<typeof AutogrouperInputSchema>;

export const DedupeReportSchema = z.object({
  heuristics_used: z.array(z.string()),
  decisions: z.array(
    z.object({
      source_id: z.string(),
      action: z.enum(['keep', 'merge', 'discard']),
      target_id: z.string().optional(),
      reason: z.string(),
    })
  ),
});
export type DedupeReport = z.infer<typeof DedupeReportSchema>;

export const AutogrouperOutputSchema = z.object({
  groups: z.array(GroupNodeSchema),
  contains_edges: z.array(z.object({ from: z.string(), to: z.string() })), // Simplified edge
  equivalent_to_edges: z.array(z.object({ from: z.string(), to: z.string() })),
  dedupe_report: DedupeReportSchema,
});
export type AutogrouperOutput = z.infer<typeof AutogrouperOutputSchema>;

// Verifier
export const VerifierPlanRefSchema = z.object({
  plan_id: z.string(),
  checks: z.array(z.string()),
});
export type VerifierPlanRef = z.infer<typeof VerifierPlanRefSchema>;

export const VerifierInputSchema = z.object({
  verifier_plan: VerifierPlanRefSchema,
  claim_ids: z.array(z.string()).optional(),
  budget: BudgetSchema.optional(),
});
export type VerifierInput = z.infer<typeof VerifierInputSchema>;

// VerifierRun is imported from receipts.ts

export const ClaimStatusUpdateSchema = z.object({
  claim_id: z.string(),
  status: z.enum(['provisional', 'verifying', 'verified', 'contested', 'stale']),
  receipt_id: z.string(),
});
export type ClaimStatusUpdate = z.infer<typeof ClaimStatusUpdateSchema>;

export const VerifierOutputSchema = z.object({
  verifier_run: VerifierRunSchema,
  claim_status_updates: z.array(ClaimStatusUpdateSchema),
  notes: z.array(z.string()),
});
export type VerifierOutput = z.infer<typeof VerifierOutputSchema>;

// --- Registry Types ---

export interface AgentDefinition {
  id: string;
  purpose: string;
  inputs: {
    required: string[];
    optional: string[];
  };
  outputs: {
    produces: string[];
  };
}
