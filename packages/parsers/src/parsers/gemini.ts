import { ChatParser, NormalizedConversation, NormalizedMessage, ParseResult } from '../types';
import { fingerprint } from '../utils/fingerprint';
import { nanoid } from 'nanoid';

/**
 * Gemini Parser - handles Google Gemini chat exports
 */
export class GeminiParser implements ChatParser {
  platform = 'gemini' as const;

  canParse(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;

    const obj = data as any;

    // Gemini format might have 'conversation' or 'turns' or 'history'
    if (obj.conversation || obj.turns || obj.history) return true;

    // Check for Google-specific fields
    if (typeof obj.model === 'string' && obj.model.toLowerCase().includes('gemini')) return true;

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
      const conv = this.parseConversation(data as any, sourceFile);
      if (conv) {
        conversations.push(conv);
        stats.total_conversations++;
        this.updateStats(conv, stats);
      }
    } catch (error) {
      console.error('Gemini parse error:', error);
      stats.parse_errors++;
    }

    return {
      conversations,
      platform: 'gemini',
      source_file: sourceFile,
      stats,
    };
  }

  private parseConversation(data: any, sourceFile: string): NormalizedConversation | null {
    if (!data) return null;

    const title = data.title || data.name || 'Untitled Conversation';
    const createdAt = Date.now() / 1000; // Gemini might not provide timestamps

    // Try different possible message arrays
    const messageArray =
      data.conversation?.messages || data.turns || data.history || data.messages || [];

    const messages: NormalizedMessage[] = [];

    for (let i = 0; i < messageArray.length; i++) {
      const msg = messageArray[i];

      // Extract role (Gemini uses 'user' and 'model')
      let role: 'user' | 'assistant' | 'system' = 'user';
      if (msg.role) {
        role = this.normalizeRole(msg.role);
      } else if (msg.author) {
        role = this.normalizeRole(msg.author);
      }

      // Skip system messages
      if (role === 'system') continue;

      // Extract content
      let content = '';
      if (msg.parts && Array.isArray(msg.parts)) {
        // Gemini format: parts array with text
        content = msg.parts
          .map((p: any) => this.extractContent(p))
          .filter((t: string) => t)
          .join('\n');
      } else if (msg.content != null) {
        content = this.extractContent(msg.content);
      } else if (msg.text != null) {
        content = this.extractContent(msg.text);
      }

      if (!content) continue;

      const timestamp = msg.timestamp || msg.created_at || createdAt;

      const normalized: NormalizedMessage = {
        role,
        content,
        timestamp: this.parseTimestamp(timestamp),
        index: messages.length,
        hash: fingerprint(content),
        metadata: {
          id: msg.id || `msg_${i}`,
        },
      };

      messages.push(normalized);
    }

    if (messages.length === 0) return null;

    return {
      conversation_id: data.id || `conv_${nanoid()}`,
      platform: 'gemini',
      title,
      created_at: Math.floor(createdAt),
      messages,
      metadata: {
        source_file: sourceFile,
        model: data.model,
      },
    };
  }

  private normalizeRole(role: unknown): 'user' | 'assistant' | 'system' {
    if (role == null) return 'user';

    if (typeof role === 'object') {
      const roleObj = role as Record<string, unknown>;
      const nestedRole =
        roleObj.role ?? roleObj.author ?? roleObj.sender ?? roleObj.type ?? roleObj.name;
      if (nestedRole != null) {
        return this.normalizeRole(nestedRole);
      }
      return 'user';
    }

    const normalized = String(role).toLowerCase();

    if (normalized.includes('user') || normalized.includes('human')) return 'user';
    if (
      normalized.includes('model') ||
      normalized.includes('assistant') ||
      normalized.includes('gemini') ||
      normalized.includes('bot') ||
      normalized.includes('ai')
    ) {
      return 'assistant';
    }
    if (normalized.includes('system')) return 'system';

    return 'user';
  }

  private parseTimestamp(ts: any): number {
    if (typeof ts === 'number') {
      return Math.floor(ts);
    }
    if (typeof ts === 'string') {
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    }
    return Math.floor(Date.now() / 1000);
  }

  private extractContent(content: unknown): string {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    if (
      typeof content === 'number' ||
      typeof content === 'boolean' ||
      typeof content === 'bigint'
    ) {
      return String(content);
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => this.extractContent(part))
        .filter((part) => part.length > 0)
        .join('\n');
    }
    if (typeof content === 'object') {
      const obj = content as Record<string, unknown>;
      const textLikeKeys = ['text', 'content', 'message', 'body', 'value'];
      for (const key of textLikeKeys) {
        if (obj[key] != null) {
          const extracted = this.extractContent(obj[key]);
          if (extracted) return extracted;
        }
      }
      try {
        return JSON.stringify(obj);
      } catch {
        return String(obj);
      }
    }
    return String(content);
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
