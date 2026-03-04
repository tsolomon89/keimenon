/**
 * Enhanced Import Service V2
 * Integrates TF-IDF auto-grouping, multi-layer duplicate detection, and bundle creation
 */

import { nanoid } from 'nanoid';
import { DatabaseClient, SQLiteClient } from '@keimenon/db';
import { EnhancedAutogroupService, type Group } from './autogroup-enhanced';
import { getLocalDocumentStore } from './local-document-store';
import { DatabaseWriteQueue } from './DatabaseWriteQueue';
import type { ImportConfiguration } from '@keimenon/types';
import { DuplicateDetectionConfig, DuplicateGroup } from './duplicate-detection';
import {
  IntegratedDuplicateDetectionService,
  type DuplicateDetectionResult,
} from './duplicate-detection-integrated';
import { SourcesStitcher } from '@keimenon/parsers';
import { GraphSpineBuilder } from './graph-spine-builder';
import { PrincipalService, AgentPlatform } from './principal-service';
import { WORKER_CONFIG } from '../modules/jobs/jobs.config';
import type { LexemeNode, PhraseNode, TopicNode, SourceDoc, PrincipalNode } from '@keimenon/types';

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
    // V2: Spine extraction stats
    spine?: {
      lexemes: number;
      phrases: number;
      topics: number;
    };
  };
  // For ChangeTracker rollback support
  createdNodeIds: string[];
  createdEdgeIds: string[];
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
  private principalService: PrincipalService;
  private context: { accountId: string; userId: string } | null = null;

  // Track created entities for ChangeTracker rollback support
  private createdNodeIds: string[] = [];
  private createdEdgeIds: string[] = [];

  // World Model V5: Track resolved principals for this import batch
  private humanPrincipal: PrincipalNode | null = null;
  private agentPrincipal: PrincipalNode | null = null;

  constructor(db: DatabaseClient, writeQueue?: DatabaseWriteQueue) {
    this.db = db;
    this.writeQueue = writeQueue || null;
    this.localStore = getLocalDocumentStore();
    this.autogroupService = new EnhancedAutogroupService();
    this.principalService = new PrincipalService(db);

    // CRITICAL FIX: FTS5 service needs the underlying better-sqlite3 Database instance
    // DatabaseClient is an interface, but IntegratedDuplicateDetectionService expects Database.Database
    // Cast to SQLiteClient to access getDatabase() method
    // See: apps/api/src/services/duplicate-detection-fts5.ts:78 (requires db.prepare method)
    const sqliteDb = (db as SQLiteClient).getDatabase();
    this.duplicateService = new IntegratedDuplicateDetectionService(sqliteDb);
  }

  /**
   * Write node (queued if write queue available, otherwise direct)
   * Tracks created node ID for ChangeTracker rollback support
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

    // Track the node ID for rollback support
    if (node.id) {
      this.createdNodeIds.push(node.id);
    }

    if (this.writeQueue) {
      this.writeQueue.enqueueNode(node);
    } else {
      await this.db.createNode(node);
    }
  }

  /**
   * Write edge (queued if write queue available, otherwise direct)
   * Tracks created edge ID for ChangeTracker rollback support
   */
  private async writeEdge(edge: any): Promise<void> {
    if (!edge.account_id && this.context) {
      edge.account_id = this.context.accountId;
    }
    if (!edge.created_by && this.context) {
      edge.created_by = this.context.userId;
    }
    edge.created_at = edge.created_at || Date.now();

    // Track the edge ID for rollback support
    if (edge.id) {
      this.createdEdgeIds.push(edge.id);
    }

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

    // Reset entity tracking for this import batch
    this.createdNodeIds = [];
    this.createdEdgeIds = [];

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
      if (config.duplicates.enabled) {
        duplicatesForReview = await this.detectDuplicates(conversations, config);
      }

      // Step 8: Create bundles (if enabled)
      let bundles = 0;
      if (config.sources.bundling.enabled) {
        bundles = await this.createBundles(sources, config);
      }

      // Step 9: Extract spine (V2 - if enabled)
      let spineStats = { lexemes: 0, phrases: 0, topics: 0 };
      if (config.spine?.enabled) {
        console.log('[Import] Step 9: Spine extraction ENABLED');
        spineStats = await this.extractSpine(allMessages, config);
        console.log(
          `[Import] Spine extraction complete: ${spineStats.lexemes} lexemes, ${spineStats.phrases} phrases, ${spineStats.topics} topics`
        );
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
          spine: config.spine?.enabled ? spineStats : undefined,
        },
        // For ChangeTracker rollback support
        createdNodeIds: this.createdNodeIds,
        createdEdgeIds: this.createdEdgeIds,
      };
    } catch (error: any) {
      // Rollback: Delete any entities created during this batch on failure
      // This prevents orphaned data from partial imports
      console.error('[Import] Error during import, rolling back created entities:', error.message);
      await this.rollbackCreatedEntities();
      throw error; // Re-throw to let caller handle
    } finally {
      this.context = null;
      // Reset Principal references for next import batch
      this.humanPrincipal = null;
      this.agentPrincipal = null;
    }
  }

  /**
   * Rollback created entities on import failure
   * Deletes edges first (due to foreign key constraints), then nodes
   */
  private async rollbackCreatedEntities(): Promise<void> {
    if (this.createdNodeIds.length === 0 && this.createdEdgeIds.length === 0) {
      return;
    }

    console.log(
      `[Import] Rolling back ${this.createdEdgeIds.length} edges and ${this.createdNodeIds.length} nodes`
    );

    try {
      // Flush any pending writes first
      await this.flushWrites();

      const sqliteDb = (this.db as SQLiteClient).getDatabase();

      // Bug fix #13: Validate accountId before rollback to prevent accidental empty string matching
      const accountId = this.context?.accountId;
      if (!accountId) {
        console.error('[Import] Cannot rollback: no accountId in context');
        return;
      }

      // Delete edges first (foreign key constraints)
      if (this.createdEdgeIds.length > 0) {
        const edgePlaceholders = this.createdEdgeIds.map(() => '?').join(',');
        const deleteEdgesStmt = sqliteDb.prepare(
          `DELETE FROM edges WHERE id IN (${edgePlaceholders}) AND account_id = ?`
        );
        deleteEdgesStmt.run(...this.createdEdgeIds, accountId);
        console.log(`[Import] Rolled back ${this.createdEdgeIds.length} edges`);
      }

      // Delete nodes
      if (this.createdNodeIds.length > 0) {
        const nodePlaceholders = this.createdNodeIds.map(() => '?').join(',');
        const deleteNodesStmt = sqliteDb.prepare(
          `DELETE FROM nodes WHERE id IN (${nodePlaceholders}) AND account_id = ?`
        );
        deleteNodesStmt.run(...this.createdNodeIds, accountId);
        console.log(`[Import] Rolled back ${this.createdNodeIds.length} nodes`);
      }

      // Clear tracking arrays after successful rollback
      this.createdNodeIds = [];
      this.createdEdgeIds = [];
    } catch (rollbackError: any) {
      console.error('[Import] Rollback failed:', rollbackError.message);
      // Don't throw - the original error is more important
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
   * World Model V5: Creates Principal nodes and ConversationThread with relationship edges
   */
  private async saveToDatabase(
    conversations: ImportConversation[],
    groups: Group[],
    uploadHash: string
  ): Promise<void> {
    // World Model V5: Resolve Principals before creating conversations
    // This ensures idempotent creation - same import = same Principals
    await this.resolvePrincipals(conversations);

    // Save conversations as ConversationThread nodes (World Model V5)
    for (const conv of conversations) {
      // Detect platform for this conversation
      const platform = PrincipalService.detectPlatform(conv.platform);

      // Get source IDs for context_spec (will be populated after source creation)
      // For now, we track the conversation ID and update context later
      const conversationSourceIds: string[] = [];

      // Create ConversationThread node (World Model V5)
      await this.writeNode({
        id: conv.id,
        kind: 'ConversationThread',
        title: conv.title,
        human_principal_id: this.humanPrincipal?.id,
        agent_principal_id: this.agentPrincipal?.id,
        purpose: 'general', // Default for imports
        context_spec: {
          source_ids: conversationSourceIds,
          group_ids: [],
          expansion_rule: 'none',
        },
        created_at: conv.created_at,
        updated_at: Date.now(),
        metadata: {
          platform: conv.platform,
          messageCount: conv.messages.length,
          uploadHash,
        },
      });

      // Create INITIATED_BY edge (ConversationThread -> Human Principal)
      if (this.humanPrincipal) {
        await this.writeEdge({
          id: `edge_${nanoid()}`,
          kind: 'INITIATED_BY',
          from: conv.id,
          to: this.humanPrincipal.id,
          created_at: Date.now(),
        });
      }

      // Create PARTICIPATED_IN edge (Agent Principal -> ConversationThread)
      if (this.agentPrincipal) {
        await this.writeEdge({
          id: `edge_${nanoid()}`,
          kind: 'PARTICIPATED_IN',
          from: this.agentPrincipal.id,
          to: conv.id,
          created_at: Date.now(),
          metadata: {
            role: 'agent',
          },
        });
      }

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
   * World Model V5: Resolve or create Principal nodes for this import batch
   * - Human Principal: The user who is importing
   * - Agent Principal: The AI assistant in the conversations (by platform)
   */
  private async resolvePrincipals(conversations: ImportConversation[]): Promise<void> {
    if (!this.context) {
      console.warn('[Import] No context available for Principal resolution');
      return;
    }

    const { accountId, userId } = this.context;

    // Resolve human Principal for the uploader
    // Bug fix #11: Re-throw errors instead of swallowing them
    // Principal resolution is critical - failing silently creates incomplete graph data
    try {
      this.humanPrincipal = await this.principalService.resolveHumanPrincipal(accountId, userId);
      console.log(`[Import] Resolved human Principal: ${this.humanPrincipal.id}`);
    } catch (error: any) {
      console.error('[Import] Failed to resolve human Principal:', error.message);
      throw new Error(`Principal resolution failed: ${error.message}`);
    }

    // Detect platform from conversations (use the first conversation's platform)
    const platform = conversations[0]?.platform || 'unknown';
    const agentPlatform = PrincipalService.detectPlatform(platform);

    // Resolve agent Principal for the platform
    try {
      this.agentPrincipal = await this.principalService.resolveAgentPrincipal(
        accountId,
        agentPlatform,
        userId
      );
      console.log(
        `[Import] Resolved agent Principal: ${this.agentPrincipal.id} (${agentPlatform})`
      );
    } catch (error: any) {
      console.error('[Import] Failed to resolve agent Principal:', error.message);
      throw new Error(`Agent Principal resolution failed: ${error.message}`);
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

    // OPTIMIZATION: Pre-build message-to-groups lookup map
    // Converts O(m * g * s) to O(g * s + m) where m=messages, g=groups, s=sources per group
    const messageToGroups = new Map<string, string[]>();
    for (const group of groups) {
      for (const sourceId of group.sources) {
        if (!messageToGroups.has(sourceId)) {
          messageToGroups.set(sourceId, []);
        }
        messageToGroups.get(sourceId)!.push(group.id);
      }
    }

    // Create Source nodes from messages
    // In future: stitch messages together, create bundles, etc.

    for (const msg of messages) {
      const sourceId = `src_${nanoid()}`;

      // Save content to local store
      const contentMeta = await this.localStore.saveSource(sourceId, msg.content);

      // Calculate fingerprint for deduplication
      const fingerprint = `src:${msg.conversationId}:${msg.id}`;

      // OPTIMIZATION: O(1) lookup instead of O(g * s) filter+includes
      const sourceGroups = messageToGroups.get(msg.id) || [];

      // Create Source node in database with full World Model provenance
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
        // World Model V5: Full provenance tracking (WHO/HOW/FROM/VERIFIED)
        provenance: {
          origin_principal_id: this.humanPrincipal?.id || this.context?.userId || 'unknown', // WHO: Principal who imported
          origin_type: 'chat_import', // HOW: Chat import mechanism
          origin_ref: msg.conversationId, // FROM: Source conversation ID
          trust_state: 'ugc', // VERIFIED: User-generated content
          original_url: undefined, // N/A for chat imports
          retrieved_at: Date.now(),
        },
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

      // World Model V5: Create CREATED_BY edge from Source to Human Principal
      if (this.humanPrincipal) {
        await this.writeEdge({
          id: `edge_${nanoid()}`,
          kind: 'CREATED_BY',
          from: sourceId,
          to: this.humanPrincipal.id,
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

  /**
   * Extract spine (V2): Create Lexeme, Phrase, and Topic nodes from imported content
   * This implements "Step 2" of the Vision workflow: building the UGC wiki spine
   *
   * CROSS-CONVERSATION DEDUPLICATION:
   * Uses extractSpineBatch to check for existing Lexeme/Phrase nodes before creating new ones.
   * This enables cross-conversation linking where "Dark Matter" mentioned in multiple chats
   * becomes a single hub node with multiple MENTIONS edges.
   *
   * BATCH PROCESSING (Performance Fix):
   * Instead of O(n) DB queries (one per message), we process in batches of SPINE_BATCH_SIZE,
   * reducing DB round-trips from O(n) to O(n/batchSize) = effectively O(1) for typical imports.
   */
  private async extractSpine(
    messages: ImportMessage[],
    config: ImportConfiguration
  ): Promise<{ lexemes: number; phrases: number; topics: number }> {
    const spineBuilder = GraphSpineBuilder.getInstance();
    const spineConfig = config.spine;

    if (!spineConfig?.enabled) {
      return { lexemes: 0, phrases: 0, topics: 0 };
    }

    // Bug fix #12: Validate context before spine extraction
    if (!this.context?.accountId || !this.context?.userId) {
      console.error('[Import] Cannot extract spine: no context available');
      return { lexemes: 0, phrases: 0, topics: 0 };
    }

    const { accountId, userId } = this.context;
    const spineBatchSize = WORKER_CONFIG.import.spineBatchSize;

    let totalLexemes = 0;
    let totalPhrases = 0;
    let linkedLexemes = 0;
    let linkedPhrases = 0;
    const allPhrases: PhraseNode[] = [];

    // Process messages in batches to reduce DB round-trips
    for (let i = 0; i < messages.length; i += spineBatchSize) {
      const batch = messages.slice(i, i + spineBatchSize);

      // Single batch call replaces N sequential calls
      const result = await spineBuilder.extractSpineBatch(
        this.db as SQLiteClient,
        accountId,
        batch.map((m) => ({ id: m.id, content: m.content })),
        userId
      );

      // Save NEW Lexeme nodes (if enabled)
      if (spineConfig.extractLexemes) {
        for (const lexeme of result.newLexemes) {
          await this.writeNode({
            id: lexeme.id,
            kind: 'Lexeme',
            lemma: lexeme.lemma,
            pos: lexeme.pos,
            frequency: lexeme.frequency,
            created_at: lexeme.created_at,
            updated_at: lexeme.updated_at,
            metadata: lexeme.metadata,
          });
          totalLexemes++;
        }
        linkedLexemes += result.existingLexemes.length;
      }

      // Save NEW Phrase nodes (if enabled)
      if (spineConfig.extractPhrases) {
        // Filter new phrases by minimum frequency
        const filteredNewPhrases = result.newPhrases.filter(
          (p) => p.frequency >= (spineConfig.minPhraseFrequency || 2)
        );

        for (const phrase of filteredNewPhrases) {
          await this.writeNode({
            id: phrase.id,
            kind: 'Phrase',
            text: phrase.text,
            normalized_text: phrase.normalized_text,
            type: phrase.type,
            entity_type: phrase.entity_type,
            frequency: phrase.frequency,
            created_at: phrase.created_at,
            updated_at: phrase.updated_at,
            metadata: phrase.metadata,
          });
          allPhrases.push(phrase);
          totalPhrases++;
        }

        linkedPhrases += result.existingPhrases.length;
        // Add existing phrases to allPhrases for topic clustering
        allPhrases.push(...result.existingPhrases);
      }

      // Save ALL MENTIONS edges (creates cross-conversation links)
      for (const edge of result.edges) {
        await this.writeEdge({
          id: edge.id,
          kind: 'MENTIONS',
          from: edge.from,
          to: edge.to,
          created_at: edge.created_at,
          metadata: {
            count: edge.count,
            ...(edge.metadata || {}),
          },
        });
      }
    }

    // Log cross-conversation linking stats
    if (linkedLexemes > 0 || linkedPhrases > 0) {
      console.log(
        `[Import] Cross-conversation links: ${linkedLexemes} lexemes, ${linkedPhrases} phrases linked to existing nodes`
      );
    }

    // Cluster phrases into topics (if enabled)
    let totalTopics = 0;
    if (spineConfig.clusterTopics && allPhrases.length >= (spineConfig.minPhrasesPerTopic || 3)) {
      const topics = spineBuilder.clusterTopics(allPhrases);

      // Build phrase lookup map for O(1) keyword matching
      const phraseByText = new Map<string, PhraseNode>();
      for (const phrase of allPhrases) {
        phraseByText.set(phrase.text, phrase);
      }

      for (const topic of topics) {
        await this.writeNode({
          id: topic.id,
          kind: 'Topic',
          name: topic.name,
          description: topic.description,
          keywords: topic.keywords,
          strength: topic.strength,
          created_at: topic.created_at,
          updated_at: topic.updated_at,
          metadata: topic.metadata,
        });

        // Create BELONGS_TO_TOPIC edges from phrases to topic (O(1) lookup)
        for (const keyword of topic.keywords) {
          const matchingPhrase = phraseByText.get(keyword);
          if (matchingPhrase) {
            await this.writeEdge({
              id: `edge_belongs_${nanoid()}`,
              kind: 'BELONGS_TO_TOPIC',
              from: matchingPhrase.id,
              to: topic.id,
              created_at: Date.now(),
              metadata: {
                weight: 1.0 / topic.keywords.length,
              },
            });
          }
        }

        totalTopics++;
      }
    }

    return { lexemes: totalLexemes, phrases: totalPhrases, topics: totalTopics };
  }
}
