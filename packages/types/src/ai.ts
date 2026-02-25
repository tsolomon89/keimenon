import { z } from 'zod';

export const SmartClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()), // IDs of source segments/nodes
  tags: z.array(z.string()),
});

export type SmartClaim = z.infer<typeof SmartClaimSchema>;

export const SuggestedConnectionSchema = z.object({
  targetNodeId: z.string(),
  relation: z.string(), // e.g., "contradicts", "supports", "related_to"
  reasoning: z.string(),
  confidence: z.number(),
});

export type SuggestedConnection = z.infer<typeof SuggestedConnectionSchema>;

export const AiAnalysisResultSchema = z.object({
  sourceId: z.string(),
  summary: z.string(),
  claims: z.array(SmartClaimSchema),
  suggestedTags: z.array(z.string()),
  connections: z.array(SuggestedConnectionSchema),
  analyzedAt: z.number(),
  model: z.string(),
});

export type AiAnalysisResult = z.infer<typeof AiAnalysisResultSchema>;
