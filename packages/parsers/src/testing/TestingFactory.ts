import { NormalizedConversation, NormalizedMessage } from '../types';
import * as fc from 'fast-check';

/**
 * Factory for creating dynamic test data using fast-check arbitraries
 */
export class TestingFactory {
  /**
   * Arbitrary for NormalizedMessage
   */
  static messageArbitrary(): fc.Arbitrary<NormalizedMessage> {
    return fc.record({
      index: fc.nat(),
      role: fc.constantFrom('user', 'assistant', 'system'),
      content: fc.string(), // Can be empty, unicode, long
      timestamp: fc.date().map(d => d.getTime()),
      hash: fc.uuid(), // Add required hash property
      metadata: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined })
    });
  }

  /**
   * Arbitrary for NormalizedConversation
   */
  static conversationArbitrary(): fc.Arbitrary<NormalizedConversation> {
    return fc.record({
      conversation_id: fc.uuid(),
      title: fc.string(),
      platform: fc.constantFrom('unknown', 'chatgpt', 'claude', 'gemini'), // Correct platform enum
      created_at: fc.date().map(d => d.getTime()),
      messages: fc.array(TestingFactory.messageArbitrary()),
      metadata: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined })
    });
  }

  /**
   * Generate a random conversation
   */
  static generateConversation(): NormalizedConversation {
    return fc.sample(TestingFactory.conversationArbitrary(), 1)[0];
  }

  /**
   * Generate N random conversations
   */
  static generateConversations(count: number): NormalizedConversation[] {
    return fc.sample(TestingFactory.conversationArbitrary(), count);
  }
}
