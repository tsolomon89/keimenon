/**
 * Unit Tests: Integrated Duplicate Detection Service
 *
 * Tests the orchestration layer that automatically selects between
 * FTS5 and baseline duplicate detection strategies.
 */

import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import * as assert from 'node:assert';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import {
  IntegratedDuplicateDetectionService,
  type DuplicateDetectionResult,
} from '../duplicate-detection-integrated';
import type { MessageWithMetadata } from '../duplicate-detection-fts5';
import type { DuplicateDetectionConfig } from '../duplicate-detection';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('IntegratedDuplicateDetectionService', () => {
  let db: Database.Database;
  let testDbPath: string;
  let service: IntegratedDuplicateDetectionService;

  // Store original env
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    // Create fresh test database
    testDbPath = path.join(__dirname, `test-integrated-${Date.now()}.db`);
    db = new Database(testDbPath);

    // Save original environment variables
    const envKeys = [
      'ENABLE_FTS5_DUPLICATE_DETECTION',
      'ENABLE_LSH_DUPLICATE_DETECTION',
      'DUPLICATE_DETECTION_STRATEGY',
      'DUPLICATE_DETECTION_LOGGING_ENABLED',
      'DUPLICATE_DETECTION_LOG_PERFORMANCE_METRICS',
      'DUPLICATE_DETECTION_LOG_FALLBACK_EVENTS',
    ];

    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
    }

    // Apply base schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        account_id TEXT NOT NULL,
        canonical_content TEXT,
        content_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Apply FTS5 migration
    const migrationPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'packages',
      'db',
      'src',
      'sqlite',
      'migrations',
      '022_add_fts5_duplicate_detection.sql'
    );
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');
    db.exec(migrationSql);

    // Create service
    service = new IntegratedDuplicateDetectionService(db);
  });

  afterEach(async () => {
    // Restore environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    // Close and clean up
    if (db) {
      db.close();
    }
    if (testDbPath) {
      try {
        await fs.unlink(testDbPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Strategy Selection', () => {
    it('should use FTS5 strategy when available and enabled (auto mode)', async () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'auto';
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'true';
      process.env.ENABLE_LSH_DUPLICATE_DETECTION = 'false';

      const service = new IntegratedDuplicateDetectionService(db);
      const accountId = `acc_${nanoid()}`;

      const messages: MessageWithMetadata[] = [
        {
          id: `msg_1_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test Conversation',
          content: 'Test message',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      assert.strictEqual(result.metadata.strategy, 'fts5', 'Should use FTS5 strategy');
      assert.strictEqual(result.metadata.fts5Available, true, 'FTS5 should be available');
      assert.strictEqual(result.metadata.fts5Enabled, true, 'FTS5 should be enabled');
    });

    it('should use baseline strategy when FTS5 disabled', async () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'auto';
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'false';
      process.env.ENABLE_LSH_DUPLICATE_DETECTION = 'false';

      const service = new IntegratedDuplicateDetectionService(db);
      const accountId = `acc_${nanoid()}`;

      const messages: MessageWithMetadata[] = [
        {
          id: `msg_1_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test',
          content: 'Test message',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      assert.strictEqual(result.metadata.strategy, 'baseline', 'Should use baseline strategy');
      assert.strictEqual(result.metadata.fts5Enabled, false, 'FTS5 should be disabled');
    });

    it('should force FTS5 strategy when explicitly configured', async () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'fts5';
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'true';

      const service = new IntegratedDuplicateDetectionService(db);
      const accountId = `acc_${nanoid()}`;

      const messages: MessageWithMetadata[] = [
        {
          id: `msg_1_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test',
          content: 'Test message',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      assert.strictEqual(result.metadata.strategy, 'fts5', 'Should force FTS5 strategy');
    });

    it('should force baseline strategy when explicitly configured', async () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'baseline';

      const service = new IntegratedDuplicateDetectionService(db);
      const accountId = `acc_${nanoid()}`;

      const messages: MessageWithMetadata[] = [
        {
          id: `msg_1_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test',
          content: 'Test message',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      assert.strictEqual(result.metadata.strategy, 'baseline', 'Should force baseline strategy');
    });
  });

  describe('Performance Monitoring', () => {
    it('should return performance metadata', async () => {
      const accountId = `acc_${nanoid()}`;

      const messages: MessageWithMetadata[] = [
        {
          id: `msg_1_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test',
          content: 'Test message one',
          timestamp: Date.now(),
          metadata: {},
        },
        {
          id: `msg_2_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test',
          content: 'Test message two',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      // Verify metadata structure
      assert.ok(result.metadata, 'Should have metadata');
      assert.ok(typeof result.metadata.strategy === 'string', 'Should have strategy');
      assert.ok(typeof result.metadata.duration === 'number', 'Should have duration');
      assert.ok(
        typeof result.metadata.messagesProcessed === 'number',
        'Should have messages processed'
      );
      assert.ok(
        typeof result.metadata.comparisonsPerformed === 'number',
        'Should have comparisons'
      );
      assert.ok(typeof result.metadata.speedupVsBaseline === 'number', 'Should have speedup');
      assert.ok(
        typeof result.metadata.fts5Available === 'boolean',
        'Should have FTS5 availability'
      );
      assert.ok(
        typeof result.metadata.fts5Enabled === 'boolean',
        'Should have FTS5 enabled status'
      );

      // Verify values
      assert.strictEqual(result.metadata.messagesProcessed, 2, 'Should process 2 messages');
      assert.ok(result.metadata.duration >= 0, 'Duration should be non-negative');
    });

    it('should calculate speedup correctly for FTS5', async () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'fts5';
      process.env.ENABLE_FTS5_DUPLICATE_DETECTION = 'true';

      const service = new IntegratedDuplicateDetectionService(db);
      const accountId = `acc_${nanoid()}`;

      // Create 10 messages
      const messages: MessageWithMetadata[] = Array.from({ length: 10 }, (_, i) => ({
        id: `msg_${i}_${nanoid()}`,
        conversationId: 'conv_1',
        conversationTitle: 'Test',
        content: `Test message ${i}`,
        timestamp: Date.now(),
        metadata: {},
      }));

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      // Baseline comparisons for 10 messages = 10 * 9 / 2 = 45
      // With FTS5 candidate limit of 100 (default), max comparisons = 10 * 100 = 1000
      // But since we only have 10 messages, effective max is still 45
      // So speedup should be close to 1.0 for small datasets
      assert.ok(result.metadata.speedupVsBaseline >= 1.0, 'Speedup should be at least 1.0');
    });

    it('should calculate baseline comparisons correctly', async () => {
      process.env.DUPLICATE_DETECTION_STRATEGY = 'baseline';

      const service = new IntegratedDuplicateDetectionService(db);
      const accountId = `acc_${nanoid()}`;

      const messages: MessageWithMetadata[] = Array.from({ length: 5 }, (_, i) => ({
        id: `msg_${i}_${nanoid()}`,
        conversationId: 'conv_1',
        conversationTitle: 'Test',
        content: `Message ${i}`,
        timestamp: Date.now(),
        metadata: {},
      }));

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      // Baseline for 5 messages = 5 * 4 / 2 = 10
      assert.strictEqual(result.metadata.comparisonsPerformed, 10, 'Should perform 10 comparisons');
      assert.strictEqual(result.metadata.speedupVsBaseline, 1.0, 'Baseline speedup should be 1.0');
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should require accountId parameter', async () => {
      const messages: MessageWithMetadata[] = [
        {
          id: `msg_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test',
          content: 'Test message',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      await assert.rejects(
        async () => {
          await service.findDuplicates(messages, config, '');
        },
        /accountId is required/,
        'Should reject empty accountId'
      );
    });

    it('should isolate duplicates by account', async () => {
      // Force baseline strategy for this test since we're not inserting messages into DB
      process.env.DUPLICATE_DETECTION_STRATEGY = 'baseline';
      const service = new IntegratedDuplicateDetectionService(db);

      const accountA = `acc_A_${nanoid()}`;
      const accountB = `acc_B_${nanoid()}`;

      const messagesA: MessageWithMetadata[] = [
        {
          id: `msg_A1_${nanoid()}`,
          conversationId: 'conv_A',
          conversationTitle: 'Account A',
          content: 'Duplicate content',
          timestamp: Date.now(),
          metadata: {},
        },
        {
          id: `msg_A2_${nanoid()}`,
          conversationId: 'conv_A',
          conversationTitle: 'Account A',
          content: 'Duplicate content',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const messagesB: MessageWithMetadata[] = [
        {
          id: `msg_B1_${nanoid()}`,
          conversationId: 'conv_B',
          conversationTitle: 'Account B',
          content: 'Duplicate content',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: true,
        similarityThreshold: 1.0,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      // Find duplicates for Account A
      const resultA = await service.findDuplicates(messagesA, config, accountA);

      // Find duplicates for Account B
      const resultB = await service.findDuplicates(messagesB, config, accountB);

      // Account A should find duplicates (2 identical messages)
      assert.ok(resultA.groups.length > 0, 'Account A should find duplicates');

      // Account B should not find duplicates (only 1 message)
      assert.strictEqual(resultB.groups.length, 0, 'Account B should not find duplicates');
    });
  });

  describe('Health Status', () => {
    it('should return health status with FTS5 information', () => {
      const health = service.getHealthStatus();

      assert.ok(health, 'Should return health status');
      assert.ok(typeof health.fts5Available === 'boolean', 'Should have FTS5 availability');
      assert.ok(typeof health.fts5Enabled === 'boolean', 'Should have FTS5 enabled status');
      assert.ok(typeof health.strategy === 'string', 'Should have strategy');
      assert.ok(health.fts5Stats, 'Should have FTS5 stats');
      assert.ok(health.thresholds, 'Should have thresholds');
    });

    it('should report FTS5 as available after migration', () => {
      const health = service.getHealthStatus();

      assert.strictEqual(health.fts5Available, true, 'FTS5 should be available');
    });

    it('should include performance thresholds in health status', () => {
      const health = service.getHealthStatus();

      assert.ok(health.thresholds.maxDurationMs > 0, 'Should have max duration threshold');
      assert.ok(health.thresholds.maxComparisons > 0, 'Should have max comparisons threshold');
      assert.ok(health.thresholds.targetSpeedup > 0, 'Should have target speedup');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message list', async () => {
      const accountId = `acc_${nanoid()}`;
      const messages: MessageWithMetadata[] = [];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      assert.strictEqual(result.groups.length, 0, 'Should return no groups');
      assert.strictEqual(result.metadata.messagesProcessed, 0, 'Should process 0 messages');
      assert.strictEqual(result.metadata.comparisonsPerformed, 0, 'Should perform 0 comparisons');
    });

    it('should handle single message', async () => {
      const accountId = `acc_${nanoid()}`;
      const messages: MessageWithMetadata[] = [
        {
          id: `msg_${nanoid()}`,
          conversationId: 'conv_1',
          conversationTitle: 'Test',
          content: 'Single message',
          timestamp: Date.now(),
          metadata: {},
        },
      ];

      const config: DuplicateDetectionConfig = {
        enabled: true,
        exactMatch: false,
        similarityThreshold: 0.8,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 2,
        lengthRatioTolerance: 0.3,
        ignoreWhitespace: true,
        ignoreCase: true,
        ignoreTimestamp: false,
        requireReview: false,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      };

      const result = await service.findDuplicates(messages, config, accountId);

      assert.strictEqual(result.groups.length, 0, 'Should return no groups for single message');
      assert.strictEqual(result.metadata.messagesProcessed, 1, 'Should process 1 message');
    });
  });
});
