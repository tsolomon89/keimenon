/**
 * Duplicate Detection Configuration
 *
 * Centralized configuration for duplicate detection features including
 * FTS5-based optimization and fallback strategies.
 *
 * Environment Variables:
 * - ENABLE_FTS5_DUPLICATE_DETECTION: Enable FTS5 optimization (default: true)
 * - FTS5_CANDIDATE_LIMIT: Max candidates per message (default: 100)
 * - FTS5_MIN_RANK_THRESHOLD: Minimum FTS5 rank (default: -10.0)
 * - FTS5_USE_CONTENT_HASH: Use exact hash matching first (default: true)
 *
 * See: apps/api/src/services/duplicate-detection-fts5.ts
 * See: docs/architecture/DUPLICATE_DETECTION_FTS5.md
 */

import type { FTS5Config } from '../services/duplicate-detection-fts5';

/**
 * FTS5 duplicate detection configuration from environment
 */
export function getFTS5Config(): FTS5Config {
  return {
    enabled: process.env.ENABLE_FTS5_DUPLICATE_DETECTION !== 'false', // Default: true
    candidateLimit: parseInt(process.env.FTS5_CANDIDATE_LIMIT || '100', 10),
    minRankThreshold: parseFloat(process.env.FTS5_MIN_RANK_THRESHOLD || '-10.0'),
    useContentHash: process.env.FTS5_USE_CONTENT_HASH !== 'false', // Default: true
  };
}

export interface LSHConfig {
  enabled: boolean;
  permutations: number;
  bands: number;
  rows: number;
  threshold: number;
}

export function getLSHConfig(): LSHConfig {
  return {
    enabled: process.env.ENABLE_LSH_DUPLICATE_DETECTION !== 'false', // Default: true
    permutations: parseInt(process.env.LSH_PERMUTATIONS || '128', 10),
    bands: parseInt(process.env.LSH_BANDS || '16', 10),
    rows: parseInt(process.env.LSH_ROWS || '8', 10),
    threshold: parseFloat(process.env.LSH_SIMILARITY_THRESHOLD || '0.7'),
  };
}

/**
 * Feature flag: Is FTS5 duplicate detection enabled?
 *
 * @returns true if FTS5 optimization is enabled, false otherwise
 */
export function isFTS5Enabled(): boolean {
  return getFTS5Config().enabled;
}

/**
 * Duplicate detection strategy selection
 */
export type DuplicateDetectionStrategy = 'fts5' | 'baseline' | 'lsh' | 'embeddings' | 'auto';

/**
 * Get the active duplicate detection strategy
 *
 * Strategies:
 * - 'fts5': Always use FTS5 (fails if FTS5 unavailable)
 * - 'baseline': Always use O(n²) baseline algorithm
 * - 'auto': Use FTS5 if available, fallback to baseline (default)
 *
 * @returns Strategy based on environment configuration
 */
export function getDuplicateDetectionStrategy(): DuplicateDetectionStrategy {
  const strategy = process.env.DUPLICATE_DETECTION_STRATEGY as DuplicateDetectionStrategy;

  if (
    strategy === 'fts5' ||
    strategy === 'baseline' ||
    strategy === 'lsh' ||
    strategy === 'embeddings' ||
    strategy === 'auto'
  ) {
    return strategy;
  }

  return 'auto'; // Default: auto-detect and fallback
}

export function isEmbeddingsStrategyEnabled(): boolean {
  return process.env.DEDUP_EMBEDDINGS_ENABLED === 'true';
}

/**
 * Logging configuration for duplicate detection
 */
export interface DuplicateDetectionLoggingConfig {
  enabled: boolean; // Master switch for all duplicate detection logging
  logPerformanceMetrics: boolean;
  logFallbackEvents: boolean;
}

/**
 * Get logging configuration for duplicate detection
 */
export function getDuplicateDetectionLoggingConfig(): DuplicateDetectionLoggingConfig {
  return {
    enabled: process.env.DUPLICATE_DETECTION_LOGGING_ENABLED !== 'false', // Default: true
    logPerformanceMetrics: process.env.DUPLICATE_DETECTION_LOG_PERFORMANCE_METRICS !== 'false', // Default: true
    logFallbackEvents: process.env.DUPLICATE_DETECTION_LOG_FALLBACK_EVENTS !== 'false', // Default: true
  };
}

/**
 * Performance thresholds for monitoring/alerting
 */
export interface DuplicateDetectionPerformanceThresholds {
  maxDurationMs: number; // Alert if duplicate detection takes longer than this
  maxComparisons: number; // Alert if comparisons exceed this threshold
  targetSpeedup: number; // Expected speedup vs O(n²) baseline
}

/**
 * Get performance thresholds for duplicate detection monitoring
 */
export function getDuplicateDetectionPerformanceThresholds(): DuplicateDetectionPerformanceThresholds {
  return {
    maxDurationMs: parseInt(process.env.DUPLICATE_DETECTION_MAX_DURATION_MS || '10000', 10), // 10 seconds
    maxComparisons: parseInt(process.env.DUPLICATE_DETECTION_MAX_COMPARISONS || '50000', 10), // 50k comparisons
    targetSpeedup: parseFloat(process.env.DUPLICATE_DETECTION_TARGET_SPEEDUP || '10.0'), // 10x speedup target
  };
}

/**
 * Validate FTS5 configuration
 *
 * Checks that configuration values are within acceptable ranges.
 *
 * @throws Error if configuration is invalid
 */
export function validateFTS5Config(config: FTS5Config): void {
  if (config.candidateLimit <= 0) {
    throw new Error(`Invalid FTS5 candidate limit: ${config.candidateLimit}. Must be > 0.`);
  }

  if (config.candidateLimit > 1000) {
    console.warn(
      `[DuplicateDetectionConfig] ⚠️  High candidate limit (${config.candidateLimit}) may reduce FTS5 performance benefits`
    );
  }

  if (config.minRankThreshold > 0) {
    console.warn(
      `[DuplicateDetectionConfig] ⚠️  Positive rank threshold (${config.minRankThreshold}) may exclude valid candidates`
    );
  }
}

/**
 * Get complete duplicate detection configuration summary
 *
 * Useful for debugging and health checks.
 */
export function getDuplicateDetectionConfigSummary(): {
  fts5: FTS5Config;
  strategy: DuplicateDetectionStrategy;
  logging: DuplicateDetectionLoggingConfig;
  thresholds: DuplicateDetectionPerformanceThresholds;
} {
  const fts5Config = getFTS5Config();
  validateFTS5Config(fts5Config);

  return {
    fts5: fts5Config,
    strategy: getDuplicateDetectionStrategy(),
    logging: getDuplicateDetectionLoggingConfig(),
    thresholds: getDuplicateDetectionPerformanceThresholds(),
  };
}
