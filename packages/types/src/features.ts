import { z } from 'zod';

export const FeatureManifestSchema = z.object({
  auto_graph: z.boolean(),
  objective_layer: z.boolean(),
  agent_runtime: z.boolean(),
  business_hierarchy: z.boolean(),
  proof_verification: z.boolean(),
  external_research: z.boolean(),
});

export type FeatureManifest = z.infer<typeof FeatureManifestSchema>;

export type AccountClass = 'free' | 'professional' | 'business';

export function featureManifestForAccountClass(accountClass: AccountClass): FeatureManifest {
  if (accountClass === 'business') {
    return {
      auto_graph: true,
      objective_layer: true,
      agent_runtime: true,
      business_hierarchy: true,
      proof_verification: true,
      external_research: true,
    };
  }

  if (accountClass === 'professional') {
    return {
      auto_graph: true,
      objective_layer: true,
      agent_runtime: true,
      business_hierarchy: false,
      proof_verification: true,
      external_research: true,
    };
  }

  return {
    auto_graph: true,
    objective_layer: true,
    agent_runtime: false,
    business_hierarchy: false,
    proof_verification: false,
    external_research: false,
  };
}

export function planTierForAccountClass(accountClass: AccountClass): 'free' | 'pro' | 'business' {
  if (accountClass === 'professional') {
    return 'pro';
  }
  return accountClass;
}
