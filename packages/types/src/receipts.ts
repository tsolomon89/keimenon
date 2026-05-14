import { z } from 'zod';

// ScopeSet (concrete, reproducible context)
export const ScopeSetSchema = z.object({
  id: z.string(),
  board_id: z.string(),
  scope_nodes: z.array(z.string()), // node IDs
  policy: z.object({
    exclude_sequestered: z.boolean().default(true),
    include_edges: z.boolean().default(true),
  }),
  created_at: z.number(),
});

export type ScopeSet = z.infer<typeof ScopeSetSchema>;

// Receipt (snapshot for reproducibility)
export const ReceiptSchema = z.object({
  id: z.string(),
  board_id: z.string(),
  scope_nodes: z.array(z.string()),
  policy: z.object({
    exclude_sequestered: z.boolean(),
  }),
  lens: z
    .object({
      metric: z.string(), // e.g., "provenance", "semantic", "verification"
      seed: z.number().optional(),
    })
    .optional(),
  ranker: z
    .object({
      order: z.array(z.string()), // e.g., ["policy", "citation", "freshness", "authority", "embedding"]
    })
    .optional(),
  model: z.string().optional(),
  timestamp: z.number(),
  metadata: z.record(z.any()).optional(),
});

export type Receipt = z.infer<typeof ReceiptSchema>;

// LegacyAgentRun (execution record)
export const LegacyAgentRunSchema = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  scope_id: z.string(),
  receipt_id: z.string().optional(),
  budget: z.object({
    max_tokens: z.number(),
    max_cost_usd: z.number(),
    timeout_s: z.number(),
  }),
  plan: z.array(z.string()), // steps
  artifacts: z.array(
    z.object({
      kind: z.string(),
      ref: z.string(),
    })
  ),
  events: z.array(
    z.object({
      ts: z.number(),
      level: z.enum(['info', 'warn', 'error']),
      msg: z.string(),
    })
  ),
  status: z.enum(['success', 'error', 'partial']),
  error: z.string().optional(),
  started_at: z.number(),
  completed_at: z.number().optional(),
});

export type LegacyAgentRun = z.infer<typeof LegacyAgentRunSchema>;

// VerifierRun
export const VerifierRunSchema = z.object({
  run_id: z.string(),
  kind: z.enum([
    'HTTP_CHECK',
    'SCHEMA_MATCH',
    'EXAMPLE_CALL',
    'COMPUTATION',
    'UNIT_TEST',
    'REPRO_NOTEBOOK',
    'PROOF_ASSISTANT',
  ]),
  claim_ids: z.array(z.string()),
  inputs: z.record(z.any()),
  outputs: z.record(z.any()).optional(),
  status: z.enum(['pass', 'fail', 'inconclusive']),
  artifacts: z.record(z.any()).optional(),
  expires_at: z.number().optional(),
  created_at: z.number(),
});

export type VerifierRun = z.infer<typeof VerifierRunSchema>;
