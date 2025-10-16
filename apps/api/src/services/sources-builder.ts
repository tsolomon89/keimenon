import { EventEmitter } from 'events';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  conversationId: string;
  index: number;
}

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  messageIds: string[];
  conversationId: string;
  platform: string;
  created_at?: string;
  metadata: {
    messageCount: number;
    charCount: number;
    hasCode: boolean;
    topics?: string[];
  };
}

export interface SourcesConfig {
  // Role & length filters
  roleSubset: 'both' | 'user' | 'assistant';
  minCharsUser: number;
  minCharsAssistant: number;

  // Stitching strategy
  stitchStrategy: 'by_chat' | 'by_title' | 'by_topic';
  preserveChatIntegrity: boolean;
  sourcesCap: number;

  // Assistant context
  includeAssistantContext: boolean;
  assistantContextLines: number;

  // Similarity & deduplication
  similarityThreshold: number;
  attachMode: 'unique' | 'non-unique';
}

/**
 * Sources Builder - Stitches conversation messages into source documents
 * Based on the "Sources Mode" from project examples
 */
export class SourcesBuilder extends EventEmitter {
  private config: SourcesConfig;
  private sources: SourceDocument[] = [];
  private messageIndex: Map<string, Message> = new Map();

  constructor(config: Partial<SourcesConfig> = {}) {
    super();

    // Default configuration
    this.config = {
      roleSubset: config.roleSubset || 'both',
      minCharsUser: config.minCharsUser || 400,
      minCharsAssistant: config.minCharsAssistant || 400,
      stitchStrategy: config.stitchStrategy || 'by_chat',
      preserveChatIntegrity: config.preserveChatIntegrity !== undefined
        ? config.preserveChatIntegrity
        : true,
      sourcesCap: config.sourcesCap || 150,
      includeAssistantContext: config.includeAssistantContext || false,
      assistantContextLines: config.assistantContextLines || 3,
      similarityThreshold: config.similarityThreshold || 0.35,
      attachMode: config.attachMode || 'non-unique',
    };
  }

  /**
   * Process conversations and build source documents
   */
  async buildSources(conversations: Array<{
    id: string;
    title: string;
    messages: Message[];
    platform: string;
    created_at?: string;
  }>): Promise<SourceDocument[]> {
    this.sources = [];
    this.messageIndex.clear();

    for (const conv of conversations) {
      await this.processConversation(conv);

      // Check if we've hit the sources cap
      if (this.sources.length >= this.config.sourcesCap) {
        this.emit('cap-reached', this.config.sourcesCap);
        break;
      }
    }

    this.emit('complete', {
      totalSources: this.sources.length,
      totalMessages: this.messageIndex.size,
    });

    return this.sources;
  }

  /**
   * Process a single conversation into sources
   */
  private async processConversation(conversation: {
    id: string;
    title: string;
    messages: Message[];
    platform: string;
    created_at?: string;
  }): Promise<void> {
    const { id, title, messages, platform, created_at } = conversation;

    // Filter messages by role and length
    const filteredMessages = messages.filter((msg) => {
      if (this.config.roleSubset === 'user' && msg.role !== 'user') return false;
      if (this.config.roleSubset === 'assistant' && msg.role !== 'assistant') return false;

      const minChars = msg.role === 'user'
        ? this.config.minCharsUser
        : this.config.minCharsAssistant;

      return msg.content.length >= minChars;
    });

    if (filteredMessages.length === 0) return;

    // Strategy: by_chat - create one source per conversation
    if (this.config.stitchStrategy === 'by_chat') {
      const source = await this.createSource(
        `${title} - ${platform}`,
        filteredMessages,
        id,
        platform,
        created_at
      );

      if (source) {
        this.sources.push(source);
      }
    }

    // Strategy: by_title - group similar titles
    else if (this.config.stitchStrategy === 'by_title') {
      // Find existing source with similar title
      const existingSource = this.findSimilarSource(title);

      if (existingSource && !this.config.preserveChatIntegrity) {
        // Merge into existing source
        this.mergeIntoSource(existingSource, filteredMessages);
      } else {
        // Create new source
        const source = await this.createSource(
          title,
          filteredMessages,
          id,
          platform,
          created_at
        );

        if (source) {
          this.sources.push(source);
        }
      }
    }

    // Strategy: by_topic - extract topics and group
    else if (this.config.stitchStrategy === 'by_topic') {
      // Group messages by detected topics
      const topicGroups = this.groupByTopics(filteredMessages, title);

      for (const [topic, msgs] of topicGroups.entries()) {
        const source = await this.createSource(
          topic,
          msgs,
          id,
          platform,
          created_at
        );

        if (source) {
          this.sources.push(source);
        }
      }
    }
  }

  /**
   * Create a source document from messages
   */
  private async createSource(
    title: string,
    messages: Message[],
    conversationId: string,
    platform: string,
    created_at?: string
  ): Promise<SourceDocument | null> {
    if (messages.length === 0) return null;

    const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Build content
    let content = '';
    const messageIds: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      messageIds.push(msg.id);
      this.messageIndex.set(msg.id, msg);

      // Add message content
      const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**';
      content += `\n\n${roleLabel}:\n${msg.content}`;

      // Add assistant context if enabled
      if (this.config.includeAssistantContext && msg.role === 'user' && i < messages.length - 1) {
        const nextMessages = messages.slice(i + 1, i + 1 + this.config.assistantContextLines);
        const assistantMsgs = nextMessages.filter(m => m.role === 'assistant');

        if (assistantMsgs.length > 0) {
          content += '\n\n> **Context from Assistant:**';
          for (const assistantMsg of assistantMsgs) {
            const preview = assistantMsg.content.slice(0, 200);
            content += `\n> ${preview}${assistantMsg.content.length > 200 ? '...' : ''}`;
          }
        }
      }
    }

    // Detect code blocks
    const hasCode = /```[\s\S]*?```|`[^`]+`/.test(content);

    const source: SourceDocument = {
      id: sourceId,
      title: this.sanitizeTitle(title),
      content: content.trim(),
      messageIds,
      conversationId,
      platform,
      created_at,
      metadata: {
        messageCount: messages.length,
        charCount: content.length,
        hasCode,
      },
    };

    return source;
  }

  /**
   * Find a source with similar title
   */
  private findSimilarSource(title: string): SourceDocument | undefined {
    const normalized = this.normalizeTitle(title);

    return this.sources.find(source => {
      const sourceTitle = this.normalizeTitle(source.title);
      const similarity = this.calculateJaccardSimilarity(
        this.tokenize(normalized),
        this.tokenize(sourceTitle)
      );

      return similarity >= this.config.similarityThreshold;
    });
  }

  /**
   * Merge messages into an existing source
   */
  private mergeIntoSource(source: SourceDocument, messages: Message[]): void {
    for (const msg of messages) {
      if (!source.messageIds.includes(msg.id)) {
        source.messageIds.push(msg.id);
        this.messageIndex.set(msg.id, msg);

        const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**';
        source.content += `\n\n${roleLabel}:\n${msg.content}`;
      }
    }

    // Update metadata
    source.metadata.messageCount = source.messageIds.length;
    source.metadata.charCount = source.content.length;
    source.metadata.hasCode = /```[\s\S]*?```|`[^`]+`/.test(source.content);
  }

  /**
   * Group messages by detected topics
   */
  private groupByTopics(messages: Message[], defaultTopic: string): Map<string, Message[]> {
    const topics = new Map<string, Message[]>();

    // Simple topic extraction - look for common keywords
    const topicKeywords = new Map<string, string[]>();
    topicKeywords.set('code', ['code', 'function', 'class', 'implement', 'debug', 'error']);
    topicKeywords.set('design', ['design', 'architecture', 'pattern', 'structure', 'ui', 'ux']);
    topicKeywords.set('data', ['data', 'database', 'query', 'schema', 'table', 'api']);
    topicKeywords.set('docs', ['document', 'documentation', 'explain', 'description', 'guide']);

    for (const msg of messages) {
      const contentLower = msg.content.toLowerCase();
      let assignedTopic = defaultTopic;

      // Find matching topic
      for (const [topic, keywords] of topicKeywords.entries()) {
        const matches = keywords.filter(kw => contentLower.includes(kw)).length;
        if (matches >= 2) {
          assignedTopic = topic;
          break;
        }
      }

      if (!topics.has(assignedTopic)) {
        topics.set(assignedTopic, []);
      }
      topics.get(assignedTopic)!.push(msg);
    }

    return topics;
  }

  /**
   * Calculate Jaccard similarity between two token sets
   */
  private calculateJaccardSimilarity(tokens1: Set<string>, tokens2: Set<string>): number {
    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Tokenize text for similarity comparison
   */
  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );
  }

  /**
   * Normalize title for comparison
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Sanitize title for filename/display
   */
  private sanitizeTitle(title: string): string {
    return title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  /**
   * Get sources
   */
  getSources(): SourceDocument[] {
    return this.sources;
  }

  /**
   * Get message by ID
   */
  getMessage(id: string): Message | undefined {
    return this.messageIndex.get(id);
  }
}
