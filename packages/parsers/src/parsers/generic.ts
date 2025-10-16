import { ChatParser, NormalizedConversation, NormalizedMessage, ParseResult } from '../types';
import { fingerprint } from '../utils/fingerprint';
import { nanoid } from 'nanoid';

/**
 * Generic fallback parser - tries to extract conversations from unknown formats
 * Uses safe walking to find message-like structures
 */
export class GenericParser implements ChatParser {
  platform = 'unknown' as const;

  canParse(_data: unknown): boolean {
    // Generic parser always claims it can parse (as fallback)
    return true;
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
      // Try to extract messages from data structure
      const messages = this.extractMessages(data);

      if (messages.length > 0) {
        const conv: NormalizedConversation = {
          conversation_id: `conv_${nanoid()}`,
          platform: 'unknown',
          title: 'Imported Conversation',
          created_at: Math.floor(Date.now() / 1000),
          messages,
          metadata: {
            source_file: sourceFile,
            format: 'generic',
          },
        };

        conversations.push(conv);
        stats.total_conversations = 1;
        this.updateStats(conv, stats);
      }
    } catch (error) {
      console.error('Generic parse error:', error);
      stats.parse_errors++;
    }

    return {
      conversations,
      platform: 'unknown',
      source_file: sourceFile,
      stats,
    };
  }

  /**
   * Try to extract message-like structures from arbitrary data
   */
  private extractMessages(data: unknown): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];

    // Handle array of objects
    if (Array.isArray(data)) {
      for (const item of data) {
        const extracted = this.extractMessageFromObject(item);
        if (extracted) {
          messages.push({
            ...extracted,
            index: messages.length,
          });
        }
      }
    }
    // Handle object with messages array
    else if (data && typeof data === 'object') {
      const obj = data as any;

      // Look for common message array keys
      const messageArrayKeys = [
        'messages',
        'chat',
        'conversation',
        'history',
        'turns',
        'items',
        'data',
      ];

      for (const key of messageArrayKeys) {
        if (obj[key] && Array.isArray(obj[key])) {
          for (const item of obj[key]) {
            const extracted = this.extractMessageFromObject(item);
            if (extracted) {
              messages.push({
                ...extracted,
                index: messages.length,
              });
            }
          }
          break; // Found messages, stop looking
        }
      }
    }

    return messages;
  }

  /**
   * Try to extract a single message from an object
   */
  private extractMessageFromObject(obj: any): Omit<NormalizedMessage, 'index'> | null {
    if (!obj || typeof obj !== 'object') return null;

    // Look for role
    let role: 'user' | 'assistant' | 'system' = 'user';
    if (obj.role) {
      role = this.normalizeRole(obj.role);
    } else if (obj.sender) {
      role = this.normalizeRole(obj.sender);
    } else if (obj.author) {
      role = this.normalizeRole(obj.author);
    }

    // Skip system messages
    if (role === 'system') return null;

    // Look for content
    let content = '';
    const contentKeys = ['content', 'text', 'message', 'body', 'value'];
    for (const key of contentKeys) {
      if (obj[key]) {
        if (typeof obj[key] === 'string') {
          content = obj[key];
          break;
        } else if (Array.isArray(obj[key])) {
          content = obj[key].join('\n');
          break;
        } else if (typeof obj[key] === 'object' && obj[key].text) {
          content = obj[key].text;
          break;
        }
      }
    }

    if (!content) return null;

    // Look for timestamp
    let timestamp = Date.now() / 1000;
    const timestampKeys = ['timestamp', 'created_at', 'time', 'date', 'created'];
    for (const key of timestampKeys) {
      if (obj[key]) {
        const parsed = this.parseTimestamp(obj[key]);
        if (parsed) {
          timestamp = parsed;
          break;
        }
      }
    }

    return {
      role,
      content,
      timestamp: Math.floor(timestamp),
      hash: fingerprint(content),
      metadata: {
        id: obj.id || nanoid(),
      },
    };
  }

  private normalizeRole(role: string): 'user' | 'assistant' | 'system' {
    if (!role) return 'user';

    const normalized = role.toLowerCase();

    if (
      normalized.includes('user') ||
      normalized.includes('human') ||
      normalized === 'you'
    ) {
      return 'user';
    }

    if (
      normalized.includes('assistant') ||
      normalized.includes('bot') ||
      normalized.includes('ai') ||
      normalized.includes('model')
    ) {
      return 'assistant';
    }

    if (normalized.includes('system')) {
      return 'system';
    }

    // Default to user if unknown
    return 'user';
  }

  private parseTimestamp(ts: any): number | null {
    if (typeof ts === 'number') {
      // If looks like milliseconds, convert to seconds
      if (ts > 10000000000) {
        return Math.floor(ts / 1000);
      }
      return Math.floor(ts);
    }
    if (typeof ts === 'string') {
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    }
    return null;
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
