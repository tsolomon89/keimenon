import { gemmaProvider } from '../services/agent/gemma-local-provider';
import type { ConversationSynthesisInput } from '../services/conversation-synthesis-input';

async function main() {
  console.log('--- Keimenon Gemma Local Smoke Test ---');

  const status = await gemmaProvider.checkStatus();
  if (status.status !== 'online') {
    console.error('Cannot run smoke test. Provider is not online:', status);
    process.exit(1);
  }

  console.log('Provider is online. Running synthesis test...');

  const testInput: ConversationSynthesisInput = {
    conversation: {
      id: 'smoke-test-conversation',
      title: 'Smoke Test',
      purpose: 'general',
    },
    context: {
      evidenceItems: [],
      truncation: {
        evidenceTruncated: false,
        sourcesTruncated: false,
        groupsTruncated: false,
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
    provenanceIds: [],
  };

  try {
    const startTime = Date.now();

    // Use the basic chat skill. We expect this to be available in runtime-skills
    const result = await gemmaProvider.synthesize(testInput, 'default-chat');

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
