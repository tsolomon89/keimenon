import { ConversationSynthesisInput } from './conversation-synthesis-input';
import {
  SynthesisProvider,
  ConversationSynthesisResult,
  providerRegistry,
} from './agent/synthesis-provider-registry';

export class MockSynthesisProvider implements SynthesisProvider {
  public id = 'mock';
  public family: 'mock' | 'gemma' = 'mock';
  public mode: 'mock' | 'local' = 'mock';

  async synthesize(
    input: ConversationSynthesisInput,
    skillId: string
  ): Promise<ConversationSynthesisResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Simple mock logic: Just echo back the user message with some context stats
    const messageCount = input.messages.length + 1; // historical + current
    const evidenceCount = input.context.evidenceItems.length;
    const truncatedNote = input.context.truncation.evidenceTruncated
      ? ' (Note: Evidence was truncated due to limits)'
      : '';

    const content =
      `Mocked Assistant Response [Skill: ${skillId}]: I received your message "${input.userMessage.content}". ` +
      `I am aware of ${evidenceCount} pieces of evidence${truncatedNote}. ` +
      `This thread now has ${messageCount} messages.`;

    const evidenceUsed = input.context.evidenceItems.slice(0, 2).map((item: any) => item.node_id);

    return {
      content,
      provider: this.id,
      skill_used: skillId,
      evidence_used: evidenceUsed,
      proposed_outputs: [],
    };
  }
}

// A singleton instance for use in the app
export const mockSynthesisProvider = new MockSynthesisProvider();
providerRegistry.registerProvider(mockSynthesisProvider);
