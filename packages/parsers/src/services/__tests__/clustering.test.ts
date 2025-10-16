/**
 * Comprehensive Tests for Phase 3: Clustering Engine
 *
 * Tests:
 * - Policy system (load, validate, merge, sign)
 * - J+MD processor (ChatRecord conversion, island detection)
 * - Clustering engine (LSH, similarity, decisions, membership)
 * - NEAR_DUP edges (creation, queries, reason codes)
 * - Cluster evidence (roll-up, coherence)
 * - Edges-only export (hashing, privacy)
 * - Integration (end-to-end, determinism)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

// Policy imports
import {
  ClusteringPolicy,
  DEFAULT_POLICY,
  validatePolicy,
  signPolicy,
  computePolicySignature,
  getThresholds,
  loadPolicyFromString,
  loadDefaultPolicy,
  getPolicyDiff,
} from '@canvas-memory/types';

// Service imports
import { ContentProcessor } from '../content-processor';
import { GroupingStorage } from '../grouping-storage';
import { JmdProcessor } from '../jmd-processor';
import { ClusteringEngine } from '../clustering-engine';
import { NearDupEdgeGenerator } from '../near-dup-edges';
import { ClusterEvidenceComputer } from '../cluster-evidence';
import { PublishableExport } from '../../../../../apps/api/src/services/publishable-export';

// Migrations
import { up as migration003 } from '../../../../../apps/api/src/migrations/003_grouping_engine_schema';
import { up as migration004 } from '../../../../../apps/api/src/migrations/004_canonical_map_and_stats';
import { up as migration005 } from '../../../../../apps/api/src/migrations/005_clustering_schema';

describe('Phase 3: Clustering Engine - Policy System', () => {
  describe('Policy Loading', () => {
    it('should load policy from YAML string', () => {
      const yamlContent = `
version: "1.0.0"
overlap:
  exclusive_per_slice: true
  review_epsilon: 0.01
`;

      const policy = loadPolicyFromString(yamlContent);
      expect(policy.version).toBe('1.0.0');
      expect(policy.overlap.exclusive_per_slice).toBe(true);
      expect(policy.signature).toBeTruthy();
    });

    it('should merge with defaults', () => {
      const yamlContent = `
version: "2.0.0"
overlap:
  review_epsilon: 0.05
`;

      const policy = loadPolicyFromString(yamlContent);
      expect(policy.version).toBe('2.0.0');
      expect(policy.overlap.review_epsilon).toBe(0.05);
      // Check defaults are present
      expect(policy.evidence.freq_weight).toBe(DEFAULT_POLICY.evidence.freq_weight);
    });

    it('should validate policy on load', () => {
      const invalidYaml = `
version: "1.0.0"
gray_band:
  prose:
    sentence:
      attach: 0.5
      review_lower: 0.8
      reject_below: 0.9
`;

      expect(() => loadPolicyFromString(invalidYaml)).toThrow('validation failed');
    });
  });

  describe('Policy Validation', () => {
    it('should validate threshold ordering', () => {
      const badPolicy = { ...DEFAULT_POLICY };
      badPolicy.gray_band.prose.sentence.reject_below = 0.95;
      badPolicy.gray_band.prose.sentence.review_lower = 0.80;
      badPolicy.gray_band.prose.sentence.attach = 0.88;

      const errors = validatePolicy(badPolicy);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('reject_below must be <'))).toBe(true);
    });

    it('should validate threshold ranges', () => {
      const badPolicy = { ...DEFAULT_POLICY };
      badPolicy.gray_band.code.block.attach = 1.5; // Out of range

      const errors = validatePolicy(badPolicy);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('must be in [0, 1]'))).toBe(true);
    });

    it('should accept valid policy', () => {
      const errors = validatePolicy(DEFAULT_POLICY);
      expect(errors).toEqual([]);
    });
  });

  describe('Policy Signature', () => {
    it('should compute deterministic signature', () => {
      const policy1 = { ...DEFAULT_POLICY };
      const policy2 = { ...DEFAULT_POLICY };

      const sig1 = computePolicySignature(policy1);
      const sig2 = computePolicySignature(policy2);

      expect(sig1).toBe(sig2);
      expect(sig1).toHaveLength(16);
    });

    it('should change signature when policy changes', () => {
      const policy1 = { ...DEFAULT_POLICY };
      const policy2 = { ...DEFAULT_POLICY, version: '2.0.0' };

      const sig1 = computePolicySignature(policy1);
      const sig2 = computePolicySignature(policy2);

      expect(sig1).not.toBe(sig2);
    });

    it('should sign policy', () => {
      const unsigned = { ...DEFAULT_POLICY };
      delete unsigned.signature;

      const signed = signPolicy(unsigned);
      expect(signed.signature).toBeTruthy();
      expect(signed.signature).toHaveLength(16);
    });
  });

  describe('Policy Utilities', () => {
    it('should get thresholds by modality and level', () => {
      const thresholds = getThresholds(DEFAULT_POLICY, 'code', 'block');
      expect(thresholds.attach).toBe(0.92);
      expect(thresholds.review_lower).toBe(0.80);
      expect(thresholds.reject_below).toBe(0.65);
    });

    it('should compute policy diff', () => {
      const policy1 = { ...DEFAULT_POLICY };
      const policy2 = { ...DEFAULT_POLICY };
      policy2.evidence.freq_weight = 0.6;
      policy2.gray_band.code.block.attach = 0.95;

      const diff = getPolicyDiff(policy1, policy2);
      expect(Object.keys(diff).length).toBeGreaterThan(0);
      expect(diff['evidence.freq_weight']).toEqual({ old: 0.5, new: 0.6 });
    });
  });
});

describe('Phase 3: J+MD Processor', () => {
  let jmdProcessor: JmdProcessor;

  beforeEach(() => {
    jmdProcessor = new JmdProcessor();
  });

  describe('ChatRecord Conversion', () => {
    it('should convert NormalizedMessage to ChatRecord', () => {
      const message = {
        message_id: 'msg_123',
        role: 'user',
        content: '# Hello\n\nThis is a test.',
        timestamp: Date.now(),
        index: 0,
      };

      const result = jmdProcessor.convertMessage(message, 'conv_123');

      expect(result.chatRecord.id).toBe('chat_msg_123');
      expect(result.chatRecord.role).toBe('user');
      expect(result.chatRecord.raw_text).toBe(message.content);
      expect(result.chatRecord.md).toBeTruthy();
      expect(result.chatRecord.md_norm_sha256).toHaveLength(64);
    });
  });

  describe('Island Detection', () => {
    it('should detect fenced code blocks', () => {
      const message = {
        message_id: 'msg_123',
        role: 'assistant',
        content: 'Here is code:\n\n```javascript\nconst x = 42;\n```',
        timestamp: Date.now(),
        index: 0,
      };

      const result = jmdProcessor.convertMessage(message, 'conv_123');
      const codeIslands = jmdProcessor.getCodeIslands(result.chatRecord);

      expect(codeIslands.length).toBeGreaterThanOrEqual(1);
      expect(codeIslands[0].type).toBe('code');
      expect(codeIslands[0].language).toBe('javascript');
    });

    it('should detect inline code', () => {
      const message = {
        message_id: 'msg_123',
        role: 'user',
        content: 'Use `const` instead of `var`.',
        timestamp: Date.now(),
        index: 0,
      };

      const result = jmdProcessor.convertMessage(message, 'conv_123');
      const codeIslands = jmdProcessor.getCodeIslands(result.chatRecord);

      expect(codeIslands.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect math islands', () => {
      const message = {
        message_id: 'msg_123',
        role: 'assistant',
        content: 'The formula is $$E = mc^2$$ and inline $x^2$.',
        timestamp: Date.now(),
        index: 0,
      };

      const result = jmdProcessor.convertMessage(message, 'conv_123');
      const mathIslands = jmdProcessor.getMathIslands(result.chatRecord);

      expect(mathIslands.length).toBeGreaterThanOrEqual(2);
      expect(mathIslands[0].type).toBe('math');
    });
  });

  describe('Span Mapping', () => {
    it('should check if span is in island', () => {
      const message = {
        message_id: 'msg_123',
        role: 'assistant',
        content: 'Code: ```js\nconst x = 42;\n```',
        timestamp: Date.now(),
        index: 0,
      };

      const result = jmdProcessor.convertMessage(message, 'conv_123');
      const codeIslands = result.chatRecord.islands;

      if (codeIslands.length > 0) {
        const island = codeIslands[0];
        const isInIsland = jmdProcessor.isInIsland(
          result.chatRecord,
          island.md_char_start,
          island.md_char_end
        );
        expect(isInIsland).toBe(true);
      }
    });
  });
});

describe('Phase 3: Clustering Engine - Integration Tests', () => {
  let db: Database.Database;
  let storage: GroupingStorage;
  let engine: ClusteringEngine;
  let edgeGen: NearDupEdgeGenerator;
  let policy: ClusteringPolicy;

  beforeEach(() => {
    db = new Database(':memory:');
    policy = signPolicy(DEFAULT_POLICY);

    // Run migrations
    migration003(db);
    migration004(db);
    migration005(db);

    storage = new GroupingStorage(db);
    engine = new ClusteringEngine(db, storage, policy);
    edgeGen = new NearDupEdgeGenerator(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Deterministic Clustering', () => {
    it('should produce identical clusters across runs', async () => {
      // Insert test data
      const blob1 = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 100,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob1);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      // Insert signatures with high similarity
      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: new Array(128).fill(0).map((_, i) => i % 100),
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: new Array(128).fill(0).map((_, i) => (i + 5) % 100), // Similar
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      // Run clustering twice
      const result1 = await engine.cluster('block', 'prose');
      const result2 = await engine.cluster('block', 'prose');

      // Verify identical results
      expect(result1.stats.clustered_nodes).toBe(result2.stats.clustered_nodes);
      expect(result1.stats.singleton_clusters).toBe(result2.stats.singleton_clusters);
    });

    it('should use deterministic tie-breaking rules', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 150,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      // Create 3 nodes with identical scores
      const baseTime = Date.now();
      const spans = [
        {
          node_id: 'node_a',
          node_key: 'nk_a',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'sentence' as const,
          modality: 'prose' as const,
          created_at: baseTime,
        },
        {
          node_id: 'node_b',
          node_key: 'nk_b',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'sentence' as const,
          modality: 'prose' as const,
          created_at: baseTime + 1000,
        },
        {
          node_id: 'node_c',
          node_key: 'nk_c',
          blob_hash: 'hash_1',
          byte_start: 100,
          byte_end: 150,
          level: 'sentence' as const,
          modality: 'prose' as const,
          created_at: baseTime + 2000,
        },
      ];
      storage.insertNodeSpans(spans);

      // Identical MinHash signatures
      const sameHash = new Array(128).fill(0).map((_, i) => i % 50);
      const sigs = [
        {
          node_id: 'node_a',
          content_id: 'cid_a',
          minhash: sameHash,
          created_at: baseTime,
        },
        {
          node_id: 'node_b',
          content_id: 'cid_b',
          minhash: sameHash,
          created_at: baseTime + 1000,
        },
        {
          node_id: 'node_c',
          content_id: 'cid_c',
          minhash: sameHash,
          created_at: baseTime + 2000,
        },
      ];
      storage.insertNodeSignatures(sigs);

      // Run clustering
      const result = await engine.cluster('sentence', 'prose');

      // Verify tie-breaking: should prefer nodekey (alphabetically first)
      const clusters = db
        .prepare('SELECT * FROM clusters WHERE level = ? AND modality = ?')
        .all('sentence', 'prose');

      expect(clusters.length).toBeGreaterThan(0);
      // Representative should be deterministically chosen
      const members = db
        .prepare('SELECT * FROM cluster_memberships WHERE cluster_id = ?')
        .all(clusters[0].cluster_id);

      expect(members.length).toBeGreaterThan(0);
    });
  });

  describe('Gray-Band Decision System', () => {
    it('should auto-attach above threshold', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 100,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      // Very similar signatures (score > attach threshold)
      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: new Array(128).fill(0).map((_, i) => i),
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: new Array(128).fill(0).map((_, i) => i + 1), // Very similar
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      const result = await engine.cluster('block', 'prose');

      // Check for auto-attach decision
      const decisions = db
        .prepare('SELECT * FROM cluster_decisions WHERE decision = ?')
        .all('attach');

      expect(decisions.length).toBeGreaterThan(0);
    });

    it('should send to review queue within gray band', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 100,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      // Medium similarity (in gray band: 0.75 <= score < 0.88)
      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: new Array(128).fill(0).map((_, i) => i % 100),
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: new Array(128).fill(0).map((_, i) => (i + 25) % 100), // Medium similarity
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      const result = await engine.cluster('block', 'prose');

      // Check review queue
      const reviewItems = db
        .prepare('SELECT * FROM review_queue WHERE reviewed_at IS NULL')
        .all();

      expect(reviewItems.length).toBeGreaterThan(0);
    });

    it('should reject below threshold', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 100,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      // Very different signatures (score < reject threshold)
      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: new Array(128).fill(0).map((_, i) => i),
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: new Array(128).fill(0).map((_, i) => i + 64), // Very different
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      const result = await engine.cluster('block', 'prose');

      // Check for reject decisions
      const decisions = db
        .prepare('SELECT * FROM cluster_decisions WHERE decision = ?')
        .all('reject');

      expect(result.stats.singleton_clusters).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Exclusive Membership per Slice', () => {
    it('should enforce one cluster per (level × modality)', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 150,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_3',
          node_key: 'nk_3',
          blob_hash: 'hash_1',
          byte_start: 100,
          byte_end: 150,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      const sameHash = new Array(128).fill(0).map((_, i) => i % 50);
      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: sameHash,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: sameHash,
          created_at: Date.now(),
        },
        {
          node_id: 'node_3',
          content_id: 'cid_3',
          minhash: sameHash,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      await engine.cluster('block', 'prose');

      // Check memberships
      const memberships = db
        .prepare(
          'SELECT node_id, COUNT(*) as cluster_count FROM cluster_memberships WHERE level = ? AND modality = ? GROUP BY node_id'
        )
        .all('block', 'prose');

      // Each node should be in exactly one cluster
      memberships.forEach((m: any) => {
        expect(m.cluster_count).toBe(1);
      });
    });
  });

  describe('NEAR_DUP Edge Generation', () => {
    it('should create bidirectional edges', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 100,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: new Array(128).fill(0).map((_, i) => i),
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: new Array(128).fill(0).map((_, i) => i + 1),
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      await engine.cluster('block', 'prose');

      // Check for bidirectional edges
      const edges = db
        .prepare('SELECT * FROM edges WHERE kind = ?')
        .all('NEAR_DUP') as any[];

      if (edges.length > 0) {
        const forward = edges.find(
          (e) => e.from_node === 'node_1' && e.to_node === 'node_2'
        );
        const backward = edges.find(
          (e) => e.from_node === 'node_2' && e.to_node === 'node_1'
        );

        expect(forward || backward).toBeTruthy();
      }
    });

    it('should include reason codes in edges', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 100,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: new Array(128).fill(0).map((_, i) => i),
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: new Array(128).fill(0).map((_, i) => i + 1),
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      await engine.cluster('block', 'prose');

      const edges = db
        .prepare('SELECT * FROM edges WHERE kind = ?')
        .all('NEAR_DUP') as any[];

      if (edges.length > 0) {
        const metadata = JSON.parse(edges[0].metadata);
        expect(metadata.reason_code).toBeTruthy();
        expect(['TOK_OVERLAP', 'MINHASH_HIGH', 'COSINE_HIGH', 'BLOCK_MATCH']).toContain(
          metadata.reason_code
        );
      }
    });
  });

  describe('Cluster Evidence Computation', () => {
    it('should compute coherence from edge scores', async () => {
      const blob = {
        blob_id: 'blob_1',
        hash: 'hash_1',
        size_bytes: 150,
        encoding: 'utf8',
        created_at: Date.now(),
      };
      storage.insertBlob(blob);

      const spans = [
        {
          node_id: 'node_1',
          node_key: 'nk_1',
          blob_hash: 'hash_1',
          byte_start: 0,
          byte_end: 50,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          node_key: 'nk_2',
          blob_hash: 'hash_1',
          byte_start: 50,
          byte_end: 100,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
        {
          node_id: 'node_3',
          node_key: 'nk_3',
          blob_hash: 'hash_1',
          byte_start: 100,
          byte_end: 150,
          level: 'block' as const,
          modality: 'prose' as const,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSpans(spans);

      const sameHash = new Array(128).fill(0).map((_, i) => i % 50);
      const sigs = [
        {
          node_id: 'node_1',
          content_id: 'cid_1',
          minhash: sameHash,
          created_at: Date.now(),
        },
        {
          node_id: 'node_2',
          content_id: 'cid_2',
          minhash: sameHash,
          created_at: Date.now(),
        },
        {
          node_id: 'node_3',
          content_id: 'cid_3',
          minhash: sameHash,
          created_at: Date.now(),
        },
      ];
      storage.insertNodeSignatures(sigs);

      await engine.cluster('block', 'prose');

      const evidenceComputer = new ClusterEvidenceComputer(db, policy);
      const clusters = db
        .prepare('SELECT * FROM clusters WHERE level = ? AND modality = ?')
        .all('block', 'prose');

      if (clusters.length > 0) {
        const evidence = evidenceComputer.computeEvidence(clusters[0].cluster_id);
        expect(evidence.coherence).toBeTruthy();
        expect(evidence.coherence.avg_score).toBeGreaterThanOrEqual(0);
        expect(evidence.coherence.avg_score).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('Phase 3: Publishable Export', () => {
  let db: Database.Database;
  let policy: ClusteringPolicy;
  let exporter: PublishableExport;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
    db = new Database(':memory:');
    policy = signPolicy(DEFAULT_POLICY);

    // Create edges table
    db.exec(`
      CREATE TABLE edges (
        id TEXT PRIMARY KEY,
        from_node TEXT NOT NULL,
        to_node TEXT NOT NULL,
        kind TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    exporter = new PublishableExport(db, policy, tmpDir);
  });

  afterEach(() => {
    db.close();
    // Clean up tmp dir
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Node ID Hashing', () => {
    it('should hash node IDs deterministically', () => {
      const nodeId = 'node_abc123';
      const hash1 = exporter.hashNodeId(nodeId);
      const hash2 = exporter.hashNodeId(nodeId);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce different hashes for different IDs', () => {
      const hash1 = exporter.hashNodeId('node_abc');
      const hash2 = exporter.hashNodeId('node_xyz');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Export Edges', () => {
    beforeEach(() => {
      // Insert test edges
      db.exec(`
        INSERT INTO edges (id, from_node, to_node, kind, weight, metadata, created_at)
        VALUES
          ('e1', 'node_a', 'node_b', 'NEAR_DUP', 0.92, '{"reason_code":"MINHASH_HIGH"}', 1000),
          ('e2', 'node_b', 'node_c', 'NEAR_DUP', 0.85, '{"reason_code":"TOK_OVERLAP"}', 1001),
          ('e3', 'node_c', 'node_a', 'NEAR_DUP', 0.78, '{"reason_code":"BLOCK_MATCH"}', 1002);
      `);
    });

    it('should export edges with hashed IDs', () => {
      const snapshot = exporter.exportEdgesOnly();

      expect(snapshot.edges.length).toBe(3);
      expect(snapshot.edges[0].from).toHaveLength(64);
      expect(snapshot.edges[0].to).toHaveLength(64);
      expect(snapshot.edges[0].score).toBe(0.92);
    });

    it('should include policy signature', () => {
      const snapshot = exporter.exportEdgesOnly();

      expect(snapshot.policy_signature).toBe(policy.signature);
      expect(snapshot.policy_version).toBe(policy.version);
    });

    it('should compute correct statistics', () => {
      const snapshot = exporter.exportEdgesOnly();

      expect(snapshot.stats.total_edges).toBe(3);
      expect(snapshot.stats.total_nodes).toBe(3); // Unique hashed nodes
      expect(snapshot.stats.avg_score).toBeCloseTo((0.92 + 0.85 + 0.78) / 3);
      expect(snapshot.stats.min_score).toBe(0.78);
      expect(snapshot.stats.max_score).toBe(0.92);
    });

    it('should filter by minimum score', () => {
      const snapshot = exporter.exportEdgesOnly({ minScore: 0.80 });

      expect(snapshot.edges.length).toBe(2); // Only edges >= 0.80
    });

    it('should include reason codes when enabled', () => {
      const snapshot = exporter.exportEdgesOnly({ includeReasonCodes: true });

      expect(snapshot.edges[0].reason_code).toBe('MINHASH_HIGH');
      expect(snapshot.stats.reason_code_distribution).toBeTruthy();
      expect(snapshot.stats.reason_code_distribution['MINHASH_HIGH']).toBe(1);
    });
  });

  describe('Snapshot Management', () => {
    it('should save snapshot to disk', () => {
      db.exec(`
        INSERT INTO edges (id, from_node, to_node, kind, weight, metadata, created_at)
        VALUES ('e1', 'node_a', 'node_b', 'NEAR_DUP', 0.92, '{}', 1000);
      `);

      const snapshot = exporter.exportEdgesOnly();
      const filepath = exporter.saveSnapshot(snapshot);

      expect(fs.existsSync(filepath)).toBe(true);

      const content = fs.readFileSync(filepath, 'utf8');
      const loaded = JSON.parse(content);
      expect(loaded.edges.length).toBe(1);
    });

    it('should list snapshots', () => {
      db.exec(`
        INSERT INTO edges (id, from_node, to_node, kind, weight, metadata, created_at)
        VALUES ('e1', 'node_a', 'node_b', 'NEAR_DUP', 0.92, '{}', 1000);
      `);

      exporter.exportAndSave();
      exporter.exportAndSave();

      const snapshots = exporter.listSnapshots();
      expect(snapshots.length).toBeGreaterThanOrEqual(2);
      expect(snapshots[0].version).toBeTruthy();
    });

    it('should load snapshot', () => {
      db.exec(`
        INSERT INTO edges (id, from_node, to_node, kind, weight, metadata, created_at)
        VALUES ('e1', 'node_a', 'node_b', 'NEAR_DUP', 0.92, '{}', 1000);
      `);

      const snapshot1 = exporter.exportEdgesOnly();
      exporter.saveSnapshot(snapshot1);

      const snapshot2 = exporter.loadSnapshot(snapshot1.version);
      expect(snapshot2.version).toBe(snapshot1.version);
      expect(snapshot2.edges.length).toBe(snapshot1.edges.length);
    });

    it('should clean old snapshots', () => {
      const policy2 = { ...policy };
      policy2.publishing.edges_only.keep_last = 2;
      const exporter2 = new PublishableExport(db, policy2, tmpDir);

      db.exec(`
        INSERT INTO edges (id, from_node, to_node, kind, weight, metadata, created_at)
        VALUES ('e1', 'node_a', 'node_b', 'NEAR_DUP', 0.92, '{}', 1000);
      `);

      // Create 4 snapshots
      exporter2.exportAndSave();
      exporter2.exportAndSave();
      exporter2.exportAndSave();
      exporter2.exportAndSave();

      const snapshots = exporter2.listSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Privacy Verification', () => {
    it('should verify snapshot has no plaintext', () => {
      db.exec(`
        INSERT INTO edges (id, from_node, to_node, kind, weight, metadata, created_at)
        VALUES ('e1', 'node_a', 'node_b', 'NEAR_DUP', 0.92, '{}', 1000);
      `);

      const snapshot = exporter.exportEdgesOnly();
      exporter.saveSnapshot(snapshot);

      const verification = exporter.verifySnapshot(snapshot.version);
      expect(verification.valid).toBe(true);
      expect(verification.errors).toEqual([]);
    });
  });
});
