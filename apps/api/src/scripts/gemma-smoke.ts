import { gemmaProvider } from '../services/agent/gemma-local-provider';
import { buildConversationSynthesisInput } from '../services/conversation-synthesis-input';
import { skillRegistry } from '../services/agent/runtime-skill-loader';

async function main() {
  console.log('--- Keimenon Gemma Local Runtime Smoke Test ---');

  const status = await gemmaProvider.checkStatus();
  if (status.status !== 'online') {
    console.error('Cannot run smoke test. Provider is not online:', status);
    process.exit(1);
  }

  console.log('Provider is online. Running synthesis test...');

  const skillId = 'bounded-answer';
  try {
    skillRegistry.selectRuntimeSkill(skillId);
  } catch (err: any) {
    console.error(`Skill '${skillId}' could not be selected:`, err.message);
    process.exit(1);
  }

  const testInput = buildConversationSynthesisInput({
    conversation: {
      id: 'smoke-test-conversation',
      kind: 'ConversationThread',
      human_principal_id: 'test-user',
      title: 'Smoke Test',
      purpose: 'general',
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    contextPack: {
      conversation_id: 'smoke-test-conversation',
      source_ids: [],
      group_ids: [],
      evidence: [],
      limits: {
        max_sources: 5,
        max_groups: 5,
        max_evidence_items: 20,
      },
      truncation: {
        sources_truncated: false,
        groups_truncated: false,
        evidence_truncated: false,
        requested_sources: 0,
        returned_sources: 0,
        requested_groups: 0,
        returned_groups: 0,
        returned_evidence_items: 0,
      },
    },
    messages: [],
    userMessage: {
      id: 'smoke-msg-1',
      kind: 'Message',
      thread_id: 'smoke-test-conversation',
      role: 'user',
      content: 'What is Keimenon?',
      timestamp: Date.now(),
      created_at: Date.now(),
      updated_at: Date.now(),
    },
  });

  try {
    const startTime = Date.now();

    const result = await gemmaProvider.synthesize(testInput, skillId);

    const duration = Date.now() - startTime;
    console.log(`\nSynthesis succeeded in ${duration}ms!`);
    console.log('\n--- Output ---');
    console.log(result.content);
    console.log('--------------');
    console.log(`Provider: ${result.provider}`);
    console.log(`Model: ${result.model}`);
    console.log(`Skill Used: ${result.skill_used}`);
  } catch (err: any) {
    console.error('Synthesis failed:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
