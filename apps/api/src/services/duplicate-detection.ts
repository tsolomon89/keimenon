import { NormalizedConversation } from '@canvas-memory/parsers';
import { tokenize, jaccard, normalizeText } from '@canvas-memory/parsers';

export interface DuplicateDetectionConfig {
  enabled: boolean;
  exactMatch: boolean;
  similarityThreshold: number;
  crossConversation: boolean;
  algorithm: 'jaccard' | 'levenshtein' | 'cosine' | 'embedding';
  normalizeTokens: boolean;
  minTokenOverlap: number;
  lengthRatioTolerance: number;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  ignoreTimestamp: boolean;
  requireReview: boolean;
  autoApproveExact: boolean;
  autoMergeThreshold: number;
}

export interface DuplicateCandidate {
  id: string;
  primary: {
    id: string;
    content: string;
    conversationTitle: string;
    timestamp: number;
    charCount: number;
    metadata: any;
  };
  duplicate: {
    id: string;
    content: string;
    conversationTitle: string;
    timestamp: number;
    charCount: number;
    metadata: any;
  };
  similarity: number;
  metrics: {
    tokenOverlap: number;
    editDistance: number;
    lengthRatio: number;
  };
  decision?: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge';
}

export interface DuplicateGroup {
  id: string;
  candidates: DuplicateCandidate[];
  totalDuplicates: number;
  reviewed: number;
  autoResolved: number;
}

/**
 * Service for detecting duplicate messages across conversations
 */
export class DuplicateDetectionService {
  /**
   * Find duplicate messages across all conversations
   * OPTIMIZED: Uses early exit pre-filtering to skip obvious non-duplicates
   */
  async findDuplicates(
    conversations: NormalizedConversation[],
    config: DuplicateDetectionConfig
  ): Promise<DuplicateGroup[]> {
    if (!config.enabled) {
      return [];
    }

    // Extract all messages with metadata
    const allMessages = this.extractMessages(conversations);

    console.log(
      `[DuplicateDetection] 📊 Extracted ${allMessages.length} messages from ${conversations.length} conversations`
    );
    console.log(
      `[DuplicateDetection] Config: crossConversation=${config.crossConversation}, threshold=${config.similarityThreshold}`
    );
    if (allMessages.length > 0) {
      console.log(
        `[DuplicateDetection] Sample message: "${allMessages[0].content.substring(0, 50)}..."`
      );
    }

    // Find duplicate pairs with early exit optimization
    const candidates: DuplicateCandidate[] = [];
    let totalComparisons = 0;
    let skippedByEarlyExit = 0;

    for (let i = 0; i < allMessages.length; i++) {
      for (let j = i + 1; j < allMessages.length; j++) {
        const msgA = allMessages[i];
        const msgB = allMessages[j];

        totalComparisons++;

        // Skip cross-conversation pairs when crossConversation detection is disabled
        if (!config.crossConversation && msgA.conversationId !== msgB.conversationId) {
          continue;
        }

        // OPTIMIZATION: Early exit based on length ratio (fast pre-filter)
        // Skip expensive similarity calculation if lengths are too different
        const lengthRatio =
          Math.min(msgA.content.length, msgB.content.length) /
          Math.max(msgA.content.length, msgB.content.length);

        if (lengthRatio < 1 - config.lengthRatioTolerance) {
          skippedByEarlyExit++;
          continue; // Skip - too different in length
        }

        // Check if messages are duplicates
        const result = this.checkDuplicate(msgA.content, msgB.content, config);

        if (result.isDuplicate) {
          const candidate: DuplicateCandidate = {
            id: `dup_${i}_${j}`,
            primary: {
              id: msgA.id,
              content: msgA.content,
              conversationTitle: msgA.conversationTitle,
              timestamp: msgA.timestamp,
              charCount: msgA.content.length,
              metadata: msgA.metadata,
            },
            duplicate: {
              id: msgB.id,
              content: msgB.content,
              conversationTitle: msgB.conversationTitle,
              timestamp: msgB.timestamp,
              charCount: msgB.content.length,
              metadata: msgB.metadata,
            },
            similarity: result.similarity,
            metrics: result.metrics,
          };

          // Auto-resolve if configured
          if (config.autoApproveExact && result.similarity === 1.0) {
            candidate.decision = 'keep-primary';
          } else if (result.similarity >= config.autoMergeThreshold) {
            candidate.decision = 'merge';
          }

          candidates.push(candidate);
        }
      }
    }

    const skipPct = ((skippedByEarlyExit / totalComparisons) * 100).toFixed(1);
    console.log(
      `[DuplicateDetection] ⚡ Early exit optimization: Skipped ${skippedByEarlyExit.toLocaleString()}/${totalComparisons.toLocaleString()} (${skipPct}%) comparisons`
    );
    console.log(`[DuplicateDetection] ✅ Found ${candidates.length} duplicate candidates`);

    // Group candidates by conversation pairs
    const groups = this.groupCandidates(candidates);

    console.log(`[DuplicateDetection] 📦 Grouped into ${groups.length} duplicate groups`);

    return groups;
  }

  /**
   * Extract all messages from conversations with metadata
   */
  private extractMessages(conversations: NormalizedConversation[]): Array<{
    id: string;
    conversationId: string;
    conversationTitle: string;
    content: string;
    timestamp: number;
    metadata: any;
  }> {
    const messages: Array<{
      id: string;
      conversationId: string;
      conversationTitle: string;
      content: string;
      timestamp: number;
      metadata: any;
    }> = [];

    for (const conv of conversations) {
      for (const msg of conv.messages) {
        // Use database node ID from metadata if available, otherwise generate synthetic ID
        // CRITICAL: dbNodeId must be preserved for edge creation to work
        const messageId = msg.metadata?.dbNodeId || `${conv.conversation_id}_msg_${msg.index}`;

        messages.push({
          id: messageId,
          conversationId: conv.conversation_id,
          conversationTitle: conv.title,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata || {},
        });
      }
    }

    return messages;
  }

  /**
   * Check if two messages are duplicates
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
    // Preprocess content
    let processedA = contentA;
    let processedB = contentB;

    if (config.ignoreWhitespace) {
      processedA = processedA.replace(/\s+/g, ' ').trim();
      processedB = processedB.replace(/\s+/g, ' ').trim();
    }

    if (config.ignoreCase) {
      processedA = processedA.toLowerCase();
      processedB = processedB.toLowerCase();
    }

    // Exact match check
    if (config.exactMatch && processedA === processedB) {
      return {
        isDuplicate: true,
        similarity: 1.0,
        metrics: {
          tokenOverlap: tokenize(processedA).size,
          editDistance: 0,
          lengthRatio: 1.0,
        },
      };
    }

    // Calculate similarity based on algorithm
    let similarity: number;
    let tokenOverlap = 0;
    let editDistance = 0;

    switch (config.algorithm) {
      case 'jaccard':
        const tokensA = config.normalizeTokens
          ? tokenize(normalizeText(processedA))
          : tokenize(processedA);
        const tokensB = config.normalizeTokens
          ? tokenize(normalizeText(processedB))
          : tokenize(processedB);

        similarity = jaccard(tokensA, tokensB);
        tokenOverlap = new Set(Array.from(tokensA).filter((x) => tokensB.has(x))).size;
        break;

      case 'levenshtein':
        editDistance = this.levenshteinDistance(processedA, processedB);
        const maxLen = Math.max(processedA.length, processedB.length);
        similarity = maxLen > 0 ? 1 - editDistance / maxLen : 1.0;
        break;

      case 'cosine':
        similarity = this.cosineSimilarity(processedA, processedB);
        break;

      case 'embedding':
        // TODO(enhancement): Optional ML-based similarity using embeddings
        // This is a future enhancement, not a bug. Jaccard fallback is intentional and acceptable.
        // Related: apps/api/src/services/embeddings.ts (would need creation)
        // Requires: sentence-transformers or OpenAI embeddings integration
        // Current: Falls back to Jaccard similarity (works well for most use cases)
        const tokensAFallback = tokenize(processedA);
        const tokensBFallback = tokenize(processedB);
        similarity = jaccard(tokensAFallback, tokensBFallback);
        break;

      default:
        similarity = 0;
    }

    // Calculate length ratio
    const lengthRatio =
      Math.min(processedA.length, processedB.length) /
      Math.max(processedA.length, processedB.length);

    // Check if duplicate based on thresholds
    const meetsLengthRatio = lengthRatio >= 1 - config.lengthRatioTolerance;
    const meetsTokenOverlap = tokenOverlap >= config.minTokenOverlap;
    const meetsSimilarity = similarity >= config.similarityThreshold;

    const isDuplicate = meetsSimilarity && meetsLengthRatio && meetsTokenOverlap;

    return {
      isDuplicate,
      similarity,
      metrics: {
        tokenOverlap,
        editDistance,
        lengthRatio,
      },
    };
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1, // deletion
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Calculate cosine similarity between two strings (using word vectors)
   */
  private cosineSimilarity(a: string, b: string): number {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);

    // Build vocabulary
    const vocab = new Set([...Array.from(tokensA), ...Array.from(tokensB)]);

    // Create frequency vectors
    const vectorA: number[] = [];
    const vectorB: number[] = [];

    for (const word of Array.from(vocab)) {
      vectorA.push(tokensA.has(word) ? 1 : 0);
      vectorB.push(tokensB.has(word) ? 1 : 0);
    }

    // Calculate dot product
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
    }

    // Calculate magnitudes
    const magnitudeA = Math.sqrt(vectorA.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(vectorB.reduce((sum, val) => sum + val * val, 0));

    // Calculate cosine similarity
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Group duplicate candidates by conversation pairs
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
}
