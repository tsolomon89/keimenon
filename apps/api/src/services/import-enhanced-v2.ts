/**
 * Enhanced Import Service V2
 * Integrates TF-IDF auto-grouping, multi-layer duplicate detection, and bundle creation
 */

import { nanoid } from 'nanoid';
import { DatabaseClient, SQLiteClient } from '@keimenon/db';
import {
  EnhancedAutogroupService,
  type AutogroupRuntimeConfig,
  type Group,
} from './autogroup-enhanced';
import { getLocalDocumentStore } from './local-document-store';
import { DatabaseWriteQueue } from './DatabaseWriteQueue';
import type {
  ImportJobStage,
  NormalizedImportOptions,
  SourceDoc,
  PrincipalNode,
} from '@keimenon/types';
import { DuplicateDetectionConfig, DuplicateGroup } from './duplicate-detection';
import {
  IntegratedDuplicateDetectionService,
  type DuplicateDetectionResult,
} from './duplicate-detection-integrated';
import { GraphSpineBuilder } from './graph-spine-builder';
import { PrincipalService, AgentPlatform } from './principal-service';
import { WORKER_CONFIG } from '../modules/jobs/jobs.config';
import { getImportMetrics } from './metrics/ImportMetrics';
import type { LexemeNode, PhraseNode, TopicNode } from '@keimenon/types';
import type { ImportPipelineStage } from '../modules/import-pipeline/stages';
import { createHash } from 'crypto';
import {
  SimilarityEngineV2,
  type SimilarityEngineInput,
  type SimilarityClusterV2,
} from '@keimenon/parsers';
import { isSemanticStageKillSwitchEnabled } from '../utils/gate-e-kill-switches';
import { applySemanticStageKillSwitchToEdges } from '../utils/semantic-stage-kill-switch';

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
    similarity?: {
      edges: number;
      strong: number;
      medium: number;
      weak: number;
      clusters: number;
    };
    objective?: {
      provisional: number;
      clusters: number;
    };
    // V2: Spine extraction stats
    spine?: {
      lexemes: number;
      phrases: number;
      topics: number;
    };
    proImport?: {
      spans: number;
      packets: number;
      atomicUnits: number;
      packetMassLinks: number;
    };
  };
  // For ChangeTracker rollback support
  createdNodeIds: string[];
  createdEdgeIds: string[];
}

interface MaterializedSource {
  id: string;
  messageId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  content: string;
  branch: 'merged' | 'user' | 'assistant';
  messageIds: string[];
}

type SpineImportOptions = {
  enabled?: boolean;
  extractLexemes?: boolean;
  extractPhrases?: boolean;
  clusterTopics?: boolean;
  minPhraseFrequency?: number;
  minPhrasesPerTopic?: number;
};

type ImportRuntimeConfig = NormalizedImportOptions & {
  spine?: SpineImportOptions;
};

interface MaterializedSpan {
  id: string;
  sourceId: string;
  messageId: string;
  conversationId: string;
  text: string;
  normalizedText: string;
  startChar: number;
  endChar: number;
  boundaryKind: 'line' | 'sentence' | 'paragraph' | 'token_window';
}

interface PacketOccurrence {
  spanId: string;
  sourceId: string;
  tokenStart: number;
  tokenEnd: number;
}

interface PacketCandidate {
  normalizedText: string;
  displayText: string;
  occurrences: PacketOccurrence[];
  sourceCounts: Map<string, number>;
}

interface ImportPipelineHooks {
  onStage?: (stage: ImportJobStage, message: string) => Promise<void> | void;
  onPipelineStage?: (stage: ImportPipelineStage, message: string) => Promise<void> | void;
}

interface ImportExecutionOptions {
  rollbackOnError?: boolean;
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
  private similarityEngine: SimilarityEngineV2;
  private principalService: PrincipalService;
  private sqliteDb: ReturnType<SQLiteClient['getDatabase']>;
  private context: {
    accountId: string;
    userId: string;
    jobId?: string;
    agentRuntimeEnabled?: boolean;
  } | null = null;
  private importMode: string = 'unknown';
  private knownNodeIds: Set<string> = new Set();
  private knownEdgeIds: Set<string> = new Set();

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
    this.similarityEngine = new SimilarityEngineV2();

    // CRITICAL FIX: FTS5 service needs the underlying better-sqlite3 Database instance
    // DatabaseClient is an interface, but IntegratedDuplicateDetectionService expects Database.Database
    // Cast to SQLiteClient to access getDatabase() method
    // See: apps/api/src/services/duplicate-detection-fts5.ts:78 (requires db.prepare method)
    this.sqliteDb = (db as SQLiteClient).getDatabase();
    this.duplicateService = new IntegratedDuplicateDetectionService(this.sqliteDb);
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

  private async flushWritesStrict(stage: string): Promise<void> {
    await this.flushWrites();
    this.assertWriteQueueHealthy(stage);
  }

  private assertWriteQueueHealthy(stage: string): void {
    if (!this.writeQueue) {
      return;
    }

    const deadLetters = this.writeQueue.getDeadLetterQueue();
    const circuitOpen = this.writeQueue.isCircuitOpen();

    if (deadLetters.length === 0 && !circuitOpen) {
      return;
    }

    const error: Error & { code?: string; details?: Record<string, unknown> } = new Error(
      `[Import] Write queue integrity failure at stage "${stage}" (deadLetters=${deadLetters.length}, circuitOpen=${circuitOpen})`
    );
    error.code = 'WRITE_QUEUE_FAILURE';
    error.details = {
      stage,
      deadLetterCount: deadLetters.length,
      circuitOpen,
      sampleErrors: deadLetters.slice(0, 3).map((item) => ({
        type: item.type,
        reason: item.normalizedReason || 'UNKNOWN',
        message: item.error?.message,
      })),
    };
    getImportMetrics().recordWriteQueueIntegrityFailure({
      mode: this.importMode,
      stage,
      deadLetterCount: deadLetters.length,
      circuitOpen,
    });
    throw error;
  }

  private async emitStage(
    hooks: ImportPipelineHooks | undefined,
    stage: ImportJobStage,
    message: string
  ): Promise<void> {
    if (!hooks?.onStage) {
      return;
    }
    await hooks.onStage(stage, message);
  }

  private async emitPipelineStage(
    hooks: ImportPipelineHooks | undefined,
    stage: ImportPipelineStage,
    message: string
  ): Promise<void> {
    if (!hooks?.onPipelineStage) {
      return;
    }
    await hooks.onPipelineStage(stage, message);
  }

  private stableHash(value: string, length: number = 24): string {
    return createHash('sha256').update(value).digest('hex').slice(0, length);
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private nodeKey(nodeId: string, accountId: string): string {
    return `${accountId}:${nodeId}`;
  }

  private edgeKey(edgeId: string, accountId: string): string {
    return `${accountId}:${edgeId}`;
  }

  private async writeNodeIfAbsent(node: any): Promise<boolean> {
    if (!this.context?.accountId) {
      await this.writeNode(node);
      return true;
    }

    const key = this.nodeKey(node.id, this.context.accountId);
    if (this.knownNodeIds.has(key)) {
      return false;
    }

    await this.writeNode(node);
    this.knownNodeIds.add(key);
    return true;
  }

  private async writeEdgeIfAbsent(edge: any): Promise<boolean> {
    if (!this.context?.accountId) {
      await this.writeEdge(edge);
      return true;
    }

    const key = this.edgeKey(edge.id, this.context.accountId);
    if (this.knownEdgeIds.has(key)) {
      return false;
    }

    await this.writeEdge(edge);
    this.knownEdgeIds.add(key);
    return true;
  }

  /**
   * Import conversations with full processing pipeline
   */
  async import(
    conversations: ImportConversation[],
    uploadHash: string,
    config: ImportRuntimeConfig,
    context: {
      accountId: string;
      userId: string;
      jobId?: string;
      agentRuntimeEnabled?: boolean;
    },
    hooks?: ImportPipelineHooks,
    options?: ImportExecutionOptions
  ): Promise<ImportResult> {
    this.context = context;
    this.importMode = config.processingMode || 'automatic';
    this.knownNodeIds.clear();
    this.knownEdgeIds.clear();
    const startTime = Date.now();

    // Reset entity tracking for this import batch
    this.createdNodeIds = [];
    this.createdEdgeIds = [];

    try {
      await this.emitPipelineStage(hooks, 'canonicalize', 'Canonicalizing conversations');
      await this.emitStage(
        hooks,
        'CANONICALIZE' as ImportJobStage,
        'Reconstructing canonical conversation graph'
      );

      // Step 1: Save upload metadata
      await this.emitPipelineStage(hooks, 'save', 'Persisting upload metadata');
      await this.saveUploadMetadata(uploadHash, conversations, config);

      // Step 2: Extract messages for grouping
      const allMessages = this.extractMessages(conversations, config);

      // Step 3: Auto-group messages
      const groupResult = await this.autogroupService.autoGroupMessages(
        allMessages,
        this.toGroupingConfig(config)
      );

      // Step 4: Save conversations, messages, and groups to database
      await this.saveToDatabase(conversations, groupResult.groups, uploadHash, config);
      await this.flushWritesStrict('canonicalize.save_to_database');

      // Step 5: Create sources from messages
      await this.emitPipelineStage(hooks, 'source', 'Materializing source nodes');
      const sources = await this.createSources(allMessages, groupResult.groups, config, uploadHash);
      await this.flushWritesStrict('canonicalize.create_sources');

      // Similarity-first graph birth (canonical deterministic weighted similarity)
      const similarityResult = await this.materializeSimilarityGraph(sources, uploadHash, config);
      await this.flushWritesStrict('canonicalize.similarity_graph');
      const objectiveStats = await this.createProvisionalObjectiveClaims(
        similarityResult.clusters,
        sources,
        uploadHash
      );
      await this.flushWritesStrict('canonicalize.objective_provision');

      await this.emitPipelineStage(hooks, 'span', 'Extracting immutable source spans');
      await this.emitStage(
        hooks,
        'SPAN_EXTRACT' as ImportJobStage,
        'Extracting immutable source spans'
      );
      const spanResult = await this.extractSourceSpans(sources);
      await this.flushWritesStrict('span_extract');

      await this.emitPipelineStage(hooks, 'atomic', 'Building atomic substrate');
      await this.emitStage(
        hooks,
        'ATOMIC_EXTRACT' as ImportJobStage,
        'Building char+trigram atomic substrate'
      );
      const atomicResult = await this.materializeAtomicUnits(spanResult.spans);
      await this.flushWritesStrict('atomic_extract');

      await this.emitPipelineStage(hooks, 'packet', 'Deriving and linking packet layer');
      await this.emitStage(
        hooks,
        'PACKET_DERIVE' as ImportJobStage,
        'Deriving repeated packet fragments'
      );
      const packetCandidates = this.derivePacketCandidates(spanResult.spans);

      await this.emitStage(
        hooks,
        'MASS_SCORE' as ImportJobStage,
        'Scoring deterministic packet mass'
      );
      const scoredPackets = this.scorePacketCandidates(packetCandidates, sources);

      await this.emitStage(
        hooks,
        'LAYER_LINK' as ImportJobStage,
        'Linking packet, span, and atomic layers'
      );
      const packetResult = await this.materializePackets(scoredPackets, atomicResult.atomicIdByKey);
      await this.flushWritesStrict('layer_link');

      // Step 6: Detect duplicates (if enabled)
      await this.emitPipelineStage(hooks, 'dedupe', 'Detecting duplicates');
      await this.emitStage(hooks, 'DEDUPE' as ImportJobStage, 'Detecting duplicates');
      let duplicatesForReview = 0;
      if (config.duplicateDetection.enabled) {
        const duplicateResult = await this.detectDuplicates(conversations, config);
        duplicatesForReview = duplicateResult.reviewCandidateCount;
      }

      // Step 7: Extract code blocks (if enabled)
      await this.emitPipelineStage(hooks, 'code', 'Extracting code blocks');
      let codeBlocks = 0;
      if (config.extractCode) {
        codeBlocks = await this.extractCodeBlocks(conversations, config);
      }

      // Step 8: Create SourceDoc bundles (deterministic stitching from materialized sources)
      let bundles = 0;
      bundles = await this.createBundles(sources, config);

      // Step 9: Extract spine (V2 - if enabled)
      await this.emitPipelineStage(hooks, 'spine', 'Building graph spine');
      let spineStats = { lexemes: 0, phrases: 0, topics: 0 };
      if (config.spine?.enabled) {
        console.log('[Import] Step 9: Spine extraction ENABLED');
        spineStats = await this.extractSpine(allMessages, config);
        console.log(
          `[Import] Spine extraction complete: ${spineStats.lexemes} lexemes, ${spineStats.phrases} phrases, ${spineStats.topics} topics`
        );
      }

      // Flush all pending writes before completing
      await this.emitPipelineStage(hooks, 'finalize', 'Finalizing import writes');
      await this.emitStage(hooks, 'MATERIALIZE' as ImportJobStage, 'Finalizing import writes');
      await this.flushWritesStrict('finalization');

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
          similarity: similarityResult.stats,
          objective: objectiveStats,
          proImport: {
            spans: spanResult.spansCreated,
            packets: packetResult.packetsCreated,
            atomicUnits: atomicResult.atomicUnitsCreated,
            packetMassLinks: packetResult.packetMassLinksCreated,
          },
        },
        // For ChangeTracker rollback support
        createdNodeIds: this.createdNodeIds,
        createdEdgeIds: this.createdEdgeIds,
      };
    } catch (error: any) {
      // Attach tracked entities so runner-level compensation can roll back deterministically.
      error.createdNodeIds = [...this.createdNodeIds];
      error.createdEdgeIds = [...this.createdEdgeIds];

      if (options?.rollbackOnError !== false) {
        // Rollback: Delete any entities created during this batch on failure
        // This prevents orphaned data from partial imports
        console.error(
          '[Import] Error during import, rolling back created entities:',
          error.message
        );
        await this.rollbackCreatedEntities();
      } else {
        console.error(
          '[Import] Error during import; rollback deferred to runner compensation service:',
          error.message
        );
      }
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
    config: ImportRuntimeConfig
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
    config: ImportRuntimeConfig
  ): ImportMessage[] {
    const messages: ImportMessage[] = [];

    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (msg.content.length < config.minMessageLength) {
          continue;
        }

        if (msg.role === 'user' && config.extraction.includeUser) {
          messages.push(msg);
          continue;
        }

        if (msg.role === 'assistant' && config.extraction.includeAssistant) {
          messages.push(msg);
        }
      }
    }

    return messages;
  }

  private toGroupingConfig(config: ImportRuntimeConfig): AutogroupRuntimeConfig {
    const mode: AutogroupRuntimeConfig['mode'] = config.processingMode;
    const manual =
      mode === 'manual' || mode === 'hybrid'
        ? config.groups.map((group) => ({
            name: group.name,
            keywords: group.keywords,
          }))
        : [];

    return {
      mode,
      automatic: {
        targetGroupCount: 25,
        createCatchAll: true,
        minGroupSize: 2,
        algorithm: 'tfidf',
      },
      manual,
    };
  }

  private async ensureSimilarityMetadataStorage(): Promise<void> {
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS import_similarity_clusters (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        import_batch_id TEXT NOT NULL,
        cluster_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        mass REAL NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_similarity_clusters_account_batch
      ON import_similarity_clusters(account_id, import_batch_id);
      CREATE INDEX IF NOT EXISTS idx_similarity_clusters_cluster
      ON import_similarity_clusters(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_similarity_clusters_node
      ON import_similarity_clusters(node_id);
    `);
  }

  private async materializeSimilarityGraph(
    sources: MaterializedSource[],
    uploadHash: string,
    _config: ImportRuntimeConfig
  ): Promise<{
    stats: { edges: number; strong: number; medium: number; weak: number; clusters: number };
    clusters: SimilarityClusterV2[];
  }> {
    if (!this.context?.accountId || sources.length < 2) {
      return {
        stats: { edges: 0, strong: 0, medium: 0, weak: 0, clusters: 0 },
        clusters: [],
      };
    }

    const semanticStageDisabled = isSemanticStageKillSwitchEnabled();
    const input: SimilarityEngineInput = {
      documents: sources.map((source) => ({
        id: source.id,
        text: source.content,
        conversationId: source.conversationId,
        role: source.role,
        timestamp: source.timestamp,
      })),
      runtime: {
        disableSemanticStage: semanticStageDisabled,
      },
    };
    const result = this.similarityEngine.analyze(input);
    if (semanticStageDisabled) {
      applySemanticStageKillSwitchToEdges(result.edges as any[]);
    }

    let strong = 0;
    let medium = 0;
    let weak = 0;

    for (const edge of result.edges) {
      const edgeId = `edge_similarity_${this.stableHash(`${edge.sourceId}:${edge.targetId}:${uploadHash}`, 32)}`;
      await this.writeEdgeIfAbsent({
        id: edgeId,
        kind: 'SIMILAR_TO',
        from: edge.sourceId,
        to: edge.targetId,
        created_at: Date.now(),
        metadata: {
          score: edge.total,
          strength: edge.strength,
          breakdown: {
            lexical: edge.lexical,
            structural: edge.structural,
            semantic: edge.semantic,
            flow: edge.flow,
          },
          import_id: uploadHash,
          importId: uploadHash,
        },
      });

      if (edge.strength === 'strong') {
        strong++;
      } else if (edge.strength === 'medium') {
        medium++;
      } else {
        weak++;
      }
    }

    await this.ensureSimilarityMetadataStorage();
    const now = Date.now();
    const insertClusterStmt = this.sqliteDb.prepare(`
      INSERT INTO import_similarity_clusters (
        id, account_id, import_batch_id, cluster_id, node_id, mass, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        mass = excluded.mass,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    const tx = this.sqliteDb.transaction(() => {
      for (const cluster of result.clusters) {
        for (const nodeId of cluster.memberIds) {
          const clusterRowId = `sim_cluster_${this.stableHash(`${this.context?.accountId}:${uploadHash}:${cluster.id}:${nodeId}`, 40)}`;
          insertClusterStmt.run(
            clusterRowId,
            this.context?.accountId,
            uploadHash,
            cluster.id,
            nodeId,
            result.massByNode[nodeId] ?? 0,
            JSON.stringify({
              node_count: cluster.memberIds.length,
              cluster_mass: cluster.mass,
            }),
            now,
            now
          );
        }
      }
    });
    tx();

    return {
      stats: {
        edges: result.edges.length,
        strong,
        medium,
        weak,
        clusters: result.clusters.length,
      },
      clusters: result.clusters,
    };
  }

  private async createProvisionalObjectiveClaims(
    clusters: SimilarityClusterV2[],
    sources: MaterializedSource[],
    uploadHash: string
  ): Promise<{ provisional: number; clusters: number }> {
    if (!this.context?.accountId || clusters.length === 0 || sources.length === 0) {
      return { provisional: 0, clusters: 0 };
    }

    const sourceById = new Map<string, MaterializedSource>();
    for (const source of sources) {
      sourceById.set(source.id, source);
    }

    const rankedClusters = clusters
      .map((cluster) => ({
        ...cluster,
        memberSourceIds: cluster.memberIds.filter((memberId) => sourceById.has(memberId)),
      }))
      .filter((cluster) => cluster.memberSourceIds.length > 0)
      .sort((a, b) => b.mass - a.mass || a.id.localeCompare(b.id));

    const majorClusters = rankedClusters.filter((cluster) => cluster.memberSourceIds.length >= 2);
    const selectedClusters = (majorClusters.length > 0 ? majorClusters : rankedClusters).slice(
      0,
      24
    );

    let provisionalCreated = 0;

    for (const cluster of selectedClusters) {
      const objectiveId = `objective_${this.stableHash(`${this.context.accountId}:${uploadHash}:${cluster.id}`, 32)}`;
      const claimText = this.buildProvisionalObjectiveClaimText(
        cluster.memberSourceIds,
        sourceById
      );
      const confidence = Math.max(0.35, Math.min(0.85, cluster.mass));

      const createdObjective = await this.writeNodeIfAbsent({
        id: objectiveId,
        kind: 'ObjectiveClaim',
        claim_text: claimText,
        type: 'definition',
        archetype: 'definition_anchor',
        status: 'provisional',
        confidence,
        citations: cluster.memberSourceIds.map((sourceId) => ({ node_id: sourceId })),
        supports: [],
        contradicts: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          import_id: uploadHash,
          importId: uploadHash,
          import_batch: uploadHash,
          cluster_id: cluster.id,
          cluster_mass: cluster.mass,
          member_source_count: cluster.memberSourceIds.length,
          member_source_ids: cluster.memberSourceIds,
          objective_archetype: 'definition_anchor',
          objective_lifecycle: {
            state: 'provisional',
            next: 'verifying',
            reason: 'created_from_similarity_cluster',
            archetype: 'definition_anchor',
          },
        },
      });

      if (createdObjective) {
        provisionalCreated++;
      }

      for (const sourceId of cluster.memberSourceIds) {
        const sourcedFromEdgeId = `edge_objective_source_${this.stableHash(`${objectiveId}:${sourceId}`, 32)}`;
        await this.writeEdgeIfAbsent({
          id: sourcedFromEdgeId,
          kind: 'SOURCED_FROM',
          from: objectiveId,
          to: sourceId,
          created_at: Date.now(),
          metadata: {
            import_id: uploadHash,
            importId: uploadHash,
            cluster_id: cluster.id,
            objective_status: 'provisional',
          },
        });
      }

      if (this.humanPrincipal?.id) {
        const createdByEdgeId = `edge_objective_created_by_${this.stableHash(`${objectiveId}:${this.humanPrincipal.id}`, 32)}`;
        await this.writeEdgeIfAbsent({
          id: createdByEdgeId,
          kind: 'CREATED_BY',
          from: objectiveId,
          to: this.humanPrincipal.id,
          created_at: Date.now(),
        });
      }
    }

    return {
      provisional: provisionalCreated,
      clusters: selectedClusters.length,
    };
  }

  private buildProvisionalObjectiveClaimText(
    sourceIds: string[],
    sourceById: Map<string, MaterializedSource>
  ): string {
    const corpus = sourceIds
      .map((sourceId) => sourceById.get(sourceId)?.content || '')
      .map((content) => content.slice(0, 2000))
      .join('\n\n')
      .slice(0, 20000);

    const anchors = this.extractObjectiveAnchorTerms(corpus, 5);
    if (anchors.length === 0) {
      return `Provisional objective synthesized from ${sourceIds.length} related sources`;
    }
    return `Provisional objective around ${anchors.join(', ')}`;
  }

  private extractObjectiveAnchorTerms(content: string, limit: number): string[] {
    const stopWords = new Set([
      'about',
      'after',
      'also',
      'been',
      'because',
      'before',
      'being',
      'between',
      'could',
      'from',
      'have',
      'into',
      'just',
      'more',
      'most',
      'only',
      'other',
      'should',
      'than',
      'that',
      'their',
      'there',
      'these',
      'this',
      'those',
      'were',
      'what',
      'when',
      'where',
      'which',
      'while',
      'with',
      'would',
      'your',
      'you',
      'and',
      'the',
      'for',
      'are',
      'was',
      'were',
      'has',
      'had',
      'its',
      'our',
      'not',
      'but',
    ]);

    const tokens = content
      .normalize('NFKC')
      .toLowerCase()
      .match(/[a-z0-9_]{3,}/g);

    if (!tokens || tokens.length === 0) {
      return [];
    }

    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      if (stopWords.has(token)) {
        continue;
      }
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }

    return [...frequencies.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([token]) => token);
  }

  /**
   * Save conversations, messages, and groups to database
   * World Model V5: Creates Principal nodes and ConversationThread with relationship edges
   */
  private async saveToDatabase(
    conversations: ImportConversation[],
    groups: Group[],
    uploadHash: string,
    config: ImportRuntimeConfig
  ): Promise<void> {
    // World Model V5: Resolve Principals before creating conversations
    // This ensures idempotent creation - same import = same Principals
    await this.resolvePrincipals(conversations, config);

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
  private async resolvePrincipals(
    conversations: ImportConversation[],
    config: ImportRuntimeConfig
  ): Promise<void> {
    if (!this.context) {
      console.warn('[Import] No context available for Principal resolution');
      return;
    }

    this.agentPrincipal = null;
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

    const bootstrapMode = config.agent?.bootstrap || 'manual';
    const agentRuntimeEnabled = Boolean(this.context.agentRuntimeEnabled);
    if (bootstrapMode !== 'auto' || !agentRuntimeEnabled) {
      console.log(
        `[Import] Agent Principal bootstrap skipped (mode=${bootstrapMode}, agentRuntimeEnabled=${agentRuntimeEnabled})`
      );
      return;
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
    config: ImportRuntimeConfig,
    uploadHash: string
  ): Promise<MaterializedSource[]> {
    const sources: MaterializedSource[] = [];

    const messageToGroups = new Map<string, string[]>();
    for (const group of groups) {
      for (const messageId of group.sources) {
        if (!messageToGroups.has(messageId)) {
          messageToGroups.set(messageId, []);
        }
        messageToGroups.get(messageId)!.push(group.id);
      }
    }

    const streamMap = new Map<
      string,
      {
        conversationId: string;
        branch: 'merged' | 'user' | 'assistant';
        messages: ImportMessage[];
      }
    >();

    const sortedMessages = [...messages].sort(
      (a, b) =>
        a.conversationId.localeCompare(b.conversationId) ||
        a.index - b.index ||
        a.timestamp - b.timestamp
    );

    for (const msg of sortedMessages) {
      const branch: 'merged' | 'user' | 'assistant' =
        config.branches === 'separate'
          ? msg.role === 'user'
            ? 'user'
            : msg.role === 'assistant'
              ? 'assistant'
              : 'merged'
          : 'merged';

      if (config.branches === 'separate' && branch === 'merged') {
        continue;
      }

      const streamKey = `${msg.conversationId}:${branch}`;
      if (!streamMap.has(streamKey)) {
        streamMap.set(streamKey, {
          conversationId: msg.conversationId,
          branch,
          messages: [],
        });
      }
      streamMap.get(streamKey)!.messages.push(msg);
    }

    const branchSourceByConversation = new Map<
      string,
      Partial<Record<'user' | 'assistant', string>>
    >();

    for (const [streamKey, stream] of streamMap.entries()) {
      const streamMessages = [...stream.messages].sort(
        (a, b) => a.index - b.index || a.timestamp - b.timestamp
      );
      const messageIds = streamMessages.map((message) => message.id);
      const combinedRawContent = streamMessages.map((message) => message.content).join('\n\n');
      const rawContentHash = this.stableHash(combinedRawContent, 64);
      const rawContentBytes = Buffer.byteLength(combinedRawContent, 'utf8');

      const derived = this.buildDerivedSourceContent(
        combinedRawContent,
        config.codeSettings.sourceHandling
      );
      const contentMeta = await this.localStore.saveSource(
        `src_${this.stableHash(`${this.context?.accountId || 'unknown'}:${streamKey}`, 32)}`,
        derived.content
      );

      const sourceSeed = `${this.context?.accountId || 'unknown'}:${stream.conversationId}:${stream.branch}`;
      const sourceId = `src_${this.stableHash(sourceSeed, 32)}`;
      const fingerprint = `src:${stream.conversationId}:${stream.branch}:${this.stableHash(combinedRawContent, 16)}`;

      const sourceGroupSet = new Set<string>();
      for (const messageId of messageIds) {
        for (const groupId of messageToGroups.get(messageId) || []) {
          sourceGroupSet.add(groupId);
        }
      }
      const sourceGroups = Array.from(sourceGroupSet);
      const sourceTitle =
        stream.branch === 'merged'
          ? `Conversation stream (${new Date(streamMessages[0]?.timestamp || Date.now()).toISOString()})`
          : `${stream.branch === 'user' ? 'User' : 'Assistant'} branch stream (${new Date(streamMessages[0]?.timestamp || Date.now()).toISOString()})`;

      await this.writeNode({
        id: sourceId,
        kind: 'Source',
        title: sourceTitle,
        fingerprint,
        mime_type: 'text/markdown',
        size_bytes: derived.content.length,
        content_location: this.localStore.getStorageLocation(contentMeta),
        content_hash: contentMeta.hash,
        created_at: streamMessages[0]?.timestamp || Date.now(),
        updated_at: Date.now(),
        provenance: {
          origin_principal_id: this.humanPrincipal?.id || this.context?.userId || 'unknown',
          origin_type: 'chat_import',
          origin_ref: stream.conversationId,
          trust_state: 'ugc',
          retrieved_at: Date.now(),
        },
        metadata: {
          type: 'conversation_stream_source',
          branch: stream.branch,
          branches_mode: config.branches,
          source_handling: config.codeSettings.sourceHandling,
          code_removed_ranges: derived.codeRemovedRanges,
          conversation_id: stream.conversationId,
          message_ids: messageIds,
          import_id: uploadHash,
          importId: uploadHash,
          import_batch: uploadHash,
          parser_source: 'chat_export',
          raw_content_hash: rawContentHash,
          raw_content_bytes: rawContentBytes,
          derived_content_hash: contentMeta.hash,
          derivation_chain: [
            'raw_message_persisted',
            'conversation_stream_materialized',
            `source_handling:${config.codeSettings.sourceHandling}`,
          ],
          groups: sourceGroups,
        },
      });

      const derivesFromConversationEdgeId = `edge_derives_conv_${this.stableHash(`${sourceId}:${stream.conversationId}`, 32)}`;
      await this.writeEdgeIfAbsent({
        id: derivesFromConversationEdgeId,
        kind: 'DERIVES_FROM',
        from: sourceId,
        to: stream.conversationId,
        created_at: Date.now(),
        metadata: {
          relation: 'conversation_branch',
          branch: stream.branch,
        },
      });

      for (const messageId of messageIds) {
        const compiledFromEdgeId = `edge_compiled_${this.stableHash(`${sourceId}:${messageId}`, 32)}`;
        await this.writeEdge({
          id: compiledFromEdgeId,
          kind: 'COMPILED_FROM',
          from: sourceId,
          to: messageId,
          created_at: Date.now(),
          metadata: {
            derivation_type: 'conversation_stream_extraction',
            branch: stream.branch,
          },
        });
      }

      for (const groupId of sourceGroups) {
        const inGroupEdgeId = `edge_in_group_${this.stableHash(`${sourceId}:${groupId}`, 32)}`;
        await this.writeEdge({
          id: inGroupEdgeId,
          kind: 'IN_GROUP',
          from: sourceId,
          to: groupId,
          created_at: Date.now(),
        });
      }

      if (this.humanPrincipal) {
        const createdByEdgeId = `edge_created_by_${this.stableHash(`${sourceId}:${this.humanPrincipal.id}`, 32)}`;
        await this.writeEdge({
          id: createdByEdgeId,
          kind: 'CREATED_BY',
          from: sourceId,
          to: this.humanPrincipal.id,
          created_at: Date.now(),
        });
      }

      if (stream.branch !== 'merged') {
        const entry = branchSourceByConversation.get(stream.conversationId) || {};
        entry[stream.branch] = sourceId;
        branchSourceByConversation.set(stream.conversationId, entry);
      }

      sources.push({
        id: sourceId,
        messageId: messageIds[0],
        conversationId: stream.conversationId,
        role: streamMessages[0]?.role || 'user',
        timestamp: streamMessages[0]?.timestamp || Date.now(),
        content: derived.content,
        branch: stream.branch,
        messageIds,
      });
    }

    for (const [conversationId, branchRefs] of branchSourceByConversation.entries()) {
      if (branchRefs.user && branchRefs.assistant) {
        const discourseEdgeId = `edge_discourse_${this.stableHash(`${branchRefs.user}:${branchRefs.assistant}`, 32)}`;
        await this.writeEdgeIfAbsent({
          id: discourseEdgeId,
          kind: 'DISCOURSE',
          from: branchRefs.user,
          to: branchRefs.assistant,
          created_at: Date.now(),
          metadata: {
            relation: 'role_branch_lineage',
            conversation_id: conversationId,
          },
        });
      }
    }

    return sources;
  }

  private buildDerivedSourceContent(
    rawContent: string,
    sourceHandling: 'keep_inline' | 'extract_and_remove'
  ): { content: string; codeRemovedRanges: Array<{ start: number; end: number; length: number }> } {
    if (sourceHandling === 'keep_inline') {
      return { content: rawContent, codeRemovedRanges: [] };
    }

    const codeRemovedRanges: Array<{ start: number; end: number; length: number }> = [];
    const codeBlockRegex = /```[\w-]*\n[\s\S]*?```/g;

    let match: RegExpExecArray | null = null;
    while ((match = codeBlockRegex.exec(rawContent)) !== null) {
      codeRemovedRanges.push({
        start: match.index,
        end: match.index + match[0].length,
        length: match[0].length,
      });
    }

    return {
      content: rawContent
        .replace(codeBlockRegex, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
      codeRemovedRanges,
    };
  }

  private splitIntoSpans(content: string): Array<{
    text: string;
    start: number;
    end: number;
    boundaryKind: 'line' | 'sentence' | 'paragraph' | 'token_window';
  }> {
    const spans: Array<{
      text: string;
      start: number;
      end: number;
      boundaryKind: 'line' | 'sentence' | 'paragraph' | 'token_window';
    }> = [];

    const regex = /[^\n.!?]+(?:[.!?]+)?|\n+/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const raw = match[0];
      if (/^\n+$/.test(raw)) {
        continue;
      }

      const firstNonWhitespace = raw.search(/\S/);
      if (firstNonWhitespace === -1) {
        continue;
      }

      const text = raw.trim();
      if (text.length === 0) {
        continue;
      }

      const start = match.index + firstNonWhitespace;
      const end = start + text.length;
      const boundaryKind = raw.includes('\n') ? 'line' : 'sentence';

      spans.push({ text, start, end, boundaryKind });
    }

    if (spans.length === 0) {
      const trimmed = content.trim();
      if (trimmed.length > 0) {
        const start = content.indexOf(trimmed);
        spans.push({
          text: trimmed,
          start: Math.max(0, start),
          end: Math.max(0, start) + trimmed.length,
          boundaryKind: 'paragraph',
        });
      }
    }

    return spans;
  }

  private async extractSourceSpans(
    sources: MaterializedSource[]
  ): Promise<{ spans: MaterializedSpan[]; spansCreated: number; spanEdgesCreated: number }> {
    if (!this.context?.accountId) {
      throw new Error('No import context available for span extraction');
    }

    const spans: MaterializedSpan[] = [];
    let spansCreated = 0;
    let spanEdgesCreated = 0;
    const now = Date.now();

    for (const source of sources) {
      const segments = this.splitIntoSpans(source.content);
      for (const segment of segments) {
        const normalizedText = this.normalizeText(segment.text);
        if (!normalizedText) {
          continue;
        }

        const spanId = `span_${this.stableHash(
          `${this.context.accountId}:${source.id}:${segment.start}:${segment.end}:${normalizedText}`,
          32
        )}`;
        const spanHash = this.stableHash(
          `${source.id}:${segment.start}:${segment.end}:${normalizedText}`,
          32
        );

        const createdSpan = await this.writeNodeIfAbsent({
          id: spanId,
          kind: 'SourceSpan',
          source_id: source.id,
          message_id: source.messageId,
          conversation_id: source.conversationId,
          text: segment.text,
          normalized_text: normalizedText,
          start_char: segment.start,
          end_char: segment.end,
          boundary_kind: segment.boundaryKind,
          span_hash: spanHash,
          created_at: source.timestamp || now,
          updated_at: now,
          metadata: {
            importContractVersion: 'v2',
            processingRail: 'automatic-pro-import',
          },
        });
        if (createdSpan) {
          spansCreated++;
        }

        const hasSpanEdgeId = `edge_has_span_${this.stableHash(`${source.id}:${spanId}`, 32)}`;
        const createdHasSpanEdge = await this.writeEdgeIfAbsent({
          id: hasSpanEdgeId,
          kind: 'HAS_SPAN',
          from: source.id,
          to: spanId,
          created_at: now,
          metadata: {
            start_char: segment.start,
            end_char: segment.end,
            boundary_kind: segment.boundaryKind,
          },
        });
        if (createdHasSpanEdge) {
          spanEdgesCreated++;
        }

        spans.push({
          id: spanId,
          sourceId: source.id,
          messageId: source.messageId,
          conversationId: source.conversationId,
          text: segment.text,
          normalizedText,
          startChar: segment.start,
          endChar: segment.end,
          boundaryKind: segment.boundaryKind,
        });
      }
    }

    return { spans, spansCreated, spanEdgesCreated };
  }

  private extractAtomicTokens(normalizedText: string): { chars: string[]; trigrams: string[] } {
    const compact = normalizedText.replace(/\s+/g, '');
    if (!compact) {
      return { chars: [], trigrams: [] };
    }

    const chars = compact.split('');
    const trigrams: string[] = [];
    if (compact.length < 3) {
      trigrams.push(compact);
    } else {
      for (let i = 0; i <= compact.length - 3; i++) {
        trigrams.push(compact.slice(i, i + 3));
      }
    }

    return {
      chars: Array.from(new Set(chars)),
      trigrams: Array.from(new Set(trigrams)),
    };
  }

  private parseAtomicKey(key: string): { unitType: 'char' | 'trigram'; value: string } {
    const separatorIndex = key.indexOf(':');
    const unitType = key.slice(0, separatorIndex);
    const value = key.slice(separatorIndex + 1);
    return {
      unitType: unitType === 'char' ? 'char' : 'trigram',
      value,
    };
  }

  private async ensureAtomicUnit(
    key: string,
    atomicIdByKey: Map<string, string>
  ): Promise<{ id: string; created: boolean }> {
    if (!this.context?.accountId) {
      throw new Error('No import context available for atomic extraction');
    }

    const existingId = atomicIdByKey.get(key);
    if (existingId) {
      return { id: existingId, created: false };
    }

    const { unitType, value } = this.parseAtomicKey(key);
    const atomicId = `atomic_${this.stableHash(`${this.context.accountId}:${key}`, 32)}`;
    const created = await this.writeNodeIfAbsent({
      id: atomicId,
      kind: 'AtomicUnit',
      unit_type: unitType,
      value,
      normalized_value: value,
      unit_hash: this.stableHash(key, 32),
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        importContractVersion: 'v2',
      },
    });

    atomicIdByKey.set(key, atomicId);
    return { id: atomicId, created };
  }

  private async materializeAtomicUnits(
    spans: MaterializedSpan[]
  ): Promise<{ atomicUnitsCreated: number; atomicIdByKey: Map<string, string> }> {
    const atomicKeys = new Set<string>();

    for (const span of spans) {
      const tokens = this.extractAtomicTokens(span.normalizedText);
      for (const char of tokens.chars) {
        atomicKeys.add(`char:${char}`);
      }
      for (const trigram of tokens.trigrams) {
        atomicKeys.add(`trigram:${trigram}`);
      }
    }

    const atomicIdByKey = new Map<string, string>();
    let atomicUnitsCreated = 0;
    for (const key of atomicKeys) {
      const result = await this.ensureAtomicUnit(key, atomicIdByKey);
      if (result.created) {
        atomicUnitsCreated++;
      }
    }

    return { atomicUnitsCreated, atomicIdByKey };
  }

  private tokenizeForPackets(normalizedText: string): string[] {
    const matches = normalizedText.match(/[\p{L}\p{N}_]+/gu);
    if (!matches) {
      return [];
    }
    return matches.filter((token) => token.length > 1);
  }

  private derivePacketCandidates(spans: MaterializedSpan[]): PacketCandidate[] {
    const candidateMap = new Map<string, PacketCandidate>();

    for (const span of spans) {
      const tokens = this.tokenizeForPackets(span.normalizedText);
      const maxNgram = Math.min(6, tokens.length);
      for (let n = 2; n <= maxNgram; n++) {
        for (let start = 0; start <= tokens.length - n; start++) {
          const normalizedText = tokens.slice(start, start + n).join(' ');
          if (normalizedText.length < 8) {
            continue;
          }

          const candidate = candidateMap.get(normalizedText) ?? {
            normalizedText,
            displayText: normalizedText,
            occurrences: [],
            sourceCounts: new Map<string, number>(),
          };

          candidate.occurrences.push({
            spanId: span.id,
            sourceId: span.sourceId,
            tokenStart: start,
            tokenEnd: start + n - 1,
          });
          candidate.sourceCounts.set(
            span.sourceId,
            (candidate.sourceCounts.get(span.sourceId) ?? 0) + 1
          );

          candidateMap.set(normalizedText, candidate);
        }
      }
    }

    return Array.from(candidateMap.values())
      .filter((candidate) => candidate.occurrences.length >= 2)
      .sort(
        (a, b) =>
          b.occurrences.length - a.occurrences.length ||
          b.normalizedText.length - a.normalizedText.length ||
          a.normalizedText.localeCompare(b.normalizedText)
      )
      .slice(0, 600);
  }

  private computeEntropyFactor(text: string): number {
    const compact = text.replace(/\s+/g, '');
    if (compact.length <= 1) {
      return 0;
    }

    const counts = new Map<string, number>();
    for (const char of compact) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    const total = compact.length;
    for (const count of counts.values()) {
      const probability = count / total;
      entropy -= probability * Math.log2(probability);
    }

    const maxEntropy = Math.log2(Math.max(counts.size, 1));
    if (maxEntropy <= 0) {
      return 0;
    }

    return Number((entropy / maxEntropy).toFixed(6));
  }

  private scorePacketCandidates(candidates: PacketCandidate[], sources: MaterializedSource[]) {
    const totalSources = Math.max(sources.length, 1);
    const totalChars = Math.max(
      1,
      sources.reduce((sum, source) => sum + source.content.replace(/\s+/g, '').length, 0)
    );

    return candidates
      .map((candidate) => {
        const occurrences = candidate.occurrences.length;
        const sourceHitCount = Math.max(candidate.sourceCounts.size, 1);
        const compactLength = candidate.normalizedText.replace(/\s+/g, '').length;
        const coverage = (compactLength * occurrences) / totalChars;
        const idf = Math.log(1 + totalSources / (1 + sourceHitCount));
        const entropyFactor = this.computeEntropyFactor(candidate.normalizedText);
        const mass = coverage * Math.log(1 + occurrences) * idf * (1 + entropyFactor);

        return {
          ...candidate,
          mass: Number(mass.toFixed(9)),
          coverage: Number(coverage.toFixed(9)),
          idf: Number(idf.toFixed(9)),
          entropyFactor,
        };
      })
      .sort(
        (a, b) =>
          b.mass - a.mass ||
          b.occurrences.length - a.occurrences.length ||
          a.normalizedText.localeCompare(b.normalizedText)
      )
      .slice(0, 300);
  }

  private async materializePackets(
    scoredPackets: Array<
      PacketCandidate & { mass: number; coverage: number; idf: number; entropyFactor: number }
    >,
    atomicIdByKey: Map<string, string>
  ): Promise<{
    packetsCreated: number;
    packetOccurrenceEdgesCreated: number;
    packetMassLinksCreated: number;
    packetAtomicEdgesCreated: number;
  }> {
    let packetsCreated = 0;
    let packetOccurrenceEdgesCreated = 0;
    let packetMassLinksCreated = 0;
    let packetAtomicEdgesCreated = 0;
    const now = Date.now();

    for (const packet of scoredPackets) {
      if (!this.context?.accountId) {
        throw new Error('No import context available for packet materialization');
      }

      const packetId = `packet_${this.stableHash(
        `${this.context.accountId}:${packet.normalizedText}`,
        32
      )}`;

      const packetCreated = await this.writeNodeIfAbsent({
        id: packetId,
        kind: 'Packet',
        text: packet.displayText,
        normalized_text: packet.normalizedText,
        occurrences: packet.occurrences.length,
        mass: packet.mass,
        coverage: packet.coverage,
        idf: packet.idf,
        entropy_factor: packet.entropyFactor,
        packet_hash: this.stableHash(packet.normalizedText, 32),
        created_at: now,
        updated_at: now,
        metadata: {
          importContractVersion: 'v2',
        },
      });
      if (packetCreated) {
        packetsCreated++;
      }

      for (let index = 0; index < packet.occurrences.length; index++) {
        const occurrence = packet.occurrences[index];
        const occursEdgeId = `edge_occurs_${this.stableHash(
          `${packetId}:${occurrence.spanId}:${occurrence.tokenStart}:${occurrence.tokenEnd}:${index}`,
          32
        )}`;
        const createdOccursEdge = await this.writeEdgeIfAbsent({
          id: occursEdgeId,
          kind: 'OCCURS_IN_SPAN',
          from: packetId,
          to: occurrence.spanId,
          created_at: now,
          metadata: {
            count: 1,
            mass: packet.mass,
            token_start: occurrence.tokenStart,
            token_end: occurrence.tokenEnd,
          },
        });
        if (createdOccursEdge) {
          packetOccurrenceEdgesCreated++;
        }
      }

      for (const [sourceId, occurrenceCount] of packet.sourceCounts.entries()) {
        const packetMassEdgeId = `edge_packet_mass_${this.stableHash(`${sourceId}:${packetId}`, 32)}`;
        const createdPacketMassEdge = await this.writeEdgeIfAbsent({
          id: packetMassEdgeId,
          kind: 'CONTAINS',
          from: sourceId,
          to: packetId,
          created_at: now,
          metadata: {
            relation: 'packet_mass',
            occurrences: occurrenceCount,
            coverage: packet.coverage,
            idf: packet.idf,
            entropy_factor: packet.entropyFactor,
            mass: packet.mass,
            importContractVersion: 'v2',
          },
        });
        if (createdPacketMassEdge) {
          packetMassLinksCreated++;
        }
      }

      const packetAtomicTokens = this.extractAtomicTokens(packet.normalizedText);
      const atomicKeys = [
        ...packetAtomicTokens.chars.map((char) => `char:${char}`),
        ...packetAtomicTokens.trigrams.map((trigram) => `trigram:${trigram}`),
      ];

      for (let position = 0; position < atomicKeys.length; position++) {
        const atomicKey = atomicKeys[position];
        const atomic = await this.ensureAtomicUnit(atomicKey, atomicIdByKey);
        const { unitType } = this.parseAtomicKey(atomicKey);
        const composedEdgeId = `edge_composed_${this.stableHash(`${packetId}:${atomic.id}`, 32)}`;
        const createdComposedEdge = await this.writeEdgeIfAbsent({
          id: composedEdgeId,
          kind: 'COMPOSED_OF_ATOMIC',
          from: packetId,
          to: atomic.id,
          created_at: now,
          metadata: {
            unit_type: unitType,
            position,
          },
        });
        if (createdComposedEdge) {
          packetAtomicEdgesCreated++;
        }
      }
    }

    return {
      packetsCreated,
      packetOccurrenceEdgesCreated,
      packetMassLinksCreated,
      packetAtomicEdgesCreated,
    };
  }

  /**
   * Extract code blocks from messages
   */
  private async extractCodeBlocks(
    conversations: ImportConversation[],
    config: ImportRuntimeConfig
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

          if (code.length >= config.codeSettings.minLength) {
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
    config: ImportRuntimeConfig
  ): Promise<{ edgeCount: number; reviewCandidateCount: number }> {
    if (!config.duplicateDetection.enabled) {
      return { edgeCount: 0, reviewCandidateCount: 0 };
    }

    if (!this.context) {
      console.warn('⚠️  Skipping duplicate detection: no context (accountId required)');
      return { edgeCount: 0, reviewCandidateCount: 0 };
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

    // Build detection config from canonical import runtime options
    const detectionConfig: DuplicateDetectionConfig = {
      enabled: config.duplicateDetection.enabled,
      exactMatch: config.duplicateDetection.exactMatch ?? true,
      similarityThreshold: config.duplicateDetection.similarityThreshold ?? 0.85,
      crossConversation: config.duplicateDetection.crossConversation ?? true,
      algorithm: config.duplicateDetection.algorithm || 'jaccard',
      normalizeTokens: config.duplicateDetection.normalizeTokens ?? true,
      minTokenOverlap: config.duplicateDetection.minTokenOverlap ?? 3,
      lengthRatioTolerance: config.duplicateDetection.lengthRatioTolerance ?? 0.2,
      ignoreWhitespace: config.duplicateDetection.ignoreWhitespace ?? true,
      ignoreCase: config.duplicateDetection.ignoreCase ?? false,
      ignoreTimestamp: config.duplicateDetection.ignoreTimestamp ?? true,
      requireReview: config.duplicateDetection.requireReview ?? true,
      autoApproveExact: config.duplicateDetection.autoApproveExact ?? false,
      autoMergeThreshold: config.duplicateDetection.autoMergeThreshold ?? 0.95,
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
    const reviewCandidateCount = detectionConfig.requireReview
      ? duplicateGroups.reduce((sum, group) => sum + group.candidates.length, 0)
      : 0;

    if (reviewCandidateCount > 0 && this.context.jobId) {
      await this.persistDuplicateReviewCandidates(
        this.context.jobId,
        this.context.accountId,
        duplicateGroups
      );
    }

    return { edgeCount, reviewCandidateCount };
  }

  private ensureJobDuplicateCandidatesTable(): void {
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS job_duplicate_candidates (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        primary_node_id TEXT NOT NULL,
        duplicate_node_id TEXT NOT NULL,
        similarity REAL NOT NULL,
        metrics_json TEXT NOT NULL,
        primary_json TEXT NOT NULL,
        duplicate_json TEXT NOT NULL,
        decision TEXT CHECK(decision IN ('keep-primary', 'keep-duplicate', 'keep-both', 'merge', 'sequester')),
        decision_meta TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(job_id, account_id, candidate_id),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_job_duplicate_candidates_job
      ON job_duplicate_candidates(job_id, account_id);
      CREATE INDEX IF NOT EXISTS idx_job_duplicate_candidates_group
      ON job_duplicate_candidates(job_id, account_id, group_id);
    `);
  }

  private toStableDuplicateCandidateId(primaryNodeId: string, duplicateNodeId: string): string {
    const [a, b] = [primaryNodeId, duplicateNodeId].sort();
    return `dup_${this.stableHash(`${a}::${b}`, 20)}`;
  }

  private toStableDuplicateGroupId(candidateIds: string[]): string {
    return `grp_${this.stableHash([...candidateIds].sort().join('|'), 20)}`;
  }

  private async persistDuplicateReviewCandidates(
    jobId: string,
    accountId: string,
    duplicateGroups: DuplicateGroup[]
  ): Promise<void> {
    this.ensureJobDuplicateCandidatesTable();

    const now = Date.now();
    const deleteByJobStmt = this.sqliteDb.prepare(
      `
      DELETE FROM job_duplicate_candidates
      WHERE job_id = ? AND account_id = ?
    `
    );
    deleteByJobStmt.run(jobId, accountId);

    const insertStmt = this.sqliteDb.prepare(
      `
      INSERT INTO job_duplicate_candidates (
        id,
        job_id,
        account_id,
        group_id,
        candidate_id,
        primary_node_id,
        duplicate_node_id,
        similarity,
        metrics_json,
        primary_json,
        duplicate_json,
        decision,
        decision_meta,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, account_id, candidate_id) DO UPDATE SET
        group_id = excluded.group_id,
        primary_node_id = excluded.primary_node_id,
        duplicate_node_id = excluded.duplicate_node_id,
        similarity = excluded.similarity,
        metrics_json = excluded.metrics_json,
        primary_json = excluded.primary_json,
        duplicate_json = excluded.duplicate_json,
        decision = excluded.decision,
        decision_meta = excluded.decision_meta,
        updated_at = excluded.updated_at
    `
    );

    const transaction = this.sqliteDb.transaction((groups: DuplicateGroup[]) => {
      for (const group of groups) {
        const stabilizedCandidates = group.candidates
          .map((candidate) => {
            const primaryNodeId = candidate.primary.id;
            const duplicateNodeId = candidate.duplicate.id;
            if (!primaryNodeId || !duplicateNodeId) {
              return null;
            }

            return {
              candidate,
              candidateId: this.toStableDuplicateCandidateId(primaryNodeId, duplicateNodeId),
              primaryNodeId,
              duplicateNodeId,
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null);

        if (stabilizedCandidates.length === 0) {
          continue;
        }

        const groupId = this.toStableDuplicateGroupId(
          stabilizedCandidates.map((entry) => entry.candidateId)
        );

        for (const entry of stabilizedCandidates) {
          const recordId = `jdup_${this.stableHash(`${jobId}:${entry.candidateId}`, 28)}`;
          const decisionMeta = JSON.stringify({
            originalCandidateId: entry.candidate.id,
            suggestedAction: entry.candidate.decision ?? null,
          });

          insertStmt.run(
            recordId,
            jobId,
            accountId,
            groupId,
            entry.candidateId,
            entry.primaryNodeId,
            entry.duplicateNodeId,
            entry.candidate.similarity,
            JSON.stringify(entry.candidate.metrics || {}),
            JSON.stringify(entry.candidate.primary),
            JSON.stringify(entry.candidate.duplicate),
            entry.candidate.decision ?? null,
            decisionMeta,
            now,
            now
          );
        }
      }
    });

    transaction(duplicateGroups);
  }

  /**
   * Create deterministic SourceDoc bundles from materialized source streams.
   */
  private async createBundles(
    sources: MaterializedSource[],
    _config: ImportRuntimeConfig
  ): Promise<number> {
    if (!this.context?.accountId || sources.length === 0) {
      return 0;
    }

    const byConversation = new Map<string, MaterializedSource[]>();
    for (const source of sources) {
      if (!byConversation.has(source.conversationId)) {
        byConversation.set(source.conversationId, []);
      }
      byConversation.get(source.conversationId)!.push(source);
    }

    let bundlesCreated = 0;

    for (const [conversationId, conversationSources] of byConversation.entries()) {
      const ordered = [...conversationSources].sort(
        (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)
      );
      const content = ordered
        .map((source) => `## ${source.branch}\n\n${source.content}`)
        .join('\n\n');
      const bundleId = `sdoc_${this.stableHash(`${this.context.accountId}:${conversationId}`, 32)}`;
      const bundleMeta = await this.localStore.saveSource(bundleId, content);

      const provenance: SourceDoc['provenance'] = ordered.map((source) => ({
        conversation_id: source.conversationId,
        message_idx_start: 0,
        message_idx_end: Math.max(0, source.messageIds.length - 1),
        timestamp_min: source.timestamp,
        timestamp_max: source.timestamp,
        original_title: `Source stream ${source.branch}`,
      }));

      const created = await this.writeNodeIfAbsent({
        id: bundleId,
        kind: 'SourceDoc',
        title: `Conversation Bundle ${conversationId}`,
        n_segments: ordered.length,
        n_chars: content.length,
        created_ts_min: ordered[0]?.timestamp || Date.now(),
        created_ts_max: ordered[ordered.length - 1]?.timestamp || Date.now(),
        content_location: this.localStore.getStorageLocation(bundleMeta),
        provenance,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          conversation_id: conversationId,
          bundle_type: 'conversation_stream_bundle',
        },
      });
      if (created) {
        bundlesCreated++;
      }

      for (const source of ordered) {
        const stitchedEdgeId = `edge_stitched_${this.stableHash(`${bundleId}:${source.id}`, 32)}`;
        await this.writeEdgeIfAbsent({
          id: stitchedEdgeId,
          kind: 'STITCHED_FROM',
          from: bundleId,
          to: source.id,
          created_at: Date.now(),
          metadata: {
            conversation_id: conversationId,
          },
        });
      }
    }

    return bundlesCreated;
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
    config: ImportRuntimeConfig
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
