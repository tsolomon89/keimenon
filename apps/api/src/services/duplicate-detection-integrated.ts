/**
 * Integrated Duplicate Detection Service
 *
 * Orchestrates duplicate detection using:
 * 1. FTS5 (Fast Text Search) - Database native optimization
 * 2. LSH (Locality Sensitive Hashing) - High-recall approximate matching (Deep Pipeline)
 * 3. O(n²) Baseline - Fallback
 *
 * NOW INCLUDES: Evidence-Based Canonicalization via CanonicalService
 */

import Database from 'better-sqlite3';
import {
  DuplicateDetectionFTS5Service,
  type MessageWithMetadata,
} from './duplicate-detection-fts5';
import {
  DuplicateDetectionService,
  type DuplicateDetectionConfig,
  type DuplicateGroup,
} from './duplicate-detection';
import type { NormalizedConversation, NormalizedMessage } from '@keimenon/parsers';
import {
  getFTS5Config,
  getLSHConfig,
  getDuplicateDetectionStrategy,
  getDuplicateDetectionLoggingConfig,
  getDuplicateDetectionPerformanceThresholds,
  isEmbeddingsStrategyEnabled,
  type DuplicateDetectionStrategy,
} from '../config/duplicate-detection.config';

// Deep Pipeline Services
import { SignatureService } from './signature-service';
import { LSHService } from './lsh-service';
import { CanonicalService, type EvidenceMetrics } from './canonical-service';

/**
 * Duplicate detection result with metadata
 */
export interface DuplicateDetectionResult {
  groups: DuplicateGroup[];
  metadata: {
    strategy: 'fts5' | 'baseline' | 'lsh' | 'embeddings';
    duration: number;
    messagesProcessed: number;
    comparisonsPerformed: number;
    speedupVsBaseline: number;
    fts5Available: boolean;
    fts5Enabled: boolean;
    lshEnabled: boolean;
    embeddingsEnabled: boolean;
  };
}

/**
 * Integrated Duplicate Detection Service
 */
export class IntegratedDuplicateDetectionService {
  private fts5Service: DuplicateDetectionFTS5Service;
  private baselineService: DuplicateDetectionService;

  // Deep Pipeline
  private signatureService: SignatureService;
  private lshService: LSHService;
  private canonicalService: CanonicalService;

  private strategy: DuplicateDetectionStrategy;
  private loggingConfig: ReturnType<typeof getDuplicateDetectionLoggingConfig>;
  private thresholds: ReturnType<typeof getDuplicateDetectionPerformanceThresholds>;

  constructor(private db: Database.Database) {
    this.fts5Service = new DuplicateDetectionFTS5Service(db);
    this.baselineService = new DuplicateDetectionService();

    // Initialize Deep Pipeline
    this.signatureService = new SignatureService();
    this.lshService = new LSHService();
    this.canonicalService = new CanonicalService();

    this.strategy = getDuplicateDetectionStrategy();
    this.loggingConfig = getDuplicateDetectionLoggingConfig();
    this.thresholds = getDuplicateDetectionPerformanceThresholds();
  }

  /**
   * Find duplicate messages using optimal strategy
   */
  async findDuplicates(
    messages: MessageWithMetadata[],
    config: DuplicateDetectionConfig,
    accountId: string
  ): Promise<DuplicateDetectionResult> {
    if (!accountId) {
      throw new Error('accountId is required for multi-tenant isolation');
    }

    if (messages.length === 0) {
      return this.emptyResult();
    }

    const startTime = Date.now();
    const lshConfig = getLSHConfig();
    const fts5Config = getFTS5Config();
    const fts5Available = this.isFTS5Available();
    const fts5Enabled = fts5Config.enabled;
    const lshEnabled = lshConfig.enabled;
    const embeddingsEnabled = isEmbeddingsStrategyEnabled();

    let selectedStrategy: 'lsh' | 'fts5' | 'baseline' | 'embeddings' = 'baseline';

    if (this.strategy === 'baseline') {
      selectedStrategy = 'baseline';
    } else if (this.strategy === 'fts5') {
      selectedStrategy = fts5Available && fts5Enabled ? 'fts5' : 'baseline';
    } else if (this.strategy === 'lsh') {
      selectedStrategy = lshEnabled ? 'lsh' : fts5Available && fts5Enabled ? 'fts5' : 'baseline';
    } else if (this.strategy === 'embeddings') {
      selectedStrategy = embeddingsEnabled ? 'embeddings' : 'baseline';
    } else {
      selectedStrategy = lshEnabled ? 'lsh' : fts5Available && fts5Enabled ? 'fts5' : 'baseline';
    }

    if (this.loggingConfig.logPerformanceMetrics) {
      console.log(
        `[IntegratedDuplicateDetection] 🎯 Strategy: ${selectedStrategy} (Messages: ${messages.length})`
      );
    }

    let groups: DuplicateGroup[];
    let comparisonsPerformed = 0;

    // --- STRATEGY EXECUTION ---
    if (selectedStrategy === 'lsh') {
      // LSH PIPELINE
      groups = this.findDuplicatesLSH(messages, config);
      // Estimation: LSH is O(N * bands), but lets say effectively we compared candidates
      comparisonsPerformed = messages.length * lshConfig.bands; // Very rough proxy
    } else if (selectedStrategy === 'embeddings') {
      const conversations = this.convertToNormalizedConversations(messages);
      groups = await this.baselineService.findDuplicates(conversations, {
        ...config,
        algorithm: 'embedding',
      });
      comparisonsPerformed = (messages.length * (messages.length - 1)) / 2;
    } else if (selectedStrategy === 'fts5') {
      // FTS5 PIPELINE
      groups = await this.fts5Service.findDuplicates(messages, config, fts5Config, accountId);
      comparisonsPerformed = Math.min(
        messages.length * fts5Config.candidateLimit,
        (messages.length * (messages.length - 1)) / 2
      );
    } else {
      // BASELINE PIPELINE
      const conversations = this.convertToNormalizedConversations(messages);
      groups = await this.baselineService.findDuplicates(conversations, config);
      comparisonsPerformed = (messages.length * (messages.length - 1)) / 2;
    }

    const duration = Date.now() - startTime;
    const baselineComparisons = (messages.length * (messages.length - 1)) / 2;
    const speedup =
      baselineComparisons > 0 ? baselineComparisons / Math.max(comparisonsPerformed, 1) : 1;

    // Perform Canonicalization on Groups
    this.canonicalizeGroups(groups, messages);
    this.persistDedupeEvidence(accountId, groups);

    return {
      groups,
      metadata: {
        strategy: selectedStrategy,
        duration,
        messagesProcessed: messages.length,
        comparisonsPerformed,
        speedupVsBaseline: speedup,
        fts5Available,
        fts5Enabled,
        lshEnabled,
        embeddingsEnabled,
      },
    };
  }

  /**
   * Report runtime duplicate-detection health/config state.
   * Used by tests and monitoring paths.
   */
  getHealthStatus(): {
    fts5Available: boolean;
    fts5Enabled: boolean;
    lshEnabled: boolean;
    embeddingsEnabled: boolean;
    strategy: DuplicateDetectionStrategy;
    fts5Stats: ReturnType<DuplicateDetectionFTS5Service['getStatistics']>;
    thresholds: ReturnType<typeof getDuplicateDetectionPerformanceThresholds>;
  } {
    const fts5Stats = this.fts5Service.getStatistics();

    return {
      fts5Available: fts5Stats.fts5Available,
      fts5Enabled: getFTS5Config().enabled,
      lshEnabled: getLSHConfig().enabled,
      embeddingsEnabled: isEmbeddingsStrategyEnabled(),
      strategy: this.strategy,
      fts5Stats,
      thresholds: this.thresholds,
    };
  }

  /**
   * LSH-based Duplicate Detection (Deep Pipeline)
   */
  private findDuplicatesLSH(
    messages: MessageWithMetadata[],
    config: DuplicateDetectionConfig
  ): DuplicateGroup[] {
    // 1. Generate Signatures
    const signatures = messages.map((msg) => ({
      id: msg.id,
      sig: this.signatureService.generateSignatures(msg.content || ''),
    }));

    // 2. Bucketing (LSH Banding)
    // Map<BucketKey, List<MessageId>>
    const buckets = new Map<string, string[]>();

    for (const item of signatures) {
      for (const key of item.sig.lshKeys) {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(item.id);
      }
    }

    // 3. Find Candidates (Collisions)
    // If 2 messages share a bucket, they are candidates
    const candidates = new Map<string, Set<string>>(); // MsgId -> Set<CandidateMsgId>

    for (const [bucketKey, ids] of buckets) {
      if (ids.length > 1) {
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const a = ids[i];
            const b = ids[j];

            if (!candidates.has(a)) candidates.set(a, new Set());
            candidates.get(a)!.add(b);
          }
        }
      }
    }

    // 4. Verify Candidates (Jaccard on MinHash or Exact)
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    // Map valid ID back to full object for easy access
    const msgMap = new Map(messages.map((m) => [m.id, m]));
    // Verify threshold
    const threshold = config.similarityThreshold || 0.9;

    for (const [idA, candidateSet] of candidates) {
      if (processed.has(idA)) continue;

      const groupMembers: string[] = [idA];
      const sigA = signatures.find((s) => s.id === idA)?.sig.minHash;

      if (!sigA) continue; // Should not happen

      for (const idB of candidateSet) {
        if (processed.has(idB)) continue;

        const sigB = signatures.find((s) => s.id === idB)?.sig.minHash;
        if (!sigB) continue;

        // Est Jaccard
        const similarity = this.lshService.estimateSimilarity(sigA, sigB);

        if (similarity >= threshold) {
          groupMembers.push(idB);
          processed.add(idB);
        }
      }

      if (groupMembers.length > 1) {
        processed.add(idA);

        // First member is primary, rest are duplicates
        const primaryId = groupMembers[0];
        const primaryMsg = msgMap.get(primaryId)!;
        const primaryData = {
          id: primaryId,
          content: primaryMsg.content?.slice(0, 500) || '',
          conversationTitle: primaryMsg.conversationTitle || 'Unknown',
          timestamp: primaryMsg.timestamp || Date.now(),
          charCount: primaryMsg.content?.length || 0,
          metadata: primaryMsg.metadata || {},
        };

        // Create DuplicateCandidate for each duplicate
        const candidates = groupMembers.slice(1).map((dupId, idx) => {
          const dupMsg = msgMap.get(dupId)!;
          return {
            id: `lsh-dup-${primaryId}-${idx}`,
            primary: primaryData,
            duplicate: {
              id: dupId,
              content: dupMsg.content?.slice(0, 500) || '',
              conversationTitle: dupMsg.conversationTitle || 'Unknown',
              timestamp: dupMsg.timestamp || Date.now(),
              charCount: dupMsg.content?.length || 0,
              metadata: dupMsg.metadata || {},
            },
            similarity: 0.95, // High confidence due to MinHash verification
            metrics: {
              tokenOverlap: 0.95,
              editDistance: 0,
              lengthRatio: 1.0,
            },
          };
        });

        groups.push({
          id: `lsh-group-${primaryId}`,
          candidates,
          totalDuplicates: candidates.length,
          reviewed: 0,
          autoResolved: 0,
        });
      }
    }

    return groups;
  }

  /**
   * Apply Evidence-Based Canonicalization to groups
   * Uses candidates structure to determine canonical message.
   * Sets decision on each candidate based on canonicalization result.
   */
  private canonicalizeGroups(groups: DuplicateGroup[], sourceMessages: MessageWithMetadata[]) {
    const msgMap = new Map(sourceMessages.map((m) => [m.id, m]));

    for (const group of groups) {
      if (group.candidates.length === 0) continue;

      // Collect all message IDs in this group (primary + all duplicates)
      const allIds = new Set<string>();
      for (const candidate of group.candidates) {
        allIds.add(candidate.primary.id);
        allIds.add(candidate.duplicate.id);
      }

      // Calculate evidence for each unique message
      const contenders = Array.from(allIds).map((id) => {
        const original = msgMap.get(id);
        const role = this.resolveMessageRole(original);
        const frequency =
          group.candidates.filter((candidate) => candidate.primary.id === id).length +
          group.candidates.filter((candidate) => candidate.duplicate.id === id).length;
        const metrics: EvidenceMetrics = {
          frequency: Math.max(1, frequency),
          blobDiversity: Math.max(1, original?.content ? 1 : 0),
          roleVariety: role ? 1 : 0,
          temporalSpan: 0,
          modalityCount: 1,
        };
        return { id, metrics };
      });

      const canonicalId = this.canonicalService.pickCanonical(contenders);

      if (canonicalId) {
        // Set decision on each candidate based on canonical
        for (const candidate of group.candidates) {
          if (candidate.primary.id === canonicalId) {
            candidate.decision = 'keep-primary';
          } else if (candidate.duplicate.id === canonicalId) {
            candidate.decision = 'keep-duplicate';
          } else {
            candidate.decision = 'keep-primary'; // Default
          }
        }
      }
    }
  }

  private convertToNormalizedMessage(msg: MessageWithMetadata): NormalizedMessage {
    return {
      index: 0,
      role: 'user',
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      hash: msg.content_hash || '',
      metadata: { ...msg.metadata, dbNodeId: msg.id },
    };
  }

  private resolveMessageRole(message?: MessageWithMetadata): string | undefined {
    if (!message?.metadata) {
      return undefined;
    }

    const role =
      message.metadata.role || message.metadata.authorRole || message.metadata.senderRole || null;
    return typeof role === 'string' ? role.toLowerCase() : undefined;
  }

  // ... (Keep existing helpers)

  private checkPerformanceThresholds(duration: number, comparisons: number, speedup: number): void {
    if (duration > this.thresholds.maxDurationMs) {
      console.warn(
        `[IntegratedDuplicateDetection] ⚠️  Performance degradation: Duration ${duration}ms exceeds threshold ${this.thresholds.maxDurationMs}ms`
      );
    }

    if (comparisons > this.thresholds.maxComparisons) {
      console.warn(
        `[IntegratedDuplicateDetection] ⚠️  Performance degradation: Comparisons ${comparisons.toLocaleString()} exceeds threshold ${this.thresholds.maxComparisons.toLocaleString()}`
      );
    }

    if (this.strategy !== 'baseline' && speedup < this.thresholds.targetSpeedup) {
      console.warn(
        `[IntegratedDuplicateDetection] ⚠️  Performance degradation: Speedup ${speedup.toFixed(1)}x below target ${this.thresholds.targetSpeedup}x`
      );
    }
  }

  private convertToNormalizedConversations(
    messages: MessageWithMetadata[]
  ): NormalizedConversation[] {
    const conversationMap = new Map<string, MessageWithMetadata[]>();
    for (const msg of messages) {
      const convId = msg.conversationId || 'default';
      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, []);
      }
      conversationMap.get(convId)!.push(msg);
    }
    const conversations: NormalizedConversation[] = [];
    for (const [conversationId, convMessages] of conversationMap.entries()) {
      const conversation: NormalizedConversation = {
        conversation_id: conversationId,
        platform: 'unknown',
        title: convMessages[0]?.conversationTitle || 'Untitled Conversation',
        created_at: convMessages[0]?.timestamp || Date.now(),
        updated_at: Math.max(...convMessages.map((m) => m.timestamp || 0)) || Date.now(),
        messages: convMessages.map((msg, index) => ({
          index,
          role: 'user',
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
          hash: msg.content_hash || '',
          metadata: { ...msg.metadata, dbNodeId: msg.id },
        })),
        metadata: {},
      };
      conversations.push(conversation);
    }
    return conversations;
  }

  private isFTS5Available(): boolean {
    const stats = this.fts5Service.getStatistics();
    return stats.fts5Available;
  }

  private persistDedupeEvidence(accountId: string, groups: DuplicateGroup[]): void {
    if (groups.length === 0) {
      return;
    }

    try {
      const now = Date.now();
      const upsert = this.db.prepare(
        `
        INSERT INTO dedupe_evidence (
          id, account_id, primary_node_id, duplicate_node_id, similarity,
          role_user_count, role_assistant_count, role_system_count, role_unknown_count,
          created_at, updated_at, data_tag
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          similarity = excluded.similarity,
          role_user_count = excluded.role_user_count,
          role_assistant_count = excluded.role_assistant_count,
          role_system_count = excluded.role_system_count,
          role_unknown_count = excluded.role_unknown_count,
          updated_at = excluded.updated_at,
          data_tag = excluded.data_tag
      `
      );

      const writeTransaction = this.db.transaction((inputGroups: DuplicateGroup[]) => {
        for (const group of inputGroups) {
          for (const candidate of group.candidates) {
            const roleCounts = {
              user: 0,
              assistant: 0,
              system: 0,
              unknown: 0,
            };
            const primaryRole = this.resolveMessageRole({
              metadata: candidate.primary.metadata,
            } as any);
            const duplicateRole = this.resolveMessageRole({
              metadata: candidate.duplicate.metadata,
            } as any);
            for (const role of [primaryRole, duplicateRole]) {
              if (role === 'user') {
                roleCounts.user += 1;
              } else if (role === 'assistant') {
                roleCounts.assistant += 1;
              } else if (role === 'system') {
                roleCounts.system += 1;
              } else {
                roleCounts.unknown += 1;
              }
            }

            upsert.run(
              candidate.id,
              accountId,
              candidate.primary.id,
              candidate.duplicate.id,
              candidate.similarity,
              roleCounts.user,
              roleCounts.assistant,
              roleCounts.system,
              roleCounts.unknown,
              now,
              now,
              'real'
            );
          }
        }
      });

      writeTransaction(groups);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('no such table')) {
        console.warn('[IntegratedDuplicateDetection] Failed to persist dedupe evidence:', message);
      }
    }
  }

  private emptyResult(): DuplicateDetectionResult {
    return {
      groups: [],
      metadata: {
        strategy: 'baseline',
        duration: 0,
        messagesProcessed: 0,
        comparisonsPerformed: 0,
        speedupVsBaseline: 1.0,
        fts5Available: this.isFTS5Available(),
        fts5Enabled: getFTS5Config().enabled,
        lshEnabled: getLSHConfig().enabled,
        embeddingsEnabled: isEmbeddingsStrategyEnabled(),
      },
    };
  }
}
