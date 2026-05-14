import { ConversationSynthesisInput } from './conversation-synthesis-input';

export interface ConversationSynthesisResult {
  content: string;
  synthesis_error?: string;
}

export interface ConversationSynthesisAdapter {
  synthesize(input: ConversationSynthesisInput): Promise<ConversationSynthesisResult>;
}

export class MockConversationSynthesisAdapter implements ConversationSynthesisAdapter {
  async synthesize(input: ConversationSynthesisInput): Promise<ConversationSynthesisResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Simple mock logic: Just echo back the user message with some context stats
    const messageCount = input.messages.length + 1; // historical + current
    const evidenceCount = input.context.evidenceItems.length;
    const truncatedNote = input.context.truncation.evidenceTruncated
      ? ' (Note: Evidence was truncated due to limits)'
      : '';

    const content =
      `Mocked Assistant Response: I received your message "${input.userMessage.content}". ` +
      `I am aware of ${evidenceCount} pieces of evidence${truncatedNote}. ` +
      `This thread now has ${messageCount} messages.`;

    return {
      content,
    };
  }
}

// A singleton instance for use in the app
export const mockSynthesisAdapter = new MockConversationSynthesisAdapter();
