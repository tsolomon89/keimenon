import { describe, expect, it } from 'vitest';
import { featureManifestForAccountClass, planTierForAccountClass } from './features';

describe('feature manifests by account class', () => {
  it('returns Free manifest with objective layer enabled and agent runtime disabled', () => {
    expect(featureManifestForAccountClass('free')).toEqual({
      auto_graph: true,
      objective_layer: true,
      agent_runtime: false,
      business_hierarchy: false,
      proof_verification: false,
      external_research: false,
    });
  });

  it('returns Professional manifest with runtime entitlements enabled', () => {
    expect(featureManifestForAccountClass('professional')).toEqual({
      auto_graph: true,
      objective_layer: true,
      agent_runtime: true,
      business_hierarchy: false,
      proof_verification: true,
      external_research: true,
    });
  });

  it('maps professional class to pro plan tier', () => {
    expect(planTierForAccountClass('professional')).toBe('pro');
  });
});
