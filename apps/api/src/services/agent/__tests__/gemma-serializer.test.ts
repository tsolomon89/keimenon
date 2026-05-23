import { describe, it, expect } from 'vitest';
import { GemmaSerializer } from '../gemma-serializer';
import { ConversationSynthesisInput } from '../../conversation-synthesis-input';
import { RuntimeSkill } from '../runtime-skill-loader';

describe('GemmaSerializer', () => {
  const serializer = new GemmaSerializer();

  const mockSkill: RuntimeSkill = {
    id: 'bounded-answer',
    name: 'Bounded Answer',
    description: 'Answers strictly from context',
    mode: 'chat',
    model_family: 'gemma',
    allowed_tools: [],
    output_schema_path: 'output.schema.json',
    auto_invocable: true,
    requires_context_pack: true,
    side_effects: false,
    instructions: 'You are an advanced researcher. Keep your response short.',
    output_schema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['answer', 'confidence'],
    },
  };

  const mockInput: ConversationSynthesisInput = {
    conversation: {
      id: 'conv_123',
      title: 'Research Thread',
      purpose: 'general',
    },
    context: {
      evidenceItems: [
        { node_id: 'span_1', text: 'Seeded fact: Keimenon is local-first.' },
        { node_id: 'span_2', label: 'Alternative fact: Similarity graph is live.' },
      ],
      truncation: {
        sourcesTruncated: false,
        groupsTruncated: false,
        evidenceTruncated: false,
      },
    },
    messages: [
      {
        id: 'msg_h1',
        kind: 'Message',
        created_at: 1779523000000,
        updated_at: 1779523000000,
        role: 'user',
        content: 'What is Keimenon?',
      },
      {
        id: 'msg_a1',
        kind: 'Message',
        created_at: 1779523010000,
        updated_at: 1779523010000,
        role: 'assistant',
        content: 'It is a local-first platform.',
      },
    ],
    userMessage: {
      id: 'msg_u2',
      kind: 'Message',
      created_at: 1779523020000,
      updated_at: 1779523020000,
      role: 'user',
      content: 'Can you summarize it?',
    },
    provenanceIds: ['source_1', 'group_1'],
  };

  it('should serialize prompts deterministically', () => {
    const payload1 = serializer.serializeToOpenAiFormat(mockInput, mockSkill, 'gemma-4-e2b');
    const payload2 = serializer.serializeToOpenAiFormat(mockInput, mockSkill, 'gemma-4-e2b');

    expect(payload1).toEqual(payload2);
    expect(payload1.model).toBe('gemma-4-e2b');
    expect(payload1.temperature).toBe(0.1);
  });

  it('should include skill instructions and output JSON schema in the system prompt', () => {
    const payload = serializer.serializeToOpenAiFormat(mockInput, mockSkill, 'gemma-4-e2b');
    const systemMsg = payload.messages.find((m) => m.role === 'system');

    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain(
      'You are an advanced researcher. Keep your response short.'
    );
    expect(systemMsg!.content).toContain('OUTPUT SCHEMA');
    expect(systemMsg!.content).toContain('"confidence"');
  });

  it('should cleanly format the context pack evidence items', () => {
    const payload = serializer.serializeToOpenAiFormat(mockInput, mockSkill, 'gemma-4-e2b');
    const evidenceMsg = payload.messages.find(
      (m) => m.role === 'system' && m.content.includes('CONTEXT PACK EVIDENCE')
    );

    expect(evidenceMsg).toBeDefined();
    expect(evidenceMsg!.content).toContain(
      '[ID: span_1] Text: Seeded fact: Keimenon is local-first.'
    );
    expect(evidenceMsg!.content).toContain(
      '[ID: span_2] Label: Alternative fact: Similarity graph is live.'
    );
  });

  it('should accurately capture historical and current message roles sequentially', () => {
    const payload = serializer.serializeToOpenAiFormat(mockInput, mockSkill, 'gemma-4-e2b');

    // User / assistant messages are mapped at the end of the array
    const userAndAssistantMsgs = payload.messages.filter((m) => m.role !== 'system');

    expect(userAndAssistantMsgs).toHaveLength(3);

    expect(userAndAssistantMsgs[0].role).toBe('user');
    expect(userAndAssistantMsgs[0].content).toBe('What is Keimenon?');

    expect(userAndAssistantMsgs[1].role).toBe('assistant');
    expect(userAndAssistantMsgs[1].content).toBe('It is a local-first platform.');

    expect(userAndAssistantMsgs[2].role).toBe('user');
    expect(userAndAssistantMsgs[2].content).toBe('Can you summarize it?');
  });
});
