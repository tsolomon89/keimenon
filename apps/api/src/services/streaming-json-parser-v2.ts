import { createReadStream } from 'fs';
import { EventEmitter } from 'events';
import JSONStream = require('jsonstream');

export interface ParseProgress {
  conversationsProcessed: number;
  messagesProcessed: number;
  bytesProcessed: number;
  currentConversation?: string;
}

export interface ConversationChunk {
  id: string;
  title: string;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
    metadata?: Record<string, any>;
  }>;
  created_at?: string;
  updated_at?: string;
  platform: 'chatgpt' | 'claude' | 'gemini' | 'unknown';
}

/**
 * Streaming JSON parser for large conversation files using JSONStream
 * Better handles large text nodes than clarinet
 */
export interface ParserConfig {
  roleSubset?: 'user' | 'assistant' | 'both'; // Default: 'both'
}

export class StreamingJSONParserV2 extends EventEmitter {
  private conversationBuffer: any[] = [];
  private bufferSize = 0;
  private maxBufferSize = 10; // Process in batches of 10 conversations
  private conversationsProcessed = 0;
  private messagesProcessed = 0;
  private config: ParserConfig;

  constructor(config: ParserConfig = {}) {
    super();
    this.config = { roleSubset: 'both', ...config };
  }

  /**
   * Parse a large JSON file in streaming fashion
   */
  async parseFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, {
        encoding: 'utf8',
        highWaterMark: 256 * 1024, // 256KB chunks
      });

      // JSONStream expects the array at root or with a path like '*'
      const parser = JSONStream.parse('*');

      let bytesProcessed = 0;

      stream.on('data', (chunk: string | Buffer) => {
        const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        bytesProcessed += Buffer.byteLength(chunkStr, 'utf8');
      });

      parser.on('data', (data: any) => {
        // Normalize the conversation
        const normalized = this.normalizeConversation(data);

        if (normalized) {
          this.conversationBuffer.push(normalized);
          this.bufferSize++;
          this.conversationsProcessed++;
          this.messagesProcessed += normalized.messages.length;

          // Emit batch when buffer is full
          if (this.bufferSize >= this.maxBufferSize) {
            this.emit('batch', [...this.conversationBuffer]);
            this.emit('progress', {
              conversationsProcessed: this.conversationsProcessed,
              messagesProcessed: this.messagesProcessed,
              bytesProcessed,
              currentConversation: normalized.title,
            });
            this.conversationBuffer = [];
            this.bufferSize = 0;
          }
        }
      });

      parser.on('error', (error: Error) => {
        reject(error);
      });

      parser.on('end', () => {
        // Flush remaining buffer
        if (this.conversationBuffer.length > 0) {
          this.emit('batch', [...this.conversationBuffer]);
          this.emit('progress', {
            conversationsProcessed: this.conversationsProcessed,
            messagesProcessed: this.messagesProcessed,
            bytesProcessed,
          });
        }
        resolve();
      });

      stream.on('error', (error) => {
        reject(error);
      });

      stream.pipe(parser);
    });
  }

  /**
   * Normalize conversation from different formats
   */
  private normalizeConversation(raw: any): ConversationChunk | null {
    // Detect format and normalize
    let platform: ConversationChunk['platform'] = 'unknown';
    const messages: ConversationChunk['messages'] = [];

    // ChatGPT format with mapping
    if (raw.mapping) {
      platform = 'chatgpt';
      const mapping = raw.mapping;

      for (const [nodeId, node] of Object.entries(mapping) as [string, any][]) {
        if (node.message?.content) {
          const msg = node.message;
          const role = msg.author?.role;
          if (role === 'system') continue;

          const parts = msg.content?.parts || [];
          const content = Array.isArray(parts) ? parts.join('\n') : String(parts);

          if (content) {
            messages.push({
              role: role === 'user' ? 'user' : 'assistant',
              content,
              timestamp: msg.create_time,
              metadata: { id: msg.id },
            });
          }
        }
      }
    }

    // Claude format with chat_messages
    else if (raw.chat_messages || raw.messages) {
      platform = raw.uuid ? 'claude' : 'chatgpt'; // Fallback if uuid present likely Claude
      const msgArray = raw.chat_messages || raw.messages || [];

      for (const msg of msgArray) {
        const role = msg.sender || msg.role || msg.author?.role;
        // Claude uses 'human'/'assistant'.
        if (role === 'system') continue;

        let content = msg.text || msg.content || msg.message || '';
        if (typeof content === 'object') {
          content = content.text || JSON.stringify(content);
        }

        if (content) {
          messages.push({
            role: role === 'human' || role === 'user' ? 'user' : 'assistant',
            content: String(content),
            timestamp: msg.created_at || msg.timestamp,
            metadata: { id: msg.uuid || msg.id },
          });
        }
      }
    }

    // Gemini format (heuristic: often has 'events' or just 'messages' with 'model' role)
    // Structure: { title, events: [ { role: 'user'|'model', parts: [...] } ] }
    // Or sometimes { conversations: [...] } but the parser emits *items* of the root array.
    else if (raw.events || (raw.messages && raw.messages.some((m: any) => m.role === 'model'))) {
       platform = 'gemini';
       const items = raw.events || raw.messages || [];
       
       for (const item of items) {
         const role = item.role;
         if (role === 'system') continue;
         
         let content = '';
         if (item.parts) {
            content = item.parts.map((p: any) => p.text || JSON.stringify(p)).join('\n');
         } else if (item.content) {
            content = item.content;
         }

         if (content) {
            messages.push({
               role: role === 'model' ? 'assistant' : 'user',
               content: String(content),
               timestamp: item.timestamp || item.created_at, // Gemini often lacks explicit timestamp in some exports
               metadata: { id: item.eventId || item.id }
            });
         }
       }
    }

    if (messages.length === 0) {
      // Quietly skip empty or unrecognized
      return null;
    }

    // Apply strict role filtering if configured (optimization)
    const filteredMessages = this.config.roleSubset === 'both' 
      ? messages 
      : messages.filter(m => m.role === 'user' ? this.config.roleSubset === 'user' : this.config.roleSubset === 'assistant');

    if (filteredMessages.length === 0) {
       return null;
    }

    return {
      id: raw.id || raw.uuid || raw.conversationId || `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title: raw.title || raw.name || 'Untitled Conversation',
      messages: filteredMessages,
      created_at: raw.created_at || raw.create_time,
      updated_at: raw.updated_at || raw.update_time,
      platform,
    };
  }

  /**
   * Set maximum buffer size before emitting batch
   */
  setBufferSize(size: number) {
    this.maxBufferSize = size;
  }
}
