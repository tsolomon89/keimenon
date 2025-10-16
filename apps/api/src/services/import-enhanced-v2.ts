/**
 * Enhanced Import Service V2
 * Integrates TF-IDF auto-grouping, multi-layer duplicate detection, and bundle creation
 */

import { nanoid } from 'nanoid';
import { DatabaseClient } from '@canvas-memory/db';
import { EnhancedAutogroupService, type Group } from './autogroup-enhanced';
import { getLocalDocumentStore } from './local-document-store';
import type { ImportConfiguration } from '@canvas-memory/types';

export interface ImportMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  conversationId: string;
  index: number;
  hash?: string;
}

export interface ImportConversation {
  id: string;
  title: string;
  platform: string;
  messages: ImportMessage[];
  created_at: number;
}

export interface ImportResult {
  uploadHash: string;
  conversations: number;
  messages: number;
  groups: Group[];
  sources: number;
  codeBlocks: number;
  duplicatesForReview: number;
  bundles: number;
  stats: {
    grouping: {
      manualGroups: number;
      autoGroups: number;
      catchAllGroup: boolean;
      avgGroupSize: number;
    };
    processing: {
      durationMs: number;
      messagesPerSecond: number;
    };
  };
}

/**
 * Enhanced import service with integrated grouping
 */
export class EnhancedImportServiceV2 {
  private db: DatabaseClient;
  private localStore: ReturnType<typeof getLocalDocumentStore>;
  private autogroupService: EnhancedAutogroupService;

  constructor(db: DatabaseClient) {
    this.db = db;
    this.localStore = getLocalDocumentStore();
    this.autogroupService = new EnhancedAutogroupService();
  }

  /**
   * Import conversations with full processing pipeline
   */
  async import(
    conversations: ImportConversation[],
    uploadHash: string,
    config: ImportConfiguration
  ): Promise<ImportResult> {
    const startTime = Date.now();

    // Step 1: Save upload metadata
    await this.saveUploadMetadata(uploadHash, conversations, config);

    // Step 2: Extract messages for grouping
    const allMessages = this.extractMessages(conversations, config);

    // Step 3: Auto-group messages
    const groupResult = await this.autogroupService.autoGroupMessages(
      allMessages,
      config.grouping
    );

    // Step 4: Save conversations, messages, and groups to database
    await this.saveToDatabase(conversations, groupResult.groups, uploadHash);

    // Step 5: Create sources from messages
    const sources = await this.createSources(allMessages, groupResult.groups, config);

    // Step 6: Extract code blocks (if enabled)
    let codeBlocks = 0;
    if (config.code.extract) {
      codeBlocks = await this.extractCodeBlocks(conversations, config);
    }

    // Step 7: Detect duplicates (if enabled)
    let duplicatesForReview = 0;
    if (config.duplicates.enabled) {
      duplicatesForReview = await this.detectDuplicates(sources, groupResult.groups, config);
    }

    // Step 8: Create bundles (if enabled)
    let bundles = 0;
    if (config.sources.bundling.enabled) {
      bundles = await this.createBundles(sources, config);
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);

    return {
      uploadHash,
      conversations: conversations.length,
      messages: totalMessages,
      groups: groupResult.groups,
      sources: sources.length,
      codeBlocks,
      duplicatesForReview,
      bundles,
      stats: {
        grouping: {
          manualGroups: groupResult.stats.manualGroups,
          autoGroups: groupResult.stats.autoGroups,
          catchAllGroup: groupResult.stats.catchAllGroup,
          avgGroupSize: groupResult.stats.avgGroupSize,
        },
        processing: {
          durationMs,
          messagesPerSecond: Math.round((totalMessages / durationMs) * 1000),
        },
      },
    };
  }

  /**
   * Save upload metadata
   */
  private async saveUploadMetadata(
    uploadHash: string,
    conversations: ImportConversation[],
    config: ImportConfiguration
  ): Promise<void> {
    const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
    const userMessages = conversations.reduce(
      (sum, c) => sum + c.messages.filter(m => m.role === 'user').length,
      0
    );
    const assistantMessages = conversations.reduce(
      (sum, c) => sum + c.messages.filter(m => m.role === 'assistant').length,
      0
    );

    await this.db.createNode({
      id: `upload_${uploadHash}`,
      kind: 'UploadItem',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        uploadHash,
        platform: conversations[0]?.platform || 'unknown',
        conversationCount: conversations.length,
        messageCount: totalMessages,
        userMessages,
        assistantMessages,
        config: config,
      },
    });
  }

  /**
   * Extract all messages for grouping
   */
  private extractMessages(
    conversations: ImportConversation[],
    config: ImportConfiguration
  ): ImportMessage[] {
    const messages: ImportMessage[] = [];

    for (const conv of conversations) {
      for (const msg of conv.messages) {
        // Filter by role
        if (config.sources.roleFilter.user && msg.role === 'user') {
          if (msg.content.length >= config.sources.minLengthUser) {
            messages.push(msg);
          }
        }

        if (config.sources.roleFilter.ai && msg.role === 'assistant') {
          if (msg.content.length >= config.sources.minLengthAI) {
            messages.push(msg);
          }
        }
      }
    }

    return messages;
  }

  /**
   * Save conversations, messages, and groups to database
   */
  private async saveToDatabase(
    conversations: ImportConversation[],
    groups: Group[],
    uploadHash: string
  ): Promise<void> {
    // Save conversations as ChatThread nodes
    for (const conv of conversations) {
      await this.db.createNode({
        id: conv.id,
        kind: 'ChatThread',
        title: conv.title,
        created_at: conv.created_at,
        updated_at: Date.now(),
        metadata: {
          platform: conv.platform,
          messageCount: conv.messages.length,
          uploadHash,
        },
      });

      // Save messages (content to local store)
      for (const msg of conv.messages) {
        // Save content to local filesystem
        const contentMeta = await this.localStore.saveMessage(
          conv.id,
          msg.id,
          msg.content,
          'md'
        );

        // Save message ref to database
        await this.db.createNode({
          id: msg.id,
          kind: 'Message',
          role: msg.role,
          thread_id: conv.id,
          timestamp: msg.timestamp,
          content_location: this.localStore.getStorageLocation(contentMeta),
          char_count: msg.content.length,
          created_at: msg.timestamp,
          updated_at: Date.now(),
          metadata: {
            hash: msg.hash,
            index: msg.index,
          },
        });

        // Create HAS_MESSAGE edge
        await this.db.createEdge({
          id: `edge_${nanoid()}`,
          kind: 'HAS_MESSAGE',
          from: conv.id,
          to: msg.id,
          created_at: Date.now(),
          metadata: {
            index: msg.index,
          },
        });
      }
    }

    // Save groups
    for (const group of groups) {
      await this.db.createNode({
        id: group.id,
        kind: 'Group',
        name: group.name,
        member_count: group.sources.length,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          keywords: group.keywords,
          isManual: group.isManual,
          isCatchAll: group.isCatchAll,
          confidence: group.confidence,
        },
      });

      // Create CONTAINS edges to messages
      for (const sourceId of group.sources) {
        await this.db.createEdge({
          id: `edge_${nanoid()}`,
          kind: 'CONTAINS',
          from: group.id,
          to: sourceId,
          created_at: Date.now(),
        });
      }
    }
  }

  /**
   * Create source documents from messages
   */
  private async createSources(
    messages: ImportMessage[],
    groups: Group[],
    config: ImportConfiguration
  ): Promise<any[]> {
    const sources: any[] = [];

    // For now, sources are just the messages themselves
    // In future: stitch messages together, create bundles, etc.

    for (const msg of messages) {
      sources.push({
        id: msg.id,
        type: config.sources.scope,
        role: msg.role,
        content_location: `local://messages/${msg.conversationId}/${msg.id}.md`,
        groups: groups.filter(g => g.sources.includes(msg.id)).map(g => g.id),
      });
    }

    return sources;
  }

  /**
   * Extract code blocks from messages
   */
  private async extractCodeBlocks(
    conversations: ImportConversation[],
    config: ImportConfiguration
  ): Promise<number> {
    let count = 0;

    // Extract code blocks from assistant messages
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (msg.role !== 'assistant') continue;

        // Find fenced code blocks
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;

        while ((match = codeBlockRegex.exec(msg.content)) !== null) {
          const language = match[1] || 'text';
          const code = match[2];

          if (code.length >= config.code.minLength) {
            const codeId = `code_${nanoid()}`;

            // Save to local store
            const codeMeta = await this.localStore.saveCodeBlock(
              codeId,
              code,
              language
            );

            // Save to database
            await this.db.createNode({
              id: codeId,
              kind: 'CodeBlock',
              language,
              content_location: this.localStore.getStorageLocation(codeMeta),
              content_hash: codeMeta.hash,
              line_count: code.split('\n').length,
              char_count: code.length,
              created_at: Date.now(),
              updated_at: Date.now(),
              metadata: {
                derived_from_message_id: msg.id,
              },
            });

            // Create EXTRACTED_FROM edge
            await this.db.createEdge({
              id: `edge_${nanoid()}`,
              kind: 'EXTRACTED_FROM',
              from: codeId,
              to: msg.id,
              created_at: Date.now(),
            });

            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Detect duplicates (stub for now)
   */
  private async detectDuplicates(
    sources: any[],
    groups: Group[],
    config: ImportConfiguration
  ): Promise<number> {
    // TODO: Implement multi-layer duplicate detection
    // For now, return 0
    return 0;
  }

  /**
   * Create bundles (stub for now)
   */
  private async createBundles(sources: any[], config: ImportConfiguration): Promise<number> {
    // TODO: Implement bundle creation
    // For now, return 0
    return 0;
  }
}
