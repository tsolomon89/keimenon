import { AnyNode, MessageNode, ConversationThread, ConversationContextPack } from '@keimenon/types';

export interface ConversationSynthesisInput {
  conversation: {
    id: string;
    title: string | null;
    purpose?: string;
  };
  context: {
    evidenceItems: any[]; // Or a more specific type for the evidence items
    truncation: {
      sourcesTruncated: boolean;
      groupsTruncated: boolean;
      evidenceTruncated: boolean;
    };
  };
  messages: MessageNode[];
  userMessage: MessageNode;
  provenanceIds: string[]; // List of IDs that contributed to the context
}

export interface BuildSynthesisInputParams {
  conversation: ConversationThread;
  contextPack: ConversationContextPack;
  messages: MessageNode[];
  userMessage: MessageNode;
  maxMessageHistory?: number;
}

/**
 * Pure function to build the synthesis input from the conversation state and bounded context pack.
 * Truncates message history to the specified limit.
 */
export function buildConversationSynthesisInput({
  conversation,
  contextPack,
  messages,
  userMessage,
  maxMessageHistory = 20,
}: BuildSynthesisInputParams): ConversationSynthesisInput {
  // Sort messages by timestamp ascending
  const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  // Cap the historical messages
  const cappedMessages = sortedMessages.slice(-maxMessageHistory);

  // Extract evidence items and provenance IDs
  const evidenceItems = contextPack.evidence || [];
  const provenanceIds = contextPack.source_ids || [];

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title || null,
      purpose: conversation.purpose,
    },
    context: {
      evidenceItems,
      truncation: {
        sourcesTruncated: contextPack.truncation?.sources_truncated || false,
        groupsTruncated: contextPack.truncation?.groups_truncated || false,
        evidenceTruncated: contextPack.truncation?.evidence_truncated || false,
      },
    },
    messages: cappedMessages,
    userMessage,
    provenanceIds,
  };
}
