import { GathererAgent } from '../src/gatherer';
import { AutogrouperAgent } from '../src/autogrouper';
import { VerifierAgent } from '../src/verifier';
import { GathererInput, AutogrouperInput, VerifierInput } from '@keimenon/types';

async function testAgents() {
  console.log('🧪 Testing Agents...');

  // 1. Test Gatherer
  console.log('\nTesting Gatherer...');
  const gatherer = new GathererAgent();
  const gathererInput: GathererInput = {
    intent: 'expand search for AI news',
    seed_sources: [{ id: 'seed1', url: 'https://example.com' }],
  };
  const gathererOutput = await gatherer.run(gathererInput);
  console.log('Gatherer Output:', JSON.stringify(gathererOutput, null, 2));
  if (gathererOutput.sources_pending.length > 0) {
    console.log('✅ Gatherer produced sources');
  } else {
    console.error('❌ Gatherer failed to produce sources');
  }

  // 2. Test Autogrouper
  console.log('\nTesting Autogrouper...');
  const autogrouper = new AutogrouperAgent();
  const autogrouperInput: AutogrouperInput = {
    sources: gathererOutput.sources_pending.map((s) => ({ id: s.id, url: s.url })),
  };
  const autogrouperOutput = await autogrouper.run(autogrouperInput);
  console.log('Autogrouper Output:', JSON.stringify(autogrouperOutput, null, 2));
  if (autogrouperOutput.groups.length > 0) {
    console.log('✅ Autogrouper produced groups');
  } else {
    console.error('❌ Autogrouper failed to produce groups');
  }

  // 3. Test Verifier
  console.log('\nTesting Verifier...');
  const verifier = new VerifierAgent();
  const verifierInput: VerifierInput = {
    verifier_plan: { plan_id: 'plan1', checks: ['check1'] },
    claim_ids: ['claim1'],
  };
  const verifierOutput = await verifier.run(verifierInput);
  console.log('Verifier Output:', JSON.stringify(verifierOutput, null, 2));
  if (verifierOutput.verifier_run.status === 'pass') {
    console.log('✅ Verifier passed');
  } else {
    console.error('❌ Verifier failed');
  }
}

testAgents().catch(console.error);
