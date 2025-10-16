import { z } from 'zod';

// Plan tiers
export const PlanTierSchema = z.enum(['admin_debug', 'free', 'pro', 'business']);
export type PlanTier = z.infer<typeof PlanTierSchema>;

// Workspace
export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: PlanTierSchema,
  owner_id: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  settings: z.record(z.any()).optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

// Board
export const BoardSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  created_at: z.number(),
  updated_at: z.number(),
  settings: z.object({
    default_lens: z.string().default('2D'),
    layout_seed: z.number().optional(),
  }).optional(),
});

export type Board = z.infer<typeof BoardSchema>;

// UsageMeter (tracking costed actions)
export const UsageMeterSchema = z.object({
  workspace_id: z.string(),
  period_start: z.number(),
  period_end: z.number(),
  counters: z.object({
    llm_tokens: z.number().default(0),
    verifier_runs: z.number().default(0),
    api_calls: z.number().default(0),
    storage_gb: z.number().default(0),
    emails_sent: z.number().default(0),
  }),
  updated_at: z.number(),
});

export type UsageMeter = z.infer<typeof UsageMeterSchema>;

// BudgetEvent (audit trail)
export const BudgetEventSchema = z.object({
  ts: z.number(),
  workspace_id: z.string(),
  actor: z.string(), // user ID
  action: z.string(),
  reason: z.string(),
  plan: PlanTierSchema,
  policy: z.string().optional(),
  receipt_id: z.string().optional(),
});

export type BudgetEvent = z.infer<typeof BudgetEventSchema>;
