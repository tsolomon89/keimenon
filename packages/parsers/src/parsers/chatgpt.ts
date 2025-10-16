import { ChatParser, NormalizedConversation, NormalizedMessage, ParseResult } from '../types';
import { fingerprint } from '../utils/fingerprint';
import { nanoid } from 'nanoid';

/**
 * ChatGPT Parser - handles both legacy 'mapping' format and new 'messages[]' format
 */
export class ChatGPTParser implements ChatParser {
  platform = 'chatgpt' as const;

  canParse(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;

    // Legacy format has 'mapping' or 'data'
    if ('mapping' in data) return true;

    // New format has 'messages' array
    if ('messages' in data && Array.isArray((data as any).messages)) return true;

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
      // Try legacy mapping format first
      if (this.hasMapping(data)) {
        const conv = this.parseMappingFormat(data, sourceFile);
        if (conv) {
          conversations.push(conv);
          stats.total_conversations++;
          this.updateStats(conv, stats);
        }
      }
      // Try new messages[] format
      else if (this.hasMessages(data)) {
        const conv = this.parseMessagesFormat(data, sourceFile);
        if (conv) {
          conversations.push(conv);
          stats.total_conversations++;
          this.updateStats(conv, stats);
        }
      }
    } catch (error) {
      console.error('ChatGPT parse error:', error);
      stats.parse_errors++;
    }

    return {
      conversations,
      platform: 'chatgpt',
      source_file: sourceFile,
      stats,
    };
  }

  private hasMapping(data: unknown): boolean {
    return typeof data === 'object' && data !== null && 'mapping' in data;
  }

  private hasMessages(data: unknown): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      'messages' in data &&
      Array.isArray((data as any).messages)
    );
  }

  /**
   * Parse legacy ChatGPT mapping format
   * Structure: { mapping: { [id]: { message: {...}, children: [...] } }, title: "..." }
   */
  private parseMappingFormat(data: any, sourceFile: string): NormalizedConversation | null {
    const mapping = data.mapping || {};
    const title = data.title || 'Untitled Conversation';
    const createTime = data.create_time || Date.now() / 1000;
    const updateTime = data.update_time;

    const messages: NormalizedMessage[] = [];
    const visited = new Set<string>();

    // Find root node (node with no parent or first node)
    let rootId: string | null = null;
    for (const [id, node] of Object.entries(mapping)) {
      const nodeData = node as any;
      if (!nodeData.parent || nodeData.parent === null) {
        rootId = id;
        break;
      }
    }

    if (!rootId) {
      // Fallback: use first key
      const keys = Object.keys(mapping);
      if (keys.length > 0) rootId = keys[0];
    }

    // Traverse from root
    if (rootId) {
      this.traverseMapping(mapping, rootId, messages, visited);
    }

    if (messages.length === 0) return null;

    return {
      conversation_id: `conv_${nanoid()}`,
      platform: 'chatgpt',
      title,
      created_at: Math.floor(createTime),
      updated_at: updateTime ? Math.floor(updateTime) : undefined,
      messages,
      metadata: {
        source_file: sourceFile,
        format: 'mapping',
      },
    };
  }

  private traverseMapping(
    mapping: any,
    nodeId: string,
    messages: NormalizedMessage[],
    visited: Set<string>
  ): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = mapping[nodeId];
    if (!node) return;

    // Extract message
    const message = node.message;
    if (message && message.author && message.content) {
      const role = this.normalizeRole(message.author.role);
      const content = this.extractContent(message.content);

      if (role !== 'system' && content) {
        const timestamp = message.create_time || Date.now() / 1000;
        const normalized: NormalizedMessage = {
          role,
          content,
          timestamp: Math.floor(timestamp),
          index: messages.length,
          hash: fingerprint(content),
          metadata: {
            id: message.id,
          },
        };
        messages.push(normalized);
      }
    }

    // Traverse children (typically only one child in the main thread)
    if (node.children && Array.isArray(node.children)) {
      for (const childId of node.children) {
        this.traverseMapping(mapping, childId, messages, visited);
      }
    }
  }

  /**
   * Parse new ChatGPT messages[] format
   * Structure: { messages: [ {author: {role: "..."}, content: {parts: [...]}, create_time: ...} ] }
   */
  private parseMessagesFormat(data: any, sourceFile: string): NormalizedConversation | null {
    const messagesArray = data.messages || [];
    const title = data.title || 'Untitled Conversation';
    const createTime = data.create_time || Date.now() / 1000;
    const updateTime = data.update_time;

    const messages: NormalizedMessage[] = [];

    for (let i = 0; i < messagesArray.length; i++) {
      const msg = messagesArray[i];

      // Extract role
      let role: 'user' | 'assistant' | 'system' = 'user';
      if (msg.author?.role) {
        role = this.normalizeRole(msg.author.role);
      } else if (msg.role) {
        role = this.normalizeRole(msg.role);
      }

      // Skip system messages
      if (role === 'system') continue;

      // Extract content
      let content = '';
      if (msg.content?.parts && Array.isArray(msg.content.parts)) {
        content = msg.content.parts.join('\n');
      } else if (msg.content?.text) {
        content = msg.content.text;
      } else if (typeof msg.content === 'string') {
        content = msg.content;
      }

      if (!content) continue;

      const timestamp = msg.create_time || createTime;
      const normalized: NormalizedMessage = {
        role,
        content,
        timestamp: Math.floor(timestamp),
        index: messages.length,
        hash: fingerprint(content),
        metadata: {
          id: msg.id,
        },
      };
      messages.push(normalized);
    }

    if (messages.length === 0) return null;

    return {
      conversation_id: `conv_${nanoid()}`,
      platform: 'chatgpt',
      title,
      created_at: Math.floor(createTime),
      updated_at: updateTime ? Math.floor(updateTime) : undefined,
      messages,
      metadata: {
        source_file: sourceFile,
        format: 'messages',
      },
    };
  }

  private normalizeRole(role: string): 'user' | 'assistant' | 'system' {
    const normalized = role.toLowerCase();
    if (normalized === 'user') return 'user';
    if (normalized === 'assistant') return 'assistant';
    if (normalized === 'system') return 'system';
    // Default to user if unknown
    return 'user';
  }

  private extractContent(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (content.parts && Array.isArray(content.parts)) {
      return content.parts.join('\n');
    }
    if (content.text) return content.text;
    return '';
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
