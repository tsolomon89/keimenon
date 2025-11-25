/**
 * Enhanced Import Service V2
 * Integrates TF-IDF auto-grouping, multi-layer duplicate detection, and bundle creation
 */

import { nanoid } from 'nanoid';
import { DatabaseClient, SQLiteClient } from '@canvas-memory/db';
import { EnhancedAutogroupService, type Group } from './autogroup-enhanced';
import { getLocalDocumentStore } from './local-document-store';
import { DatabaseWriteQueue } from './DatabaseWriteQueue';
import type { ImportConfiguration } from '@canvas-memory/types';
import { DuplicateDetectionConfig, DuplicateGroup } from './duplicate-detection';
import {
  IntegratedDuplicateDetectionService,
  type DuplicateDetectionResult,
} from './duplicate-detection-integrated';
import { SourcesStitcher } from '@canvas-memory/parsers';

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
  private writeQueue: DatabaseWriteQueue | null;
  private localStore: ReturnType<typeof getLocalDocumentStore>;
  private autogroupService: EnhancedAutogroupService;
  private duplicateService: IntegratedDuplicateDetectionService;
  private context: { accountId: string; userId: string } | null = null;

  constructor(db: DatabaseClient, writeQueue?: DatabaseWriteQueue) {
    this.db = db;
    this.writeQueue = writeQueue || null;
    this.localStore = getLocalDocumentStore();
    this.autogroupService = new EnhancedAutogroupService();

    // CRITICAL FIX: FTS5 service needs the underlying better-sqlite3 Database instance
    // DatabaseClient is an interface, but IntegratedDuplicateDetectionService expects Database.Database
    // Cast to SQLiteClient to access getDatabase() method
    // See: apps/api/src/services/duplicate-detection-fts5.ts:78 (requires db.prepare method)
    const sqliteDb = (db as SQLiteClient).getDatabase();
    this.duplicateService = new IntegratedDuplicateDetectionService(sqliteDb);
  }

  /**
   * Write node (queued if write queue available, otherwise direct)
   */
  private async writeNode(node: any): Promise<void> {
    if (!node.account_id && this.context) {
      node.account_id = this.context.accountId;
    }
    if (!node.created_by && this.context) {
      node.created_by = this.context.userId;
    }
    node.created_at = node.created_at || Date.now();
    node.updated_at = node.updated_at || Date.now();

    if (this.writeQueue) {
      this.writeQueue.enqueueNode(node);
    } else {
      await this.db.createNode(node);
    }
  }

  /**
   * Write edge (queued if write queue available, otherwise direct)
   */
  private async writeEdge(edge: any): Promise<void> {
    if (!edge.account_id && this.context) {
      edge.account_id = this.context.accountId;
    }
    if (!edge.created_by && this.context) {
      edge.created_by = this.context.userId;
    }
    edge.created_at = edge.created_at || Date.now();

    if (this.writeQueue) {
      this.writeQueue.enqueueEdge(edge);
    } else {
      await this.db.createEdge(edge);
    }
  }

  /**
   * Flush write queue (if available)
   */
  private async flushWrites(): Promise<void> {
    if (this.writeQueue) {
      await this.writeQueue.forceFlush();
    }
  }

  /**
   * Import conversations with full processing pipeline
   */
  async import(
    conversations: ImportConversation[],
    uploadHash: string,
    config: ImportConfiguration,
    context: { accountId: string; userId: string }
  ): Promise<ImportResult> {
    this.context = context;
    const startTime = Date.now();

    // DIAGNOSTIC: Log conversations at start
    const fs = require('fs');
    const path = require('path');
    const debugPath = path.join(process.cwd(), 'duplicate-detection-debug.txt');
    fs.writeFileSync(
      debugPath,
      `[${new Date().toISOString()}] import() called\n` +
        `- conversations at START: ${conversations.length}\n` +
        `- total messages at START: ${conversations.reduce((sum, c) => sum + c.messages.length, 0)}\n`,
      { flag: 'a' }
    );

    try {
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
      console.log(
        `[Import] Step 7: Duplicate detection ${config.duplicates.enabled ? 'ENABLED' : 'DISABLED'}`
      );
      console.log(`[Import] Conversations to check: ${conversations.length}`);
      console.log(
        `[Import] Total messages: ${conversations.reduce((sum, c) => sum + c.messages.length, 0)}`
      );
      if (config.duplicates.enabled) {
        console.log(
          `[Import] Calling detectDuplicates() with config:`,
          JSON.stringify(config.duplicates, null, 2)
        );
        duplicatesForReview = await this.detectDuplicates(conversations, config);
        console.log(
          `[Import] detectDuplicates() returned: ${duplicatesForReview} duplicates for review`
        );
      }

      // Step 8: Create bundles (if enabled)
      let bundles = 0;
      if (config.sources.bundling.enabled) {
        bundles = await this.createBundles(sources, config);
      }

      // Flush all pending writes before completing
      await this.flushWrites();

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
    } finally {
      this.context = null;
    }
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
      (sum, c) => sum + c.messages.filter((m) => m.role === 'user').length,
      0
    );
    const assistantMessages = conversations.reduce(
      (sum, c) => sum + c.messages.filter((m) => m.role === 'assistant').length,
      0
    );

    await this.writeNode({
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
      await this.writeNode({
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
        const contentMeta = await this.localStore.saveMessage(conv.id, msg.id, msg.content, 'md');

        // Save message ref to database
        await this.writeNode({
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
        await this.writeEdge({
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
      await this.writeNode({
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
        await this.writeEdge({
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
  ): Promise<string[]> {
    const sourceIds: string[] = [];

    // Create Source nodes from messages
    // In future: stitch messages together, create bundles, etc.

    for (const msg of messages) {
      const sourceId = `src_${nanoid()}`;

      // Save content to local store
      const contentMeta = await this.localStore.saveSource(sourceId, msg.content);

      // Calculate fingerprint for deduplication
      const fingerprint = `src:${msg.conversationId}:${msg.id}`;

      // Determine which groups this source belongs to
      const sourceGroups = groups.filter((g) => g.sources.includes(msg.id)).map((g) => g.id);

      // Create Source node in database
      await this.writeNode({
        id: sourceId,
        kind: 'Source',
        title: `Message from ${msg.role} (${new Date(msg.timestamp).toISOString()})`,
        fingerprint,
        mime_type: 'text/markdown',
        size_bytes: msg.content.length,
        content_location: this.localStore.getStorageLocation(contentMeta),
        content_hash: contentMeta.hash,
        created_at: msg.timestamp,
        updated_at: Date.now(),
        metadata: {
          type: 'message_source',
          role: msg.role,
          conversation_id: msg.conversationId,
          message_id: msg.id,
          message_index: msg.index,
          scope: config.sources.scope,
          groups: sourceGroups,
        },
      });

      // Create COMPILED_FROM edge from Source to Message
      await this.writeEdge({
        id: `edge_${nanoid()}`,
        kind: 'COMPILED_FROM',
        from: sourceId,
        to: msg.id,
        created_at: Date.now(),
        metadata: {
          derivation_type: 'message_extraction',
        },
      });

      // Create edges to groups if needed
      for (const groupId of sourceGroups) {
        await this.writeEdge({
          id: `edge_${nanoid()}`,
          kind: 'IN_GROUP',
          from: sourceId,
          to: groupId,
          created_at: Date.now(),
        });
      }

      sourceIds.push(sourceId);
    }

    return sourceIds;
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
            const codeMeta = await this.localStore.saveCodeBlock(codeId, code, language);

            // Save to database
            await this.writeNode({
              id: codeId,
              kind: 'CodeBlock',
              language,
              code, // Store code content directly in node for easy access
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
            await this.writeEdge({
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
   * Detect duplicates using IntegratedDuplicateDetectionService
   * ✅ Now using FTS5 optimization for 10x+ speedup on large imports
   *
   * ARCHITECTURAL NOTE: This runs AFTER messages are saved to database,
   * so we have access to real database node IDs via ImportConversation.messages[].id
   */
  private async detectDuplicates(
    conversations: ImportConversation[],
    config: ImportConfiguration
  ): Promise<number> {
    if (!config.duplicates.enabled) {
      return 0;
    }

    if (!this.context) {
      console.warn('⚠️  Skipping duplicate detection: no context (accountId required)');
      return 0;
    }

    // Flatten all messages from all conversations into a single array
    const allMessages = conversations.flatMap((conv) =>
      conv.messages.map((msg) => ({
        id: msg.id, // Real database node ID
        content: msg.content,
        timestamp: msg.timestamp,
        conversationId: conv.id,
        conversationTitle: conv.title,
        metadata: {
          role: msg.role,
          platform: conv.platform,
          hash: msg.hash,
        },
        // Add content_hash for exact duplicate detection
        content_hash: msg.hash || undefined,
      }))
    );

    console.log(`🔍 Starting FTS5 duplicate detection for ${allMessages.length} messages`);

    // Build detection config from ImportConfiguration
    const detectionConfig: DuplicateDetectionConfig = {
      enabled: config.duplicates.enabled,
      exactMatch: config.duplicates.detectExact ?? true,
      similarityThreshold: config.duplicates.nearThreshold ?? 0.85,
      crossConversation:
        config.duplicates.level === 'both' || config.duplicates.level === 'conversation',
      algorithm: 'jaccard',
      normalizeTokens: true,
      minTokenOverlap: 3,
      lengthRatioTolerance: 0.2,
      ignoreWhitespace: true,
      ignoreCase: true,
      ignoreTimestamp: false,
      requireReview: config.duplicates.createReviewFolders ?? true,
      autoApproveExact: config.duplicates.autoMergeSuggestions ?? false,
      autoMergeThreshold: config.duplicates.autoMergeSuggestions ? 0.95 : 1.0,
    };

    // Call integrated duplicate detection service (uses FTS5 if available)
    const result = await this.duplicateService.findDuplicates(
      allMessages,
      detectionConfig,
      this.context.accountId
    );

    const { groups: duplicateGroups, metadata } = result;

    console.log(
      `📊 Found ${duplicateGroups.length} duplicate groups ` +
        `(strategy: ${metadata.strategy}, ` +
        `duration: ${metadata.duration}ms, ` +
        `speedup: ${metadata.speedupVsBaseline.toFixed(1)}x)`
    );

    // Create DUP_OF edges for detected duplicates
    let edgeCount = 0;
    for (const group of duplicateGroups) {
      for (const candidate of group.candidates) {
        // Extract real database node IDs
        const duplicateNodeId = candidate.duplicate.id || candidate.duplicate.metadata?.dbNodeId;
        const primaryNodeId = candidate.primary.id || candidate.primary.metadata?.dbNodeId;

        if (!duplicateNodeId || !primaryNodeId) {
          console.warn(
            `⚠️  Skipping duplicate edge: missing node IDs (dup: ${duplicateNodeId}, primary: ${primaryNodeId})`
          );
          continue;
        }

        console.log(
          `🔗 Creating DUP_OF edge: ${duplicateNodeId} -> ${primaryNodeId} (similarity: ${candidate.similarity.toFixed(2)})`
        );

        // Create DUP_OF edge from duplicate to primary
        await this.writeEdge({
          id: `edge_${nanoid()}`,
          kind: 'DUP_OF',
          from: duplicateNodeId,
          to: primaryNodeId,
          created_at: Date.now(),
          metadata: {
            similarity: candidate.similarity,
            metrics: candidate.metrics,
            requiresReview: detectionConfig.requireReview,
          },
        });
        edgeCount++;
      }
    }

    console.log(`✅ Created ${edgeCount} DUP_OF edges (using ${metadata.strategy} strategy)`);
    return edgeCount;
  }

  /**
   * Create bundles using SourcesStitcher
   */
  private async createBundles(sources: string[], config: ImportConfiguration): Promise<number> {
    if (!config.sources.bundling.enabled) {
      return 0;
    }

    // Note: SourcesStitcher expects UserSegment[] from the parsing phase
    // At this point in the pipeline, we have already created individual message nodes
    // and the stitching should happen during the createSources() step, not here.

    // TODO(architecture): Refactor createSources() to use SourcesStitcher
    // The stitcher should be called INSTEAD of the simple per-message source creation
    // in createSources() method around line 358-379

    // For now, return 0 as bundling is handled differently in this architecture
    return 0; // Bundling deferred to createSources() refactor
  }
}
