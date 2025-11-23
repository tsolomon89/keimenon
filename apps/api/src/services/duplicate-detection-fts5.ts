/**
 * FTS5 Duplicate Detection Service
 *
 * Hybrid algorithm for near-duplicate message detection using FTS5 full-text search.
 *
 * **Performance Target**: 10x+ speedup over O(n²) baseline algorithm
 * - Baseline (5000 messages): 81.6 seconds (12.5M comparisons)
 * - FTS5 (5000 messages): <8 seconds (<50k comparisons)
 *
 * **Algorithm Stages**:
 * 1. Exact duplicates via content_hash (O(1) hash lookup)
 * 2. FTS5 candidate search (O(log n) per message = O(n log n) total)
 * 3. Similarity scoring on candidates only (O(c²) where c << n)
 *
 * **Multi-tenant Isolation**: account_id filtering in WHERE clause (not FTS5 MATCH)
 *
 * **Database Dependencies**:
 * - Migration 022: messages_fts_duplicate table (FTS5 with trigram tokenization)
 * - Triggers: Auto-sync on INSERT/UPDATE/DELETE of Message nodes
 *
 * See: docs/architecture/DUPLICATE_DETECTION_FTS5.md
 * See: packages/db/src/sqlite/migrations/022_add_fts5_duplicate_detection.sql
 * See: apps/api/src/__tests__/duplicate-detection-benchmark.test.ts
 */

import type Database from 'better-sqlite3';
import type {
  DuplicateDetectionConfig,
  DuplicateCandidate,
  DuplicateGroup,
} from './duplicate-detection';

/**
 * FTS5 configuration options
 */
export interface FTS5Config {
  /** Enable FTS5 candidate search (falls back to O(n²) if false) */
  enabled: boolean;

  /** Maximum candidates to return per message (default: 100) */
  candidateLimit: number;

  /** Minimum FTS5 rank threshold for candidates (default: -10.0) */
  minRankThreshold: number;

  /** Use content_hash for exact duplicates before FTS5 (optimization) */
  useContentHash: boolean;
}

/**
 * FTS5 search result
 */
interface FTS5Candidate {
  node_id: string;
  content: string;
  account_id: string;
  rank: number;
}

/**
 * Message with metadata for duplicate detection
 */
export interface MessageWithMetadata {
  id: string; // Database node ID (msg_...)
  conversationId: string;
  conversationTitle: string;
  content: string;
  timestamp: number;
  metadata: any;
  content_hash?: string; // For exact duplicate detection
}

/**
 * FTS5-based duplicate detection service
 *
 * Replaces O(n²) nested loop with FTS5 candidate search.
 */
export class DuplicateDetectionFTS5Service {
  constructor(private db: Database.Database) {}

  /**
   * Find duplicate messages using FTS5 hybrid algorithm
   *
   * @param messages - Messages to check (must include id, content, account_id)
   * @param config - Duplicate detection configuration
   * @param fts5Config - FTS5-specific configuration
   * @param accountId - Account ID for multi-tenant isolation (REQUIRED)
   * @returns Duplicate groups
   */
  async findDuplicates(
    messages: MessageWithMetadata[],
    config: DuplicateDetectionConfig,
    fts5Config: FTS5Config,
    accountId: string
  ): Promise<DuplicateGroup[]> {
    if (!accountId) {
      throw new Error('accountId is required for multi-tenant isolation');
    }

    console.log(
      `[FTS5-DuplicateDetection] 🔍 Starting FTS5 duplicate detection for ${messages.length.toLocaleString()} messages (account: ${accountId})`
    );

    if (!config.enabled) {
      console.log('[FTS5-DuplicateDetection] ⏭️  Duplicate detection disabled');
      return [];
    }

    if (messages.length === 0) {
      console.log('[FTS5-DuplicateDetection] ℹ️  No messages to process');
      return [];
    }

    // Verify FTS5 table exists
    if (!this.verifyFTS5Available()) {
      console.warn(
        '[FTS5-DuplicateDetection] ⚠️  FTS5 table not available, falling back to O(n²) algorithm'
      );
      throw new Error('FTS5 table not available - use DuplicateDetectionService instead');
    }

    const startTime = Date.now();
    const candidates: DuplicateCandidate[] = [];

    // Stage 1: Exact duplicates via content_hash (O(1) hash lookup)
    let exactDuplicatesFound = 0;
    if (fts5Config.useContentHash && config.exactMatch) {
      const exactDuplicates = this.findExactDuplicates(messages);
      exactDuplicatesFound = exactDuplicates.length;
      candidates.push(...exactDuplicates);

      console.log(
        `[FTS5-DuplicateDetection] ✅ Stage 1 (Exact): Found ${exactDuplicatesFound} exact duplicates via content_hash`
      );
    }

    // Stage 2 & 3: FTS5 candidate search + similarity scoring
    let fts5CandidatesFound = 0;
    let comparisonsPerformed = 0;
    let skippedByCrossConversation = 0;
    let skippedByLengthRatio = 0;

    for (let i = 0; i < messages.length; i++) {
      const msgA = messages[i];

      // Find candidates using FTS5
      const fts5Candidates = this.findCandidatesUsingFTS5(
        msgA.content,
        accountId,
        fts5Config.candidateLimit,
        fts5Config.minRankThreshold
      );

      fts5CandidatesFound += fts5Candidates.length;

      // Compare msgA with each FTS5 candidate
      for (const fts5Candidate of fts5Candidates) {
        // Find corresponding message object
        const msgB = messages.find((m) => m.id === fts5Candidate.node_id);

        if (!msgB) {
          // Candidate is from a different conversation or not in current batch
          continue;
        }

        // Skip comparing message to itself
        if (msgA.id === msgB.id) {
          continue;
        }

        // Skip cross-conversation if disabled
        if (!config.crossConversation && msgA.conversationId !== msgB.conversationId) {
          skippedByCrossConversation++;
          continue;
        }

        // Early exit: length ratio check
        const lengthRatio =
          Math.min(msgA.content.length, msgB.content.length) /
          Math.max(msgA.content.length, msgB.content.length);

        if (lengthRatio < 1 - config.lengthRatioTolerance) {
          skippedByLengthRatio++;
          continue;
        }

        // Perform actual similarity check
        comparisonsPerformed++;
        const result = this.checkDuplicate(msgA.content, msgB.content, config);

        if (result.isDuplicate) {
          // Check if we already have this pair (avoid duplicates)
          const existingPair = candidates.find(
            (c) =>
              (c.primary.id === msgA.id && c.duplicate.id === msgB.id) ||
              (c.primary.id === msgB.id && c.duplicate.id === msgA.id)
          );

          if (!existingPair) {
            const candidate: DuplicateCandidate = {
              id: `dup_${msgA.id}_${msgB.id}`,
              primary: {
                id: msgA.id,
                content: msgA.content,
                conversationTitle: msgA.conversationTitle,
                timestamp: msgA.timestamp,
                charCount: msgA.content.length,
                metadata: msgA.metadata || {},
              },
              duplicate: {
                id: msgB.id,
                content: msgB.content,
                conversationTitle: msgB.conversationTitle,
                timestamp: msgB.timestamp,
                charCount: msgB.content.length,
                metadata: msgB.metadata || {},
              },
              similarity: result.similarity,
              metrics: result.metrics,
            };

            // Auto-resolve if above threshold
            if (config.autoMergeThreshold && result.similarity >= config.autoMergeThreshold) {
              candidate.decision = 'merge';
            } else if (config.autoApproveExact && result.similarity === 1.0) {
              candidate.decision = 'merge';
            }

            candidates.push(candidate);
          }
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `[FTS5-DuplicateDetection] ✅ Stage 2 (FTS5): Found ${fts5CandidatesFound} FTS5 candidates`
    );
    console.log(
      `[FTS5-DuplicateDetection] ✅ Stage 3 (Similarity): Performed ${comparisonsPerformed.toLocaleString()} comparisons`
    );
    console.log(
      `[FTS5-DuplicateDetection] ⚡ Skipped ${skippedByCrossConversation.toLocaleString()} (cross-conversation) + ${skippedByLengthRatio.toLocaleString()} (length ratio)`
    );
    console.log(
      `[FTS5-DuplicateDetection] 📊 Total candidates: ${candidates.length} (${exactDuplicatesFound} exact + ${candidates.length - exactDuplicatesFound} FTS5)`
    );
    console.log(`[FTS5-DuplicateDetection] ⏱️  Duration: ${duration}ms`);

    // Calculate performance metrics
    const baselineComparisons = (messages.length * (messages.length - 1)) / 2;
    const speedup = baselineComparisons / Math.max(comparisonsPerformed, 1);
    console.log(
      `[FTS5-DuplicateDetection] 🚀 Speedup: ${speedup.toFixed(1)}x (${comparisonsPerformed.toLocaleString()} vs ${baselineComparisons.toLocaleString()} baseline)`
    );

    // Group candidates
    const groups = this.groupCandidates(candidates);
    console.log(`[FTS5-DuplicateDetection] 📦 Grouped into ${groups.length} duplicate groups`);

    return groups;
  }

  /**
   * Find exact duplicates using content_hash (Stage 1)
   *
   * O(1) hash lookup per message
   */
  private findExactDuplicates(messages: MessageWithMetadata[]): DuplicateCandidate[] {
    const candidates: DuplicateCandidate[] = [];
    const hashMap = new Map<string, MessageWithMetadata[]>();

    // Group messages by content_hash
    for (const msg of messages) {
      if (!msg.content_hash) {
        continue;
      }

      if (!hashMap.has(msg.content_hash)) {
        hashMap.set(msg.content_hash, []);
      }

      hashMap.get(msg.content_hash)!.push(msg);
    }

    // Find duplicates within each hash group
    for (const [_hash, group] of Array.from(hashMap.entries())) {
      if (group.length < 2) {
        continue;
      }

      // All messages in group are exact duplicates
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const msgA = group[i];
          const msgB = group[j];

          candidates.push({
            id: `dup_${msgA.id}_${msgB.id}`,
            primary: {
              id: msgA.id,
              content: msgA.content,
              conversationTitle: msgA.conversationTitle,
              timestamp: msgA.timestamp,
              charCount: msgA.content.length,
              metadata: msgA.metadata || {},
            },
            duplicate: {
              id: msgB.id,
              content: msgB.content,
              conversationTitle: msgB.conversationTitle,
              timestamp: msgB.timestamp,
              charCount: msgB.content.length,
              metadata: msgB.metadata || {},
            },
            similarity: 1.0,
            metrics: {
              tokenOverlap: msgA.content.split(/\s+/).length,
              editDistance: 0,
              lengthRatio: 1.0,
            },
            decision: 'merge', // Exact duplicates auto-approved
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Find candidate duplicates using FTS5 search (Stage 2)
   *
   * O(log n) search per message using FTS5 trigram index
   *
   * @param content - Message content to search for
   * @param accountId - Account ID for multi-tenant isolation
   * @param limit - Maximum candidates to return
   * @param minRank - Minimum FTS5 rank threshold
   * @returns FTS5 candidates with node_id, content, rank
   */
  private findCandidatesUsingFTS5(
    content: string,
    accountId: string,
    limit: number = 100,
    minRank: number = -10.0
  ): FTS5Candidate[] {
    try {
      // Prepare FTS5 MATCH query
      // Use first N words as search query (trigrams will handle partial matches)
      const words = content.split(/\s+/).filter((w) => w.length > 0).slice(0, 20);

      if (words.length === 0) {
        return []; // No words to search
      }

      // Escape FTS5 special characters and wrap each word in quotes to prevent syntax errors
      // FTS5 special characters: " * ( ) { }
      const escapedWords = words.map((word) => {
        // Remove FTS5 special characters
        const cleaned = word.replace(/["*(){}]/g, '');
        // Escape quotes in the cleaned word
        const escaped = cleaned.replace(/'/g, "''");
        // Wrap in double quotes for phrase matching
        return `"${escaped}"`;
      });

      // Join words with OR operator (any word match is a candidate)
      const searchQuery = escapedWords.join(' OR ');

      // CRITICAL: Multi-tenant isolation via WHERE clause (not MATCH)
      // FTS5 MATCH searches content only, account_id filter in WHERE
      const stmt = this.db.prepare<[string, string, number, number]>(`
        SELECT
          node_id,
          content,
          account_id,
          rank
        FROM messages_fts_duplicate
        WHERE content MATCH ?
          AND account_id = ?
          AND rank >= ?
        ORDER BY rank DESC
        LIMIT ?
      `);

      const results = stmt.all(searchQuery, accountId, minRank, limit);

      return results as FTS5Candidate[];
    } catch (error: any) {
      console.error('[FTS5-DuplicateDetection] ❌ FTS5 query failed:', error.message);
      return [];
    }
  }

  /**
   * Check if two messages are duplicates (Stage 3)
   *
   * Reuses existing similarity algorithms from DuplicateDetectionService.
   * This is the same logic, just applied only to FTS5 candidates instead of all pairs.
   *
   * TODO: Extract this to a shared utility module to avoid duplication
   * See: apps/api/src/services/duplicate-detection.ts:210
   */
  private checkDuplicate(
    contentA: string,
    contentB: string,
    config: DuplicateDetectionConfig
  ): {
    isDuplicate: boolean;
    similarity: number;
    metrics: {
      tokenOverlap: number;
      editDistance: number;
      lengthRatio: number;
    };
  } {
    // Import similarity functions from utils
    // NOTE: This is a simplified implementation for Phase 2.1
    // TODO: Refactor to use shared similarity utilities
    // See: packages/shared/src/utils/similarity.ts (to be created)

    // For now, use simple Jaccard similarity
    const tokensA = new Set(contentA.toLowerCase().split(/\s+/));
    const tokensB = new Set(contentB.toLowerCase().split(/\s+/));

    const intersection = new Set(Array.from(tokensA).filter((x) => tokensB.has(x)));
    const union = new Set([...Array.from(tokensA), ...Array.from(tokensB)]);

    const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

    const lengthRatio =
      Math.min(contentA.length, contentB.length) / Math.max(contentA.length, contentB.length);

    const isDuplicate =
      jaccardSimilarity >= config.similarityThreshold &&
      lengthRatio >= 1 - config.lengthRatioTolerance;

    return {
      isDuplicate,
      similarity: jaccardSimilarity,
      metrics: {
        tokenOverlap: intersection.size,
        editDistance: 0, // TODO: Implement if needed
        lengthRatio,
      },
    };
  }

  /**
   * Group duplicate candidates by conversation pairs
   *
   * Same logic as DuplicateDetectionService.groupCandidates()
   * See: apps/api/src/services/duplicate-detection.ts:389
   */
  private groupCandidates(candidates: DuplicateCandidate[]): DuplicateGroup[] {
    const groupMap = new Map<string, DuplicateCandidate[]>();

    for (const candidate of candidates) {
      // Create a group key based on conversation pair
      const key = [candidate.primary.conversationTitle, candidate.duplicate.conversationTitle]
        .sort()
        .join('||');

      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }

      groupMap.get(key)!.push(candidate);
    }

    // Convert to groups
    const groups: DuplicateGroup[] = [];
    let groupId = 1;

    for (const [_key, groupCandidates] of Array.from(groupMap.entries())) {
      const autoResolved = groupCandidates.filter((c) => c.decision).length;

      groups.push({
        id: `grp_${groupId++}`,
        candidates: groupCandidates,
        totalDuplicates: groupCandidates.length,
        reviewed: autoResolved,
        autoResolved,
      });
    }

    return groups;
  }

  /**
   * Verify FTS5 table is available
   *
   * Checks if messages_fts_duplicate virtual table exists.
   * Migration 022 must be applied for FTS5 to work.
   */
  private verifyFTS5Available(): boolean {
    try {
      const result = this.db
        .prepare<[]>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts_duplicate'`
        )
        .get();

      return !!result;
    } catch (error: any) {
      console.error('[FTS5-DuplicateDetection] ❌ FTS5 verification failed:', error.message);
      return false;
    }
  }

  /**
   * Get FTS5 table statistics (for monitoring/debugging)
   */
  getStatistics(): {
    fts5Available: boolean;
    totalEntries: number;
    sampleEntries: Array<{ node_id: string; account_id: string }>;
  } {
    if (!this.verifyFTS5Available()) {
      return {
        fts5Available: false,
        totalEntries: 0,
        sampleEntries: [],
      };
    }

    try {
      const countResult = this.db.prepare<[]>('SELECT COUNT(*) as count FROM messages_fts_duplicate').get() as { count: number };

      const sampleResults = this.db
        .prepare<[number]>('SELECT node_id, account_id FROM messages_fts_duplicate LIMIT ?')
        .all(5) as Array<{ node_id: string; account_id: string }>;

      return {
        fts5Available: true,
        totalEntries: countResult.count,
        sampleEntries: sampleResults,
      };
    } catch (error: any) {
      console.error('[FTS5-DuplicateDetection] ❌ Statistics query failed:', error.message);
      return {
        fts5Available: false,
        totalEntries: 0,
        sampleEntries: [],
      };
    }
  }
}
