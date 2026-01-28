import { describe, it, expect } from 'vitest';
import { GathererAgent } from '../src/gatherer';
import { AutogrouperAgent } from '../src/autogrouper';
import { VerifierAgent } from '../src/verifier';
import { GathererInput, AutogrouperInput, VerifierInput } from '@keimenon/types';

describe('Agents Integration', () => {
  // Shared state for sequential tests
  let gathererOutput: any;

  it('should run Gatherer successfully', async () => {
    const gatherer = new GathererAgent();
    const gathererInput: GathererInput = {
      intent: 'expand search for AI news',
      seed_sources: [{ id: 'seed1', url: 'https://example.com' }],
    };
    gathererOutput = await gatherer.run(gathererInput);

    // console.log('Gatherer Output:', JSON.stringify(gathererOutput, null, 2));
    expect(gathererOutput.sources_pending.length).toBeGreaterThan(0);
  });

  it('should run Autogrouper using Gatherer output', async () => {
    const autogrouper = new AutogrouperAgent();
    const autogrouperInput: AutogrouperInput = {
      sources: gathererOutput.sources_pending.map((s: any) => ({ id: s.id, url: s.url })),
    };
    const autogrouperOutput = await autogrouper.run(autogrouperInput);

    // console.log('Autogrouper Output:', JSON.stringify(autogrouperOutput, null, 2));
    expect(autogrouperOutput.groups.length).toBeGreaterThan(0);
  });

  it('should run Verifier', async () => {
    const verifier = new VerifierAgent();
    const verifierInput: VerifierInput = {
      verifier_plan: { plan_id: 'plan1', checks: ['check1'] },
      claim_ids: ['claim1'],
    };
    const verifierOutput = await verifier.run(verifierInput);

    // console.log('Verifier Output:', JSON.stringify(verifierOutput, null, 2));
    expect(verifierOutput.verifier_run.status).toBe('pass');
  });
});
