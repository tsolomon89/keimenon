/**
 * Performance Benchmark Suite for Duplicate Detection
 *
 * Purpose: Establish baseline metrics for current O(n²) algorithm before optimization
 *
 * Test Datasets:
 * - 100 messages (small)
 * - 500 messages (medium)
 * - 1,000 messages (large)
 * - 5,000 messages (stress test)
 * - 10,000 messages (extreme stress test)
 *
 * Each dataset has 10% duplicate rate to simulate real-world usage.
 *
 * Metrics tracked:
 * - Execution time (ms)
 * - Throughput (messages/second)
 * - Comparisons performed
 * - Duplicates found
 * - Memory usage
 */

import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { DuplicateDetectionService, DuplicateDetectionConfig } from '../services/duplicate-detection';
import { NormalizedConversation } from '@canvas-memory/parsers';
import { nanoid } from 'nanoid';

// Helper: Generate test conversation with N messages
function generateConversation(
  messageCount: number,
  conversationId: string,
  title: string,
  duplicateRate: number = 0.1
): NormalizedConversation {
  const messages = [];
  const baseTimestamp = Math.floor(Date.now() / 1000);

  // Generate unique messages
  const uniqueCount = Math.floor(messageCount * (1 - duplicateRate));
  for (let i = 0; i < uniqueCount; i++) {
    messages.push({
      role: 'user' as const,
      content: `Unique message ${i} in ${title} - ${nanoid(10)}`,
      timestamp: baseTimestamp + i,
      index: i,
      hash: `hash_${i}`,
      metadata: {
        id: `msg_${conversationId}_${i}`,
      },
    });
  }

  // Generate duplicate messages (copy earlier messages)
  const duplicateCount = messageCount - uniqueCount;
  for (let i = 0; i < duplicateCount; i++) {
    const sourceIndex = Math.floor(Math.random() * uniqueCount);
    messages.push({
      role: 'user' as const,
      content: messages[sourceIndex].content, // Exact duplicate
      timestamp: baseTimestamp + uniqueCount + i,
      index: uniqueCount + i,
      hash: `hash_dup_${i}`,
      metadata: {
        id: `msg_${conversationId}_dup_${i}`,
      },
    });
  }

  return {
    conversation_id: conversationId,
    platform: 'generic',
    title,
    created_at: baseTimestamp,
    messages,
    metadata: {
      source_file: 'benchmark-test',
    },
  };
}

// Helper: Benchmark duplicate detection execution
async function benchmarkDuplicateDetection(
  conversations: NormalizedConversation[],
  config: DuplicateDetectionConfig
): Promise<{
  durationMs: number;
  throughput: number;
  duplicatesFound: number;
  messageCount: number;
  comparisonsEstimate: number;
}> {
  const service = new DuplicateDetectionService();

  const messageCount = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
  const comparisonsEstimate = (messageCount * (messageCount - 1)) / 2; // O(n²)

  const startTime = Date.now();
  const duplicateGroups = await service.findDuplicates(conversations, config);
  const endTime = Date.now();

  const durationMs = endTime - startTime;
  const throughput = messageCount / (durationMs / 1000); // messages per second

  const duplicatesFound = duplicateGroups.reduce(
    (sum, group) => sum + group.totalDuplicates,
    0
  );

  return {
    durationMs,
    throughput,
    duplicatesFound,
    messageCount,
    comparisonsEstimate,
  };
}

describe('Duplicate Detection Performance Benchmark', () => {
  let baseConfig: DuplicateDetectionConfig;

  beforeEach(() => {
    baseConfig = {
      enabled: true,
      exactMatch: true,
      similarityThreshold: 0.85,
      crossConversation: true, // Enable cross-conversation detection
      algorithm: 'jaccard',
      normalizeTokens: true,
      minTokenOverlap: 3,
      lengthRatioTolerance: 0.2,
      ignoreWhitespace: true,
      ignoreCase: true,
      ignoreTimestamp: true,
      requireReview: false,
      autoApproveExact: true,
      autoMergeThreshold: 0.95,
    };
  });

  it('Baseline: 100 messages (Jaccard)', async () => {
    console.log('\n=== Baseline: 100 messages ===');

    const conversations = [
      generateConversation(50, 'conv_1', 'Conversation 1', 0.1),
      generateConversation(50, 'conv_2', 'Conversation 2', 0.1),
    ];

    const result = await benchmarkDuplicateDetection(conversations, baseConfig);

    console.log(`Duration: ${result.durationMs}ms`);
    console.log(`Throughput: ${result.throughput.toFixed(2)} messages/second`);
    console.log(`Duplicates found: ${result.duplicatesFound}`);
    console.log(`Estimated comparisons: ${result.comparisonsEstimate}`);

    assert.ok(result.durationMs > 0, 'Should have measurable duration');
    assert.ok(result.duplicatesFound > 0, 'Should find duplicates (10% rate)');
  }, 30000);

  it('Baseline: 500 messages (Jaccard)', async () => {
    console.log('\n=== Baseline: 500 messages ===');

    const conversations = [
      generateConversation(250, 'conv_1', 'Conversation 1', 0.1),
      generateConversation(250, 'conv_2', 'Conversation 2', 0.1),
    ];

    const result = await benchmarkDuplicateDetection(conversations, baseConfig);

    console.log(`Duration: ${result.durationMs}ms`);
    console.log(`Throughput: ${result.throughput.toFixed(2)} messages/second`);
    console.log(`Duplicates found: ${result.duplicatesFound}`);
    console.log(`Estimated comparisons: ${result.comparisonsEstimate}`);

    assert.ok(result.durationMs > 0, 'Should have measurable duration');
  }, 60000);

  it('Baseline: 1,000 messages (Jaccard)', async () => {
    console.log('\n=== Baseline: 1,000 messages ===');

    const conversations = [
      generateConversation(500, 'conv_1', 'Conversation 1', 0.1),
      generateConversation(500, 'conv_2', 'Conversation 2', 0.1),
    ];

    const result = await benchmarkDuplicateDetection(conversations, baseConfig);

    console.log(`Duration: ${result.durationMs}ms`);
    console.log(`Throughput: ${result.throughput.toFixed(2)} messages/second`);
    console.log(`Duplicates found: ${result.duplicatesFound}`);
    console.log(`Estimated comparisons: ${result.comparisonsEstimate}`);

    assert.ok(result.durationMs > 0, 'Should have measurable duration');
  }, 120000); // 2 minutes timeout

  it('Baseline: 5,000 messages (Jaccard) - STRESS TEST', async () => {
    console.log('\n=== Baseline: 5,000 messages - STRESS TEST ===');
    console.log('WARNING: This will perform ~12.5 million comparisons (O(n²))');

    const conversations = [
      generateConversation(2500, 'conv_1', 'Conversation 1', 0.1),
      generateConversation(2500, 'conv_2', 'Conversation 2', 0.1),
    ];

    const result = await benchmarkDuplicateDetection(conversations, baseConfig);

    console.log(`Duration: ${result.durationMs}ms (${(result.durationMs / 1000).toFixed(2)}s)`);
    console.log(`Throughput: ${result.throughput.toFixed(2)} messages/second`);
    console.log(`Duplicates found: ${result.duplicatesFound}`);
    console.log(`Estimated comparisons: ${result.comparisonsEstimate.toLocaleString()}`);

    assert.ok(result.durationMs > 0, 'Should have measurable duration');

    // This test documents the O(n²) bottleneck
    // Expected: Very slow performance, possible timeout
  }, 300000); // 5 minutes timeout

  it.skip('Baseline: 10,000 messages (Jaccard) - EXTREME STRESS TEST', async () => {
    console.log('\n=== Baseline: 10,000 messages - EXTREME STRESS TEST ===');
    console.log('WARNING: This will perform ~50 million comparisons (O(n²))');
    console.log('SKIPPED: Will likely timeout. Enable after optimization.');

    const conversations = [
      generateConversation(5000, 'conv_1', 'Conversation 1', 0.1),
      generateConversation(5000, 'conv_2', 'Conversation 2', 0.1),
    ];

    const result = await benchmarkDuplicateDetection(conversations, baseConfig);

    console.log(`Duration: ${result.durationMs}ms (${(result.durationMs / 1000 / 60).toFixed(2)}min)`);
    console.log(`Throughput: ${result.throughput.toFixed(2)} messages/second`);
    console.log(`Duplicates found: ${result.duplicatesFound}`);
    console.log(`Estimated comparisons: ${result.comparisonsEstimate.toLocaleString()}`);
  }, 600000); // 10 minutes timeout

  it('Algorithm Comparison: Jaccard vs Levenshtein vs Cosine', async () => {
    console.log('\n=== Algorithm Comparison (500 messages) ===');

    const conversations = [
      generateConversation(250, 'conv_1', 'Conversation 1', 0.1),
      generateConversation(250, 'conv_2', 'Conversation 2', 0.1),
    ];

    // Test Jaccard
    const jaccardConfig = { ...baseConfig, algorithm: 'jaccard' as const };
    const jaccardResult = await benchmarkDuplicateDetection(conversations, jaccardConfig);
    console.log(`\nJaccard: ${jaccardResult.durationMs}ms, ${jaccardResult.throughput.toFixed(2)} msg/s, ${jaccardResult.duplicatesFound} duplicates`);

    // Test Levenshtein
    const levenshteinConfig = { ...baseConfig, algorithm: 'levenshtein' as const };
    const levenshteinResult = await benchmarkDuplicateDetection(conversations, levenshteinConfig);
    console.log(`Levenshtein: ${levenshteinResult.durationMs}ms, ${levenshteinResult.throughput.toFixed(2)} msg/s, ${levenshteinResult.duplicatesFound} duplicates`);

    // Test Cosine
    const cosineConfig = { ...baseConfig, algorithm: 'cosine' as const };
    const cosineResult = await benchmarkDuplicateDetection(conversations, cosineConfig);
    console.log(`Cosine: ${cosineResult.durationMs}ms, ${cosineResult.throughput.toFixed(2)} msg/s, ${cosineResult.duplicatesFound} duplicates`);

    // Analysis
    console.log('\nAlgorithm Comparison:');
    console.log(`Jaccard is baseline`);
    console.log(`Levenshtein is ${(levenshteinResult.durationMs / jaccardResult.durationMs).toFixed(2)}x ${levenshteinResult.durationMs > jaccardResult.durationMs ? 'slower' : 'faster'}`);
    console.log(`Cosine is ${(cosineResult.durationMs / jaccardResult.durationMs).toFixed(2)}x ${cosineResult.durationMs > jaccardResult.durationMs ? 'slower' : 'faster'}`);

    assert.ok(jaccardResult.durationMs > 0, 'Jaccard should complete');
    assert.ok(levenshteinResult.durationMs > 0, 'Levenshtein should complete');
    assert.ok(cosineResult.durationMs > 0, 'Cosine should complete');
  }, 180000); // 3 minutes timeout

  it('Scalability Analysis: O(n²) growth pattern', async () => {
    console.log('\n=== Scalability Analysis: O(n²) Growth Pattern ===');
    console.log('Testing with 100, 200, 400, 800 messages');
    console.log('Expected: 2x messages → ~4x duration (O(n²) signature)\n');

    const results: Array<{ size: number; durationMs: number; comparisons: number }> = [];

    // Test 100 messages
    const conv100 = [generateConversation(100, 'conv_100', 'Conversation 100', 0.1)];
    const result100 = await benchmarkDuplicateDetection(conv100, baseConfig);
    results.push({ size: 100, durationMs: result100.durationMs, comparisons: result100.comparisonsEstimate });
    console.log(`100 messages: ${result100.durationMs}ms, ${result100.comparisonsEstimate} comparisons`);

    // Test 200 messages
    const conv200 = [generateConversation(200, 'conv_200', 'Conversation 200', 0.1)];
    const result200 = await benchmarkDuplicateDetection(conv200, baseConfig);
    results.push({ size: 200, durationMs: result200.durationMs, comparisons: result200.comparisonsEstimate });
    console.log(`200 messages: ${result200.durationMs}ms, ${result200.comparisonsEstimate} comparisons (${(result200.durationMs / result100.durationMs).toFixed(2)}x slower)`);

    // Test 400 messages
    const conv400 = [generateConversation(400, 'conv_400', 'Conversation 400', 0.1)];
    const result400 = await benchmarkDuplicateDetection(conv400, baseConfig);
    results.push({ size: 400, durationMs: result400.durationMs, comparisons: result400.comparisonsEstimate });
    console.log(`400 messages: ${result400.durationMs}ms, ${result400.comparisonsEstimate} comparisons (${(result400.durationMs / result200.durationMs).toFixed(2)}x slower than 200)`);

    // Test 800 messages
    const conv800 = [generateConversation(800, 'conv_800', 'Conversation 800', 0.1)];
    const result800 = await benchmarkDuplicateDetection(conv800, baseConfig);
    results.push({ size: 800, durationMs: result800.durationMs, comparisons: result800.comparisonsEstimate });
    console.log(`800 messages: ${result800.durationMs}ms, ${result800.comparisonsEstimate} comparisons (${(result800.durationMs / result400.durationMs).toFixed(2)}x slower than 400)`);

    // Analysis: Check if growth pattern matches O(n²)
    console.log('\nGrowth Pattern Analysis:');
    console.log('For O(n²) algorithm, 2x size should → ~4x duration');

    const growthRatio200 = result200.durationMs / result100.durationMs;
    const growthRatio400 = result400.durationMs / result200.durationMs;
    const growthRatio800 = result800.durationMs / result400.durationMs;

    console.log(`100→200: ${growthRatio200.toFixed(2)}x (expected ~4x)`);
    console.log(`200→400: ${growthRatio400.toFixed(2)}x (expected ~4x)`);
    console.log(`400→800: ${growthRatio800.toFixed(2)}x (expected ~4x)`);

    // Document findings
    const avgGrowthRatio = (growthRatio200 + growthRatio400 + growthRatio800) / 3;
    console.log(`\nAverage growth ratio: ${avgGrowthRatio.toFixed(2)}x`);
    console.log(`This confirms O(n²) behavior (expected 4x, measured ${avgGrowthRatio.toFixed(2)}x)`);

    assert.ok(avgGrowthRatio > 2.5, 'Should show super-linear growth (O(n²))');
  }, 240000); // 4 minutes timeout
});
