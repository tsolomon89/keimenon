import { createReadStream } from 'fs';
import { EventEmitter } from 'events';
import clarinet from 'clarinet';

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
 * Streaming JSON parser for large conversation files
 * Uses SAX-style parsing to avoid loading entire file into memory
 */
export class StreamingJSONParser extends EventEmitter {
  private parser: any;
  private currentObject: any = null;
  private objectStack: any[] = [];
  private keyStack: string[] = [];
  private arrayDepth = 0;
  private conversationBuffer: any[] = [];
  private bufferSize = 0;
  private maxBufferSize = 10; // Process in batches of 10 conversations

  constructor() {
    super();
  }

  /**
   * Parse a large JSON file in streaming fashion
   */
  async parseFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, {
        highWaterMark: 256 * 1024, // 256KB chunks
      });

      this.parser = clarinet.createStream();

      let bytesProcessed = 0;
      let conversationsProcessed = 0;
      let messagesProcessed = 0;
      let inConversationsArray = false;
      let currentConversation: any = null;

      this.parser.on('openobject', (key: string) => {
        // Track object nesting
        if (this.currentObject) {
          this.objectStack.push(this.currentObject);
        }
        this.currentObject = {};

        if (key) {
          this.keyStack.push(key);
        }

        // Detect if we're in a conversation object
        if (this.arrayDepth === 1 && inConversationsArray) {
          currentConversation = {};
        }
      });

      this.parser.on('key', (key: string) => {
        this.keyStack.push(key);
      });

      this.parser.on('value', (value: any) => {
        const key = this.keyStack[this.keyStack.length - 1];

        if (this.currentObject && key) {
          this.currentObject[key] = value;
        }

        // Track message processing
        if (key === 'role' || key === 'sender') {
          messagesProcessed++;
        }
      });

      this.parser.on('closeobject', () => {
        const obj = this.currentObject;

        // Pop key stack
        if (this.keyStack.length > 0 && this.currentObject) {
          const key = this.keyStack.pop();

          if (this.objectStack.length > 0) {
            const parent = this.objectStack.pop();
            if (key) {
              parent[key] = obj;
            }
            this.currentObject = parent;
          }
        }

        // If we just closed a conversation object
        if (this.arrayDepth === 1 && inConversationsArray && obj) {
          // Try to detect platform and normalize
          const normalized = this.normalizeConversation(obj);
          if (normalized) {
            this.conversationBuffer.push(normalized);
            this.bufferSize++;
            conversationsProcessed++;

            // Emit batch when buffer is full
            if (this.bufferSize >= this.maxBufferSize) {
              this.emit('batch', [...this.conversationBuffer]);
              this.emit('progress', {
                conversationsProcessed,
                messagesProcessed,
                bytesProcessed,
                currentConversation: normalized.title,
              });
              this.conversationBuffer = [];
              this.bufferSize = 0;
            }
          }
        }

        if (this.objectStack.length === 0) {
          this.currentObject = null;
        }
      });

      this.parser.on('openarray', () => {
        this.arrayDepth++;
        // Root array is likely the conversations array
        if (this.arrayDepth === 1) {
          inConversationsArray = true;
        }
      });

      this.parser.on('closearray', () => {
        this.arrayDepth--;
        if (this.arrayDepth === 0) {
          inConversationsArray = false;
        }
      });

      this.parser.on('error', (error: Error) => {
        reject(error);
      });

      this.parser.on('end', () => {
        // Flush remaining buffer
        if (this.conversationBuffer.length > 0) {
          this.emit('batch', [...this.conversationBuffer]);
          this.emit('progress', {
            conversationsProcessed,
            messagesProcessed,
            bytesProcessed,
          });
        }
        resolve();
      });

      stream.on('data', (chunk: Buffer) => {
        bytesProcessed += chunk.length;
        this.parser.write(chunk.toString());
      });

      stream.on('end', () => {
        this.parser.close();
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Normalize conversation from different formats
   */
  private normalizeConversation(raw: any): ConversationChunk | null {
    // Detect format and normalize
    let platform: ConversationChunk['platform'] = 'unknown';
    let messages: ConversationChunk['messages'] = [];

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
      platform = raw.uuid ? 'claude' : 'chatgpt';
      const msgArray = raw.chat_messages || raw.messages || [];

      for (const msg of msgArray) {
        const role = msg.sender || msg.role || msg.author?.role;
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

    if (messages.length === 0) {
      return null;
    }

    return {
      id: raw.id || raw.uuid || `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title: raw.title || raw.name || 'Untitled Conversation',
      messages,
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
