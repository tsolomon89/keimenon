/**
 * Integrated Duplicate Detection Service
 *
 * Orchestrates duplicate detection using FTS5 optimization when available,
 * with automatic fallback to baseline O(n²) algorithm.
 *
 * **Strategy Selection**:
 * - Auto (default): Use FTS5 if available and enabled, fallback to baseline
 * - FTS5: Always use FTS5 (throws error if unavailable)
 * - Baseline: Always use O(n²) algorithm (ignores FTS5)
 *
 * **Environment Configuration**:
 * - ENABLE_FTS5_DUPLICATE_DETECTION: Enable FTS5 (default: true)
 * - DUPLICATE_DETECTION_STRATEGY: Strategy selection (default: auto)
 * - FTS5_CANDIDATE_LIMIT: Max candidates per message (default: 100)
 *
 * See: apps/api/src/config/duplicate-detection.config.ts
 * See: apps/api/src/services/duplicate-detection-fts5.ts
 * See: apps/api/src/services/duplicate-detection.ts
 */

import type Database from 'better-sqlite3';
import {
  DuplicateDetectionFTS5Service,
  type MessageWithMetadata,
} from './duplicate-detection-fts5';
import {
  DuplicateDetectionService,
  type DuplicateDetectionConfig,
  type DuplicateGroup,
} from './duplicate-detection';
import type { NormalizedConversation, NormalizedMessage } from '@canvas-memory/parsers';
import {
  getFTS5Config,
  getDuplicateDetectionStrategy,
  getDuplicateDetectionLoggingConfig,
  getDuplicateDetectionPerformanceThresholds,
  type DuplicateDetectionStrategy,
} from '../config/duplicate-detection.config';

/**
 * Duplicate detection result with metadata
 */
export interface DuplicateDetectionResult {
  groups: DuplicateGroup[];
  metadata: {
    strategy: 'fts5' | 'baseline';
    duration: number;
    messagesProcessed: number;
    comparisonsPerformed: number;
    speedupVsBaseline: number;
    fts5Available: boolean;
    fts5Enabled: boolean;
  };
}

/**
 * Integrated Duplicate Detection Service
 *
 * Automatically selects optimal strategy (FTS5 vs baseline) based on:
 * - Environment configuration
 * - FTS5 availability in database
 * - Dataset size and characteristics
 */
export class IntegratedDuplicateDetectionService {
  private fts5Service: DuplicateDetectionFTS5Service;
  private baselineService: DuplicateDetectionService;
  private strategy: DuplicateDetectionStrategy;
  private loggingConfig: ReturnType<typeof getDuplicateDetectionLoggingConfig>;
  private thresholds: ReturnType<typeof getDuplicateDetectionPerformanceThresholds>;

  constructor(private db: Database.Database) {
    this.fts5Service = new DuplicateDetectionFTS5Service(db);
    this.baselineService = new DuplicateDetectionService();
    this.strategy = getDuplicateDetectionStrategy();
    this.loggingConfig = getDuplicateDetectionLoggingConfig();
    this.thresholds = getDuplicateDetectionPerformanceThresholds();
  }

  /**
   * Find duplicate messages using optimal strategy
   *
   * @param messages - Messages to check for duplicates
   * @param config - Duplicate detection configuration
   * @param accountId - Account ID for multi-tenant isolation (REQUIRED)
   * @returns Duplicate groups with execution metadata
   */
  async findDuplicates(
    messages: MessageWithMetadata[],
    config: DuplicateDetectionConfig,
    accountId: string
  ): Promise<DuplicateDetectionResult> {
    if (!accountId) {
      throw new Error('accountId is required for multi-tenant isolation');
    }

    // Early return for empty list to avoid division by zero
    if (messages.length === 0) {
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
        },
      };
    }

    const startTime = Date.now();

    // Get FTS5 availability and configuration
    const fts5Config = getFTS5Config();
    const fts5Available = this.isFTS5Available();
    const fts5Enabled = fts5Config.enabled;

    // Determine which strategy to use
    const selectedStrategy = this.selectStrategy(fts5Available, fts5Enabled);

    if (this.loggingConfig.logPerformanceMetrics) {
      console.log(
        `[IntegratedDuplicateDetection] 🎯 Strategy: ${selectedStrategy} (available: ${fts5Available}, enabled: ${fts5Enabled}, messages: ${messages.length})`
      );
    }

    let groups: DuplicateGroup[];
    let comparisonsPerformed: number;

    if (selectedStrategy === 'fts5') {
      // Use FTS5 optimization
      if (this.loggingConfig.logPerformanceMetrics) {
        console.log(
          `[IntegratedDuplicateDetection] 🚀 Using FTS5 optimization (candidate limit: ${fts5Config.candidateLimit})`
        );
      }

      groups = await this.fts5Service.findDuplicates(messages, config, fts5Config, accountId);

      // Estimate comparisons (not exact, but close enough for metrics)
      comparisonsPerformed = Math.min(
        messages.length * fts5Config.candidateLimit,
        (messages.length * (messages.length - 1)) / 2
      );
    } else {
      // Use baseline O(n²) algorithm
      if (this.loggingConfig.logFallbackEvents) {
        console.log(
          `[IntegratedDuplicateDetection] ⚠️  Using baseline O(n²) algorithm (strategy: ${this.strategy}, FTS5 available: ${fts5Available}, enabled: ${fts5Enabled})`
        );
      }

      // Convert MessageWithMetadata[] to NormalizedConversation[] format for baseline service
      const conversations = this.convertToNormalizedConversations(messages);

      // Call baseline service
      groups = await this.baselineService.findDuplicates(conversations, config);
      comparisonsPerformed = (messages.length * (messages.length - 1)) / 2;
    }

    const duration = Date.now() - startTime;
    const baselineComparisons = (messages.length * (messages.length - 1)) / 2;
    const speedup = baselineComparisons > 0 ? baselineComparisons / Math.max(comparisonsPerformed, 1) : 1;

    // Log performance metrics
    if (this.loggingConfig.logPerformanceMetrics) {
      console.log(
        `[IntegratedDuplicateDetection] ⏱️  Duration: ${duration}ms | Speedup: ${speedup.toFixed(1)}x | Groups: ${groups.length}`
      );
    }

    // Check performance thresholds
    this.checkPerformanceThresholds(duration, comparisonsPerformed, speedup);

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
      },
    };
  }

  /**
   * Select optimal duplicate detection strategy
   *
   * @param fts5Available - Is FTS5 table available in database?
   * @param fts5Enabled - Is FTS5 enabled in configuration?
   * @returns Selected strategy ('fts5' or 'baseline')
   */
  private selectStrategy(
    fts5Available: boolean,
    fts5Enabled: boolean
  ): 'fts5' | 'baseline' {
    switch (this.strategy) {
      case 'fts5':
        // Force FTS5 (throw if unavailable)
        if (!fts5Available) {
          throw new Error(
            'FTS5 strategy selected but FTS5 table not available. Run migration 022.'
          );
        }
        if (!fts5Enabled) {
          throw new Error(
            'FTS5 strategy selected but FTS5 is disabled. Set ENABLE_FTS5_DUPLICATE_DETECTION=true'
          );
        }
        return 'fts5';

      case 'baseline':
        // Force baseline (ignore FTS5)
        return 'baseline';

      case 'auto':
      default:
        // Auto-detect: Use FTS5 if available and enabled
        if (fts5Available && fts5Enabled) {
          return 'fts5';
        }

        if (this.loggingConfig.logFallbackEvents) {
          if (!fts5Available) {
            console.warn(
              '[IntegratedDuplicateDetection] ⚠️  FTS5 table not available, falling back to baseline. Run migration 022.'
            );
          } else if (!fts5Enabled) {
            console.warn(
              '[IntegratedDuplicateDetection] ⚠️  FTS5 disabled, using baseline. Set ENABLE_FTS5_DUPLICATE_DETECTION=true to enable.'
            );
          }
        }

        return 'baseline';
    }
  }

  /**
   * Check if FTS5 table is available in database
   *
   * @returns true if FTS5 table exists, false otherwise
   */
  private isFTS5Available(): boolean {
    const stats = this.fts5Service.getStatistics();
    return stats.fts5Available;
  }

  /**
   * Check performance against configured thresholds
   *
   * Logs warnings if performance degrades below acceptable levels.
   *
   * @param duration - Duplicate detection duration in milliseconds
   * @param comparisons - Number of comparisons performed
   * @param speedup - Speedup vs baseline O(n²)
   */
  private checkPerformanceThresholds(
    duration: number,
    comparisons: number,
    speedup: number
  ): void {
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

  /**
   * Convert MessageWithMetadata[] to NormalizedConversation[] format
   *
   * The baseline DuplicateDetectionService expects NormalizedConversation[] format,
   * but the integrated service API uses MessageWithMetadata[] for consistency with FTS5.
   *
   * This method groups messages by conversationId and converts them to the expected format.
   *
   * @param messages - Messages to convert
   * @returns Normalized conversations for baseline service
   */
  private convertToNormalizedConversations(
    messages: MessageWithMetadata[]
  ): NormalizedConversation[] {
    // Group messages by conversationId
    const conversationMap = new Map<string, MessageWithMetadata[]>();

    for (const msg of messages) {
      const convId = msg.conversationId || 'default';
      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, []);
      }
      conversationMap.get(convId)!.push(msg);
    }

    // Convert to NormalizedConversation format
    const conversations: NormalizedConversation[] = [];

    for (const [conversationId, convMessages] of conversationMap.entries()) {
      const conversation: NormalizedConversation = {
        conversation_id: conversationId,
        title: convMessages[0]?.conversationTitle || 'Untitled Conversation',
        create_time: convMessages[0]?.timestamp || Date.now(),
        update_time: Math.max(...convMessages.map(m => m.timestamp || 0)) || Date.now(),
        messages: convMessages.map((msg, index) => ({
          index,
          role: 'user', // Default role (baseline doesn't use role for duplicate detection)
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
          metadata: {
            ...msg.metadata,
            dbNodeId: msg.id, // Preserve node ID for edge creation
          },
        })),
        mapping: {}, // Not used by duplicate detection
      };

      conversations.push(conversation);
    }

    return conversations;
  }

  /**
   * Get health status of duplicate detection system
   *
   * Useful for health check endpoints and debugging.
   */
  getHealthStatus(): {
    fts5Available: boolean;
    fts5Enabled: boolean;
    strategy: DuplicateDetectionStrategy;
    fts5Stats: ReturnType<typeof this.fts5Service.getStatistics>;
    thresholds: ReturnType<typeof getDuplicateDetectionPerformanceThresholds>;
  } {
    return {
      fts5Available: this.isFTS5Available(),
      fts5Enabled: getFTS5Config().enabled,
      strategy: this.strategy,
      fts5Stats: this.fts5Service.getStatistics(),
      thresholds: this.thresholds,
    };
  }
}
