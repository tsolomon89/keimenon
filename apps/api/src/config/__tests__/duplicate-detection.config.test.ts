/**
 * Unit Tests: Duplicate Detection Configuration Module
 *
 * Tests environment variable parsing, defaults, and validation
 * for the FTS5 duplicate detection configuration system.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import {
  getFTS5Config,
  getDuplicateDetectionStrategy,
  getDuplicateDetectionLoggingConfig,
  getDuplicateDetectionPerformanceThresholds,
} from '../duplicate-detection.config';

describe('Duplicate Detection Configuration', () => {
  // Store original env values
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original environment variables
    const envKeys = [
      'ENABLE_FTS5_DUPLICATE_DETECTION',
      'DUPLICATE_DETECTION_STRATEGY',
      'FTS5_CANDIDATE_LIMIT',
      'FTS5_MIN_RANK_THRESHOLD',
      'FTS5_USE_CONTENT_HASH',
      'DUPLICATE_DETECTION_LOGGING_ENABLED',
      'DUPLICATE_DETECTION_LOG_PERFORMANCE_METRICS',
      'DUPLICATE_DETECTION_LOG_FALLBACK_EVENTS',
      'DUPLICATE_DETECTION_MAX_DURATION_MS',
      'DUPLICATE_DETECTION_MAX_COMPARISONS',
      'DUPLICATE_DETECTION_TARGET_SPEEDUP',
    ];

    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('getFTS5Config()', () => {
    it('should return default FTS5 configuration', () => {
      const config = getFTS5Config();

      assert.strictEqual(config.enabled, true, 'FTS5 should be enabled by default');
      assert.strictEqual(config.candidateLimit, 100, 'Default candidate limit should be 100');
      assert.strictEqual(config.minRankThreshold, -10.0, 'Default rank threshold should be -10.0');
      assert.strictEqual(config.useContentHash, true, 'Content hash should be used by default');
    });

    it('should parse ENABLE_FTS5_DUPLICATE_DETECTION=false', () => {
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'false';
      const config = getFTS5Config();

      assert.strictEqual(config.enabled, false, 'FTS5 should be disabled');
    });

    it('should parse ENABLE_FTS5_DUPLICATE_DETECTION=true', () => {
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'true';
      const config = getFTS5Config();

      assert.strictEqual(config.enabled, true, 'FTS5 should be enabled');
    });

    it('should parse custom FTS5_CANDIDATE_LIMIT', () => {
      process.env.FTS5_CANDIDATE_LIMIT = '250';
      const config = getFTS5Config();

      assert.strictEqual(config.candidateLimit, 250, 'Candidate limit should be 250');
    });

    it('should parse custom FTS5_MIN_RANK_THRESHOLD', () => {
      process.env.FTS5_MIN_RANK_THRESHOLD = '-5.5';
      const config = getFTS5Config();

      assert.strictEqual(config.minRankThreshold, -5.5, 'Rank threshold should be -5.5');
    });

    it('should parse FTS5_USE_CONTENT_HASH=false', () => {
      process.env.FTS5_USE_CONTENT_HASH = 'false';
      const config = getFTS5Config();

      assert.strictEqual(config.useContentHash, false, 'Content hash should be disabled');
    });

    it('should handle invalid numeric values gracefully', () => {
      process.env.FTS5_CANDIDATE_LIMIT = 'invalid';
      const config = getFTS5Config();

      // parseInt('invalid', 10) returns NaN, which becomes 0 in strict equality
      assert.ok(isNaN(config.candidateLimit), 'Invalid numeric value should result in NaN');
    });

    it('should parse all custom FTS5 configuration together', () => {
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'false';
      process.env.FTS5_CANDIDATE_LIMIT = '500';
      process.env.FTS5_MIN_RANK_THRESHOLD = '-15.0';
      process.env.FTS5_USE_CONTENT_HASH = 'false';

      const config = getFTS5Config();

      assert.strictEqual(config.enabled, false);
      assert.strictEqual(config.candidateLimit, 500);
      assert.strictEqual(config.minRankThreshold, -15.0);
      assert.strictEqual(config.useContentHash, false);
    });
  });

  describe('getDuplicateDetectionStrategy()', () => {
    it('should return "auto" by default', () => {
      const strategy = getDuplicateDetectionStrategy();
      assert.strictEqual(strategy, 'auto', 'Default strategy should be "auto"');
    });

    it('should return "fts5" when DUPLICATE_DETECTION_STRATEGY=fts5', () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'fts5';
      const strategy = getDuplicateDetectionStrategy();
      assert.strictEqual(strategy, 'fts5');
    });

    it('should return "baseline" when DUPLICATE_DETECTION_STRATEGY=baseline', () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'baseline';
      const strategy = getDuplicateDetectionStrategy();
      assert.strictEqual(strategy, 'baseline');
    });

    it('should return "auto" when DUPLICATE_DETECTION_STRATEGY=auto', () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'auto';
      const strategy = getDuplicateDetectionStrategy();
      assert.strictEqual(strategy, 'auto');
    });

    it('should return "auto" for invalid strategy values', () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'invalid';
      const strategy = getDuplicateDetectionStrategy();
      assert.strictEqual(strategy, 'auto', 'Invalid strategy should fallback to "auto"');
    });

    it('should return "auto" for empty strategy value', () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = '';
      const strategy = getDuplicateDetectionStrategy();
      assert.strictEqual(strategy, 'auto', 'Empty strategy should fallback to "auto"');
    });
  });

  describe('getDuplicateDetectionLoggingConfig()', () => {
    it('should return default logging configuration', () => {
      const config = getDuplicateDetectionLoggingConfig();

      assert.strictEqual(config.enabled, true, 'Logging should be enabled by default');
      assert.strictEqual(config.logPerformanceMetrics, true, 'Performance metrics logging should be enabled');
      assert.strictEqual(config.logFallbackEvents, true, 'Fallback events logging should be enabled');
    });

    it('should parse DUPLICATE_DETECTION_LOGGING_ENABLED=false', () => {
      process.env.DUPLICATE_DETECTION_LOGGING_ENABLED = 'false';
      const config = getDuplicateDetectionLoggingConfig();

      assert.strictEqual(config.enabled, false, 'Logging should be disabled');
    });

    it('should parse DUPLICATE_DETECTION_LOG_PERFORMANCE_METRICS=false', () => {
      process.env.DUPLICATE_DETECTION_LOG_PERFORMANCE_METRICS = 'false';
      const config = getDuplicateDetectionLoggingConfig();

      assert.strictEqual(config.logPerformanceMetrics, false, 'Performance metrics logging should be disabled');
    });

    it('should parse DUPLICATE_DETECTION_LOG_FALLBACK_EVENTS=false', () => {
      process.env.DUPLICATE_DETECTION_LOG_FALLBACK_EVENTS = 'false';
      const config = getDuplicateDetectionLoggingConfig();

      assert.strictEqual(config.logFallbackEvents, false, 'Fallback events logging should be disabled');
    });

    it('should parse all logging configuration together', () => {
      process.env.DUPLICATE_DETECTION_LOGGING_ENABLED = 'false';
      process.env.DUPLICATE_DETECTION_LOG_PERFORMANCE_METRICS = 'false';
      process.env.DUPLICATE_DETECTION_LOG_FALLBACK_EVENTS = 'false';

      const config = getDuplicateDetectionLoggingConfig();

      assert.strictEqual(config.enabled, false);
      assert.strictEqual(config.logPerformanceMetrics, false);
      assert.strictEqual(config.logFallbackEvents, false);
    });
  });

  describe('getDuplicateDetectionPerformanceThresholds()', () => {
    it('should return default performance thresholds', () => {
      const thresholds = getDuplicateDetectionPerformanceThresholds();

      assert.strictEqual(thresholds.maxDurationMs, 10000, 'Default max duration should be 10000ms');
      assert.strictEqual(thresholds.maxComparisons, 50000, 'Default max comparisons should be 50000');
      assert.strictEqual(thresholds.targetSpeedup, 10.0, 'Default target speedup should be 10.0x');
    });

    it('should parse custom DUPLICATE_DETECTION_MAX_DURATION_MS', () => {
      process.env.DUPLICATE_DETECTION_MAX_DURATION_MS = '5000';
      const thresholds = getDuplicateDetectionPerformanceThresholds();

      assert.strictEqual(thresholds.maxDurationMs, 5000, 'Max duration should be 5000ms');
    });

    it('should parse custom DUPLICATE_DETECTION_MAX_COMPARISONS', () => {
      process.env.DUPLICATE_DETECTION_MAX_COMPARISONS = '100000';
      const thresholds = getDuplicateDetectionPerformanceThresholds();

      assert.strictEqual(thresholds.maxComparisons, 100000, 'Max comparisons should be 100000');
    });

    it('should parse custom DUPLICATE_DETECTION_TARGET_SPEEDUP', () => {
      process.env.DUPLICATE_DETECTION_TARGET_SPEEDUP = '20.5';
      const thresholds = getDuplicateDetectionPerformanceThresholds();

      assert.strictEqual(thresholds.targetSpeedup, 20.5, 'Target speedup should be 20.5x');
    });

    it('should parse all performance thresholds together', () => {
      process.env.DUPLICATE_DETECTION_MAX_DURATION_MS = '15000';
      process.env.DUPLICATE_DETECTION_MAX_COMPARISONS = '75000';
      process.env.DUPLICATE_DETECTION_TARGET_SPEEDUP = '15.0';

      const thresholds = getDuplicateDetectionPerformanceThresholds();

      assert.strictEqual(thresholds.maxDurationMs, 15000);
      assert.strictEqual(thresholds.maxComparisons, 75000);
      assert.strictEqual(thresholds.targetSpeedup, 15.0);
    });

    it('should handle invalid numeric threshold values gracefully', () => {
      process.env.DUPLICATE_DETECTION_MAX_DURATION_MS = 'invalid';
      const thresholds = getDuplicateDetectionPerformanceThresholds();

      assert.ok(isNaN(thresholds.maxDurationMs), 'Invalid duration should result in NaN');
    });
  });

  describe('Configuration Integration', () => {
    it('should allow full configuration via environment variables', () => {
      // Set all environment variables
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'true';
      process.env.DUPLICATE_DETECTION_STRATEGY = 'fts5';
      process.env.FTS5_CANDIDATE_LIMIT = '200';
      process.env.FTS5_MIN_RANK_THRESHOLD = '-8.0';
      process.env.FTS5_USE_CONTENT_HASH = 'true';
      process.env.DUPLICATE_DETECTION_LOGGING_ENABLED = 'true';
      process.env.DUPLICATE_DETECTION_LOG_PERFORMANCE_METRICS = 'true';
      process.env.DUPLICATE_DETECTION_LOG_FALLBACK_EVENTS = 'true';
      process.env.DUPLICATE_DETECTION_MAX_DURATION_MS = '8000';
      process.env.DUPLICATE_DETECTION_MAX_COMPARISONS = '60000';
      process.env.DUPLICATE_DETECTION_TARGET_SPEEDUP = '12.0';

      const fts5Config = getFTS5Config();
      const strategy = getDuplicateDetectionStrategy();
      const loggingConfig = getDuplicateDetectionLoggingConfig();
      const thresholds = getDuplicateDetectionPerformanceThresholds();

      // Verify all configurations
      assert.strictEqual(fts5Config.enabled, true);
      assert.strictEqual(fts5Config.candidateLimit, 200);
      assert.strictEqual(fts5Config.minRankThreshold, -8.0);
      assert.strictEqual(fts5Config.useContentHash, true);

      assert.strictEqual(strategy, 'fts5');

      assert.strictEqual(loggingConfig.enabled, true);
      assert.strictEqual(loggingConfig.logPerformanceMetrics, true);
      assert.strictEqual(loggingConfig.logFallbackEvents, true);

      assert.strictEqual(thresholds.maxDurationMs, 8000);
      assert.strictEqual(thresholds.maxComparisons, 60000);
      assert.strictEqual(thresholds.targetSpeedup, 12.0);
    });

    it('should use defaults when no environment variables are set', () => {
      // Ensure all env vars are cleared (already done in beforeEach)
      const fts5Config = getFTS5Config();
      const strategy = getDuplicateDetectionStrategy();
      const loggingConfig = getDuplicateDetectionLoggingConfig();
      const thresholds = getDuplicateDetectionPerformanceThresholds();

      // Verify all defaults
      assert.strictEqual(fts5Config.enabled, true);
      assert.strictEqual(fts5Config.candidateLimit, 100);
      assert.strictEqual(fts5Config.minRankThreshold, -10.0);
      assert.strictEqual(fts5Config.useContentHash, true);

      assert.strictEqual(strategy, 'auto');

      assert.strictEqual(loggingConfig.enabled, true);
      assert.strictEqual(loggingConfig.logPerformanceMetrics, true);
      assert.strictEqual(loggingConfig.logFallbackEvents, true);

      assert.strictEqual(thresholds.maxDurationMs, 10000);
      assert.strictEqual(thresholds.maxComparisons, 50000);
      assert.strictEqual(thresholds.targetSpeedup, 10.0);
    });
  });
});
