import { ChatParser, NormalizedConversation, NormalizedMessage, ParseResult } from '../types';
import { fingerprint } from '../utils/fingerprint';
import { nanoid } from 'nanoid';

/**
 * Claude Parser - handles Claude chat exports
 */
export class ClaudeParser implements ChatParser {
  platform = 'claude' as const;

  canParse(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;

    // Claude format typically has 'uuid' and 'name' and 'chat_messages'
    const obj = data as any;
    if (obj.uuid && obj.name && obj.chat_messages) return true;

    // Alternative: array of conversations
    if (Array.isArray(data) && data.length > 0 && data[0].uuid) return true;

    return false;
  }

  async parse(data: unknown, sourceFile: string): Promise<ParseResult> {
    const conversations: NormalizedConversation[] = [];
    const stats = {
      total_conversations: 0,
      total_messages: 0,
      user_messages: 0,
      assistant_messages: 0,
      system_messages: 0,
      parse_errors: 0,
    };

    try {
      // Handle array of conversations
      if (Array.isArray(data)) {
        for (const item of data) {
          const conv = this.parseConversation(item, sourceFile);
          if (conv) {
            conversations.push(conv);
            stats.total_conversations++;
            this.updateStats(conv, stats);
          }
        }
      }
      // Handle single conversation
      else {
        const conv = this.parseConversation(data, sourceFile);
        if (conv) {
          conversations.push(conv);
          stats.total_conversations++;
          this.updateStats(conv, stats);
        }
      }
    } catch (error) {
      console.error('Claude parse error:', error);
      stats.parse_errors++;
    }

    return {
      conversations,
      platform: 'claude',
      source_file: sourceFile,
      stats,
    };
  }

  private parseConversation(data: any, sourceFile: string): NormalizedConversation | null {
    if (!data) return null;

    const uuid = data.uuid || `conv_${nanoid()}`;
    const title = data.name || data.title || 'Untitled Conversation';
    const createdAt = data.created_at || data.created || Date.now() / 1000;
    const updatedAt = data.updated_at || data.updated;

    const chatMessages = data.chat_messages || [];
    const messages: NormalizedMessage[] = [];

    for (let i = 0; i < chatMessages.length; i++) {
      const msg = chatMessages[i];

      // Extract role
      const role = this.normalizeRole(msg.sender);

      // Skip system messages
      if (role === 'system') continue;

      // Extract content (ensure it's a string)
      let content = msg.text || msg.content || '';
      if (typeof content !== 'string') {
        content = JSON.stringify(content);
      }
      if (!content || content.trim().length === 0) continue;

      // Extract timestamp
      const timestamp = msg.created_at || msg.created || createdAt;

      const normalized: NormalizedMessage = {
        role,
        content,
        timestamp: this.parseTimestamp(timestamp),
        index: messages.length,
        hash: fingerprint(content),
        metadata: {
          id: msg.uuid,
          sender: msg.sender,
        },
      };

      // Handle attachments if present
      if (msg.attachments && msg.attachments.length > 0) {
        normalized.attachments = msg.attachments.map((a: any) => a.file_name || a.name || '');
      }

      messages.push(normalized);
    }

    if (messages.length === 0) return null;

    return {
      conversation_id: uuid,
      platform: 'claude',
      title,
      created_at: this.parseTimestamp(createdAt),
      updated_at: updatedAt ? this.parseTimestamp(updatedAt) : undefined,
      messages,
      metadata: {
        source_file: sourceFile,
      },
    };
  }

  private normalizeRole(sender: string): 'user' | 'assistant' | 'system' {
    if (!sender) return 'user';

    const normalized = sender.toLowerCase();

    if (normalized === 'human' || normalized === 'user') return 'user';
    if (normalized === 'assistant' || normalized === 'claude') return 'assistant';
    if (normalized === 'system') return 'system';

    // Default to user if unknown
    return 'user';
  }

  private parseTimestamp(ts: any): number {
    if (typeof ts === 'number') {
      // If already Unix timestamp
      return Math.floor(ts);
    }
    if (typeof ts === 'string') {
      // Try parsing ISO string
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    }
    // Fallback to current time
    return Math.floor(Date.now() / 1000);
  }

  private updateStats(conv: NormalizedConversation, stats: any): void {
    stats.total_messages += conv.messages.length;
    for (const msg of conv.messages) {
      if (msg.role === 'user') stats.user_messages++;
      else if (msg.role === 'assistant') stats.assistant_messages++;
      else if (msg.role === 'system') stats.system_messages++;
    }
  }
}
