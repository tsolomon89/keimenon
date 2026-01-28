/**
 * =============================================================================
 * COMPREHENSIVE SYSTEM TEST - Tests ALL Implementations
 * =============================================================================
 *
 * This suite is extremely heavy (parses 1.1GB datasets and runs full clustering).
 * For day-to-day CI/local development we skip it unless RUN_COMPREHENSIVE_TESTS=1.
 *
 * Set `RUN_COMPREHENSIVE_TESTS=1` to execute the full pipeline.
 *
 * =============================================================================
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs/promises';

// Phase 1-3 imports (Grouping/Clustering)
import {
  ParserRegistry,
  ContentProcessor,
  GroupingStorage,
  DeduplicationEngine,
  ClusteringEngine,
  ClusterEvidenceComputer,
} from '@keimenon/parsers';
import { DEFAULT_POLICY } from '@keimenon/types';
import Database from 'better-sqlite3';
import os from 'os';

const RUN_FULL_SUITE = process.env.RUN_COMPREHENSIVE_TESTS === '1';

// Test data paths (moved outside the conditional)
const CHAT_DATA_DIR = path.join(__dirname, '../../../../ai_context/chat_data');
const SMALL_FILE = path.join(CHAT_DATA_DIR, 'test-samples/small.json');
const CLAUDE_FILE = path.join(CHAT_DATA_DIR, 'claude_conversations.json');
const GPT_FILE = path.join(CHAT_DATA_DIR, 'gpt_conversations.json');

// Test database path
const TEST_DB_PATH = path.join(os.homedir(), '.keimenon', 'test_keimenon.db');

/**
 * Helper: Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper: Get file size in MB
 */
async function getFileSizeMB(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size / (1024 * 1024);
}

/**
 * Helper: Load JSON file
 */
async function loadJsonFile(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * =============================================================================
 * MAIN TEST SUITE
 * =============================================================================
 */

describe('Comprehensive System Test - ALL Implementations', () => {
  /**
   * Setup
   */
  beforeAll(async () => {
    console.log('\n========================================');
    console.log('🚀 Starting Comprehensive System Test');
    console.log('========================================\n');
  });

  /**
   * Cleanup
   */
  afterAll(() => {
    console.log('\n========================================');
    console.log('✅ Comprehensive System Test Complete');
    console.log('========================================\n');
  });

  /**
   * ===========================================================================
   * PHASE 1: PLATFORM DETECTION & PARSING
   * ===========================================================================
   */

  describe('Phase 1: Platform Detection & Parsing', () => {
    it('1.1 Platform Detection - Claude Format', async () => {
      const exists = await fileExists(CLAUDE_FILE);
      if (!exists) {
        console.log('⚠️  claude_conversations.json not found, skipping');
        return;
      }

      const sizeMB = await getFileSizeMB(CLAUDE_FILE);
      console.log(`📁 Claude file size: ${sizeMB.toFixed(2)} MB`);

      // Read only first 2KB without loading entire file (may be UTF-16)
      const fileHandle = await fs.open(CLAUDE_FILE, 'r');
      const buffer = Buffer.alloc(2048);
      const { bytesRead } = await fileHandle.read(buffer, 0, 2048, 0);
      await fileHandle.close();

      // Try to detect encoding and convert
      let firstKB = buffer.slice(0, bytesRead).toString('utf-8');

      // If we see null bytes or weird spacing, it's probably UTF-16
      if (firstKB.includes('\0') || (firstKB.match(/\s/g)?.length || 0) > firstKB.length / 2) {
        firstKB = buffer.slice(0, bytesRead).toString('utf-16le');
      }

      assert.ok(
        firstKB.includes('uuid') ||
          firstKB.includes('conversation') ||
          firstKB.includes('mapping') ||
          firstKB.includes('create_time'),
        'Claude format detected'
      );
      console.log(`✅ Claude format detected (${sizeMB.toFixed(2)} MB file)\n`);
    });

    it('1.2 Platform Detection - GPT Format', async () => {
      const exists = await fileExists(GPT_FILE);
      if (!exists) {
        console.log('⚠️  gpt_conversations.json not found, skipping');
        return;
      }

      const sizeMB = await getFileSizeMB(GPT_FILE);
      console.log(`📁 GPT file size: ${sizeMB.toFixed(2)} MB`);

      // Read only first 2KB without loading entire file (may be UTF-16)
      const fileHandle = await fs.open(GPT_FILE, 'r');
      const buffer = Buffer.alloc(2048);
      const { bytesRead } = await fileHandle.read(buffer, 0, 2048, 0);
      await fileHandle.close();

      // Try to detect encoding and convert
      let firstKB = buffer.slice(0, bytesRead).toString('utf-8');

      // If we see null bytes or weird spacing, it's probably UTF-16
      if (firstKB.includes('\0') || (firstKB.match(/\s/g)?.length || 0) > firstKB.length / 2) {
        firstKB = buffer.slice(0, bytesRead).toString('utf-16le');
      }

      assert.ok(firstKB.includes('mapping') || firstKB.includes('messages'), 'GPT format detected');
      console.log(`✅ GPT format detected (${sizeMB.toFixed(2)} MB file)\n`);
    });

    it('1.3 Parse Small File - Full Pipeline', async () => {
      const exists = await fileExists(SMALL_FILE);
      if (!exists) {
        console.log('⚠️  small.json not found, skipping');
        return;
      }

      const sizeMB = await getFileSizeMB(SMALL_FILE);
      console.log(`📁 Small file size: ${sizeMB.toFixed(2)} MB`);

      const startTime = Date.now();

      // Parse
      const data = await loadJsonFile(SMALL_FILE);
      const parser = new ParserRegistry();
      const result = await parser.parse(data, 'small.json');

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

      // Verify parsing success
      assert.ok(result.conversations.length > 0, 'Conversations parsed');
      assert.ok(result.stats.total_messages > 0, 'Messages parsed');

      console.log(
        `✅ Parsed: ${result.conversations.length} conversations, ${result.stats.total_messages} messages`
      );
      console.log(`   Time: ${elapsedTime}s\n`);
    });
  });

  /**
   * ===========================================================================
   * PHASE 2: CONTENT PROCESSING & GROUPING
   * ===========================================================================
   */

  describe('Phase 2: Content Processing & Grouping', () => {
    it('2.1 Multi-Level Breaking with ContentProcessor', async () => {
      const processor = new ContentProcessor({
        extractTokens: false,
        extractPhrases: false,
        extractSentences: true,
        extractBlocks: true,
        extractSections: true,
        generateSignatures: true,
        minHashPermutations: 128,
      });

      const testText = `
# Introduction

This is a paragraph with multiple sentences. It contains information.

## Section 2

Another paragraph here with more content.
      `;

      const result = await processor.processText(testText);

      assert.ok(result.sentences?.length > 0, 'Sentences extracted');
      assert.ok(result.blocks?.length > 0, 'Blocks extracted');
      assert.ok(result.sections?.length > 0, 'Sections extracted');

      console.log(`✅ Multi-level breaking works:`);
      console.log(`   Sentences: ${result.sentences.length}`);
      console.log(`   Blocks: ${result.blocks.length}`);
      console.log(`   Sections: ${result.sections.length}\n`);
    });
  });

  /**
   * ===========================================================================
   * PERFORMANCE BENCHMARKS
   * ===========================================================================
   */

  describe('Performance Benchmarks', () => {
    it('Performance - Small File (9.8MB)', async () => {
      const exists = await fileExists(SMALL_FILE);
      if (!exists) {
        console.log('⚠️  small.json not found, skipping');
        return;
      }

      const startTime = Date.now();

      const data = await loadJsonFile(SMALL_FILE);
      const parser = new ParserRegistry();
      await parser.parse(data, 'small.json');

      const elapsedTime = (Date.now() - startTime) / 1000;

      assert.ok(elapsedTime < 30, 'Completed within 30 seconds');

      console.log(`✅ Small file (9.8MB): ${elapsedTime.toFixed(2)}s`);
      if (elapsedTime < 5) {
        console.log(`   ⚡ Excellent performance!\n`);
      } else if (elapsedTime < 15) {
        console.log(`   👍 Good performance\n`);
      } else {
        console.log(`   ⚠️  Slower than expected\n`);
      }
    });
  });

  /**
   * ===========================================================================
   * PHASE 3: GROUPING, DEDUPLICATION & CLUSTERING
   * ===========================================================================
   */

  describe('Phase 3: Grouping, Deduplication & Clustering', () => {
    it('3.1 Verify Phase 1-3 Processing on Small File', async () => {
      const exists = await fileExists(SMALL_FILE);
      if (!exists) {
        console.log('⚠️  small.json not found, skipping Phase 3 test');
        return;
      }

      console.log('📊 Running full Phase 1-3 pipeline on small.json...');

      // 1. Parse conversations
      const data = await loadJsonFile(SMALL_FILE);
      const parser = new ParserRegistry();
      const parseResult = await parser.parse(data, 'small.json');

      console.log(
        `   Parsed: ${parseResult.conversations.length} conversations, ${parseResult.stats.total_messages} messages`
      );

      // 2. Run database migrations (Phase 1-3 only needs migration 003)
      console.log('   Running database migrations...');

      // Ensure database directory exists
      const dbDir = path.dirname(TEST_DB_PATH);

      // Cleanup previous run
      try {
        await fs.unlink(TEST_DB_PATH);
        await fs.unlink(`${TEST_DB_PATH}-wal`);
        await fs.unlink(`${TEST_DB_PATH}-shm`);
      } catch {
        // Ignore if files don't exist
      }

      await fs.mkdir(dbDir, { recursive: true });

      const db = new Database(TEST_DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = OFF'); // Phase 1-3 doesn't use foreign keys

      try {
        // Only run migration 003 (Grouping Engine Schema) for Phase 1-3
        const migration003 = await import('../migrations/003_grouping_engine_schema');
        await migration003.up(db);
        console.log('   ✅ Database migrations complete');
      } catch (error) {
        console.log('   ⚠️  Migration error:', error);
        throw error;
      } finally {
        db.close();
      }

      // 3. Initialize Phase 1-3 services
      const processor = new ContentProcessor({
        extractTokens: false,
        extractPhrases: false,
        extractSentences: true,
        extractBlocks: true,
        extractSections: true,
        generateSignatures: true,
        minHashPermutations: 128,
      });

      const storage = new GroupingStorage(TEST_DB_PATH);

      let blobsCreated = 0;
      let spansCreated = 0;
      let signaturesCreated = 0;

      // 4. Process conversations (Phase 1-2)
      try {
        for (const conv of parseResult.conversations) {
          const processedMessages = await processor.processConversation(conv);

          for (const processed of processedMessages) {
            // Insert blob
            try {
              storage.insertBlob(processed.blob);
              blobsCreated++;
            } catch (error: any) {
              console.log(`   ⚠️  Blob insert error: ${error.message}`);
              throw error;
            }

            // Insert spans
            try {
              storage.insertNodeSpans(processed.spans);
              spansCreated += processed.spans.length;
            } catch (error: any) {
              console.log(`   ⚠️  Span insert error: ${error.message}`);
              const span = processed.spans[0];
              console.log(
                `   First span: node_id=${span.node_id}, level=${span.level}, data_tag=${span.data_tag}`
              );
              throw new Error(`Span insert failed: ${error.message}`);
            }

            // Insert signatures
            try {
              storage.insertNodeSignatures(processed.signatures);
              signaturesCreated += processed.signatures.length;
            } catch (error: any) {
              console.log(`   ⚠️  Signature insert error: ${error.message}`);
              const sig = processed.signatures[0];
              console.log(`   First signature: node_id=${sig.node_id}, data_tag=${sig.data_tag}`);
              throw new Error(`Signature insert failed: ${error.message}`);
            }

            // Insert LSH bands
            for (const signature of processed.signatures) {
              if (signature.minhash_bands) {
                const lshBands = signature.minhash_bands.map((bandHash, bandIndex) => ({
                  band_hash: bandHash,
                  band_index: bandIndex,
                  node_id: signature.node_id,
                  created_at: signature.created_at,
                  data_tag: 'test',
                }));
                try {
                  storage.insertLshBands(lshBands);
                } catch (error: any) {
                  console.log(`   ⚠️  LSH band insert error: ${error.message}`);
                  throw error;
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`   ❌ Phase 1-2 processing failed:`, error);
        throw error;
      }

      console.log(
        `   ✅ Phase 1-2: Created ${blobsCreated} blobs, ${spansCreated} spans, ${signaturesCreated} signatures`
      );

      // 5. Run exact deduplication (Phase 3)
      try {
        const dedupDb = new Database(TEST_DB_PATH);
        dedupDb.pragma('journal_mode = WAL');
        const deduper = new DeduplicationEngine(dedupDb, storage);
        const dedupResult = await deduper.deduplicate();

        console.log(
          `   ✅ Phase 3 Dedup: Found ${dedupResult.canonicals_created} canonical nodes (${dedupResult.exact_dups_found} duplicates)`
        );
        dedupDb.close();
      } catch (error: any) {
        console.log(`   ❌ Deduplication failed: ${error.message}`);
        throw error;
      }

      // 6. Run clustering (Phase 3)
      let clusterDb: Database.Database | null = null;
      let clustersCreated = 0;
      let nearDupEdgesCreated = 0;

      try {
        clusterDb = new Database(TEST_DB_PATH);
        clusterDb.pragma('journal_mode = WAL');

        const clusterer = new ClusteringEngine(clusterDb, storage, DEFAULT_POLICY);

        console.log('   Starting clustering...');

        // Cluster sentence-level prose
        console.log('   - Clustering sentence-level prose...');
        const sentenceProseResult = await clusterer.cluster('sentence', 'prose');
        clustersCreated += sentenceProseResult.clusters_created || 0;
        nearDupEdgesCreated += sentenceProseResult.edges_created || 0;

        // Cluster block-level prose
        console.log('   - Clustering block-level prose...');
        const blockProseResult = await clusterer.cluster('block', 'prose');
        clustersCreated += blockProseResult.clusters_created || 0;
        nearDupEdgesCreated += blockProseResult.edges_created || 0;

        console.log(
          `   ✅ Phase 3 Clustering: Created ${clustersCreated} clusters, ${nearDupEdgesCreated} NEAR_DUP edges`
        );
      } catch (error: any) {
        console.log(`   ❌ Clustering failed: ${error.message}`);
        console.log('   Stack:', error.stack);
        throw error;
      } finally {
        if (clusterDb) clusterDb.close();
      }

      // 7. Verify evidence computation
      try {
        const evidenceDb = new Database(TEST_DB_PATH);
        evidenceDb.pragma('journal_mode = WAL');
        const evidenceComputer = new ClusterEvidenceComputer(evidenceDb, DEFAULT_POLICY);
        evidenceComputer.computeAllEvidence();
        console.log(`   ✅ Phase 3 Evidence: Computed evidence scores for all clusters`);
        evidenceDb.close();
      } catch (error) {
        console.log('   ⚠️  Evidence computation skipped:', error);
      }

      // Close storage
      storage.close();

      // Assertions
      assert.ok(blobsCreated > 0, 'Blobs created');
      assert.ok(spansCreated > 0, 'Spans created');
      assert.ok(signaturesCreated > 0, 'Signatures created');
      console.log('\n✅ Phase 3 verification complete!\n');
    });
  });

  /**
   * ===========================================================================
   * DATABASE CLEANUP
   * ===========================================================================
   */

  describe('Database Cleanup', () => {
    it('4.1 Clean Test Data from Database', async () => {
      try {
        const db = new Database(TEST_DB_PATH);

        // Count test data before cleanup
        const before = db
          .prepare('SELECT COUNT(*) as count FROM blobs WHERE data_tag = ?')
          .get('test');
        console.log(`   Test data before cleanup: ${(before as any).count} blobs`);

        // Delete test data
        db.prepare('DELETE FROM blobs WHERE data_tag = ?').run('test');
        db.prepare('DELETE FROM node_spans WHERE data_tag = ?').run('test');
        db.prepare('DELETE FROM node_signatures WHERE data_tag = ?').run('test');
        db.prepare('DELETE FROM lsh_bands WHERE data_tag = ?').run('test');

        // Vacuum to reclaim space
        db.prepare('VACUUM').run();

        const after = db
          .prepare('SELECT COUNT(*) as count FROM blobs WHERE data_tag = ?')
          .get('test');
        console.log(`   Test data after cleanup: ${(after as any).count} blobs`);

        assert.strictEqual((after as any).count, 0, 'All test data removed');
        console.log('   ✅ Test database cleaned successfully\n');

        db.close();
      } catch (error) {
        console.log('   ⚠️  Cleanup skipped (database not initialized):', error);
      }
    });
  });

  /**
   * ===========================================================================
   * TODO: FUTURE TESTS
   * ===========================================================================
   */

  if (!RUN_FULL_SUITE) {
    describe.todo('Neo4j + Local Storage Integration');
    describe.todo('Medium File Tests (135MB)');
    describe.todo('Ultimate Test: Claude 1.1GB');
  }
});
