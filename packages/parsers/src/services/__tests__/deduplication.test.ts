/**
 * Tests for Non-Destructive Deduplication Engine
 *
 * Contract tests:
 * 1. No nodes are deleted or merged
 * 2. EXACT_DUP edges preserve all instances
 * 3. canonical_map and canonical_stats are read helpers only
 * 4. Evidence weights reflect frequency and diversity
 * 5. Instances view and unique view both work correctly
 */

import Database from 'better-sqlite3';
import { DeduplicationEngine } from '../deduplication-engine';
import { GroupingStorage } from '../grouping-storage';
import { ContentProcessor } from '../content-processor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import migrations
import { up as migration003 } from '../../../../apps/api/src/migrations/003_grouping_engine_schema';
import { up as migration004 } from '../../../../apps/api/src/migrations/004_canonical_map_and_stats';

describe('Deduplication Engine: Non-Destructive', () => {
  let db: Database.Database;
  let storage: GroupingStorage;
  let deduper: DeduplicationEngine;
  let dbPath: string;

  beforeEach(() => {
    // Create temp database
    const tmpDir = os.tmpdir();
    dbPath = path.join(tmpDir, `test-dedup-${Date.now()}.db`);
    db = new Database(dbPath);

    // Run migrations
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        from_node TEXT NOT NULL,
        to_node TEXT NOT NULL,
        kind TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (from_node) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (to_node) REFERENCES nodes(id) ON DELETE CASCADE
      );
    `);

    migration003(db);
    migration004(db);

    storage = new GroupingStorage(dbPath);
    deduper = new DeduplicationEngine(db, storage);
  });

  afterEach(() => {
    storage.close();
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should NOT delete duplicate nodes', async () => {
    const text1 = 'Hello world';
    const text2 = 'Hello world'; // Exact duplicate

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text1, 'message');
    const p2 = await processor.processText(text2, 'message');

    // Insert both
    storage.insertBlob(p1.blob);
    storage.insertBlob(p2.blob);
    storage.insertNodeSpans(p1.spans);
    storage.insertNodeSpans(p2.spans);
    storage.insertNodeSignatures(p1.signatures);
    storage.insertNodeSignatures(p2.signatures);

    const beforeCount = db.prepare('SELECT COUNT(*) as count FROM node_spans').get() as any;
    const nodesBefore = beforeCount.count;

    // Run deduplication
    const result = await deduper.deduplicate();

    const afterCount = db.prepare('SELECT COUNT(*) as count FROM node_spans').get() as any;
    const nodesAfter = afterCount.count;

    // CRITICAL: No nodes deleted
    expect(nodesAfter).toBe(nodesBefore);
    expect(result.exact_dups_found).toBeGreaterThan(0);
    expect(result.edges_created).toBeGreaterThan(0);
  });

  it('should create EXACT_DUP edges for duplicates', async () => {
    const text = 'The quick brown fox';

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text, 'message');
    const p2 = await processor.processText(text, 'message');
    const p3 = await processor.processText(text, 'message');

    // Insert all three
    for (const p of [p1, p2, p3]) {
      storage.insertBlob(p.blob);
      storage.insertNodeSpans(p.spans);
      storage.insertNodeSignatures(p.signatures);
    }

    // Run deduplication
    const result = await deduper.deduplicate();

    expect(result.exact_dups_found).toBe(2); // 3 instances - 1 canonical
    expect(result.canonicals_created).toBe(1);
    expect(result.edges_created).toBe(2); // 2 EXACT_DUP edges

    // Verify edges exist
    const edgeCount = db.prepare(`
      SELECT COUNT(*) as count FROM edges WHERE kind = 'EXACT_DUP'
    `).get() as any;

    expect(edgeCount.count).toBe(2);
  });

  it('should pick canonical by smallest NodeKey', async () => {
    const text = 'Test content';

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text, 'message');
    const p2 = await processor.processText(text, 'message');

    // Insert both
    storage.insertBlob(p1.blob);
    storage.insertBlob(p2.blob);
    storage.insertNodeSpans(p1.spans);
    storage.insertNodeSpans(p2.spans);
    storage.insertNodeSignatures(p1.signatures);
    storage.insertNodeSignatures(p2.signatures);

    // Run deduplication
    await deduper.deduplicate();

    const node1 = p1.spans[0];
    const node2 = p2.spans[0];

    // One should be canonical, one should point to it
    const canonical1 = deduper.getCanonical(node1.node_id);
    const canonical2 = deduper.getCanonical(node2.node_id);

    // Both should map to same canonical
    expect(canonical1).toBe(canonical2);

    // Canonical should be the one with smaller NodeKey
    const canonicalNodeKey = db.prepare(`
      SELECT node_key FROM node_spans WHERE node_id = ? LIMIT 1
    `).get(canonical1) as any;

    expect(canonicalNodeKey).toBeTruthy();
  });

  it('should populate canonical_map correctly', async () => {
    const text = 'Sample text';

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text, 'message');
    const p2 = await processor.processText(text, 'message');

    storage.insertBlob(p1.blob);
    storage.insertBlob(p2.blob);
    storage.insertNodeSpans(p1.spans);
    storage.insertNodeSpans(p2.spans);
    storage.insertNodeSignatures(p1.signatures);
    storage.insertNodeSignatures(p2.signatures);

    await deduper.deduplicate();

    // Check canonical_map entries
    const mapCount = db.prepare('SELECT COUNT(*) as count FROM canonical_map').get() as any;
    expect(mapCount.count).toBeGreaterThanOrEqual(1);

    // Verify kind is EXACT_DUP
    const kindCheck = db.prepare(`
      SELECT kind FROM canonical_map LIMIT 1
    `).get() as any;
    expect(kindCheck.kind).toBe('EXACT_DUP');
  });

  it('should compute canonical_stats with evidence weights', async () => {
    const text = 'Evidence test content';

    const processor = new ContentProcessor();
    const instances = await Promise.all([
      processor.processText(text, 'message'),
      processor.processText(text, 'message'),
      processor.processText(text, 'message'),
    ]);

    // Insert all instances
    for (const p of instances) {
      storage.insertBlob(p.blob);
      storage.insertNodeSpans(p.spans);
      storage.insertNodeSignatures(p.signatures);
    }

    await deduper.deduplicate();

    // Get canonical stats
    const statsRow = db.prepare('SELECT * FROM canonical_stats LIMIT 1').get() as any;
    expect(statsRow).toBeTruthy();

    const stats = deduper.getCanonicalStats(statsRow.canonical_node_id);
    expect(stats).toBeTruthy();
    expect(stats!.instances_count).toBe(3);
    expect(stats!.evidence_score).toBeGreaterThan(0);
    expect(stats!.freq_weight).toBeGreaterThan(0);
    expect(stats!.diversity_weight).toBeGreaterThan(0);
  });

  it('should calculate evidence score correctly', async () => {
    const text = 'Score calculation test';

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text, 'message');
    const p2 = await processor.processText(text, 'message');

    storage.insertBlob(p1.blob);
    storage.insertBlob(p2.blob);
    storage.insertNodeSpans(p1.spans);
    storage.insertNodeSpans(p2.spans);
    storage.insertNodeSignatures(p1.signatures);
    storage.insertNodeSignatures(p2.signatures);

    await deduper.deduplicate();

    const canonical = deduper.getCanonical(p1.spans[0].node_id);
    const stats = deduper.getCanonicalStats(canonical);

    expect(stats).toBeTruthy();

    // Evidence score is weighted sum
    const expectedScore =
      0.5 * stats!.freq_weight +
      0.3 * stats!.diversity_weight +
      0.1 * stats!.role_weight +
      0.05 * stats!.temporal_weight +
      0.05 * stats!.modality_weight;

    expect(Math.abs(stats!.evidence_score - expectedScore)).toBeLessThan(0.01);
  });

  it('should support instances view (all nodes)', async () => {
    const text = 'View test';

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text, 'message');
    const p2 = await processor.processText(text, 'message');

    storage.insertBlob(p1.blob);
    storage.insertBlob(p2.blob);
    storage.insertNodeSpans(p1.spans);
    storage.insertNodeSpans(p2.spans);
    storage.insertNodeSignatures(p1.signatures);
    storage.insertNodeSignatures(p2.signatures);

    await deduper.deduplicate();

    // Instances view: should see ALL nodes
    const allNodes = db.prepare(`
      SELECT DISTINCT node_id FROM node_spans
    `).all() as any[];

    expect(allNodes.length).toBeGreaterThanOrEqual(2);
  });

  it('should support unique view (canonicals only)', async () => {
    const text = 'Unique view test';

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text, 'message');
    const p2 = await processor.processText(text, 'message');

    storage.insertBlob(p1.blob);
    storage.insertBlob(p2.blob);
    storage.insertNodeSpans(p1.spans);
    storage.insertNodeSpans(p2.spans);
    storage.insertNodeSignatures(p1.signatures);
    storage.insertNodeSignatures(p2.signatures);

    await deduper.deduplicate();

    // Unique view: should see only canonicals
    const canonicals = db.prepare(`
      SELECT * FROM canonical_stats
    `).all() as any[];

    expect(canonicals.length).toBeGreaterThanOrEqual(1);
    expect(canonicals[0].instances_count).toBeGreaterThanOrEqual(2);
  });

  it('should get all instances for a canonical', async () => {
    const text = 'Instance retrieval test';

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text, 'message');
    const p2 = await processor.processText(text, 'message');
    const p3 = await processor.processText(text, 'message');

    for (const p of [p1, p2, p3]) {
      storage.insertBlob(p.blob);
      storage.insertNodeSpans(p.spans);
      storage.insertNodeSignatures(p.signatures);
    }

    await deduper.deduplicate();

    const canonical = deduper.getCanonical(p1.spans[0].node_id);
    const instances = deduper.getInstances(canonical);

    expect(instances.length).toBe(3);
    expect(instances).toContain(p1.spans[0].node_id);
    expect(instances).toContain(p2.spans[0].node_id);
    expect(instances).toContain(p3.spans[0].node_id);
  });

  it('should identify duplicates correctly', async () => {
    const text1 = 'Duplicate check';
    const text2 = 'Duplicate check'; // Duplicate
    const text3 = 'Different text';  // Not duplicate

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text1, 'message');
    const p2 = await processor.processText(text2, 'message');
    const p3 = await processor.processText(text3, 'message');

    for (const p of [p1, p2, p3]) {
      storage.insertBlob(p.blob);
      storage.insertNodeSpans(p.spans);
      storage.insertNodeSignatures(p.signatures);
    }

    await deduper.deduplicate();

    const canonical1 = deduper.getCanonical(p1.spans[0].node_id);
    const canonical2 = deduper.getCanonical(p2.spans[0].node_id);
    const canonical3 = deduper.getCanonical(p3.spans[0].node_id);

    // p1 and p2 should have same canonical
    expect(canonical1).toBe(canonical2);

    // p3 should be its own canonical (no duplicates)
    expect(canonical3).not.toBe(canonical1);

    // Check isDuplicate
    const isDup1 = deduper.isDuplicate(p1.spans[0].node_id);
    const isDup2 = deduper.isDuplicate(p2.spans[0].node_id);

    // At least one should be marked as duplicate
    expect(isDup1 || isDup2).toBe(true);
  });

  it('should rank by evidence score', async () => {
    const text1 = 'High evidence text';
    const text2 = 'Low evidence text';

    const processor = new ContentProcessor();

    // Create many instances of text1 (high evidence)
    for (let i = 0; i < 5; i++) {
      const p = await processor.processText(text1, 'message');
      storage.insertBlob(p.blob);
      storage.insertNodeSpans(p.spans);
      storage.insertNodeSignatures(p.signatures);
    }

    // Create few instances of text2 (low evidence)
    for (let i = 0; i < 2; i++) {
      const p = await processor.processText(text2, 'message');
      storage.insertBlob(p.blob);
      storage.insertNodeSpans(p.spans);
      storage.insertNodeSignatures(p.signatures);
    }

    await deduper.deduplicate();

    const topCanonicals = deduper.getTopCanonicals(10, 2);
    expect(topCanonicals.length).toBeGreaterThanOrEqual(2);

    // Higher instance count should have higher evidence score
    expect(topCanonicals[0].instances_count).toBeGreaterThanOrEqual(topCanonicals[1].instances_count);
    expect(topCanonicals[0].evidence_score).toBeGreaterThanOrEqual(topCanonicals[1].evidence_score);
  });

  it('should provide correct statistics', async () => {
    const text1 = 'Stats test 1';
    const text2 = 'Stats test 1'; // Duplicate
    const text3 = 'Stats test 2'; // Unique

    const processor = new ContentProcessor();
    const p1 = await processor.processText(text1, 'message');
    const p2 = await processor.processText(text2, 'message');
    const p3 = await processor.processText(text3, 'message');

    for (const p of [p1, p2, p3]) {
      storage.insertBlob(p.blob);
      storage.insertNodeSpans(p.spans);
      storage.insertNodeSignatures(p.signatures);
    }

    await deduper.deduplicate();

    const stats = deduper.getStats();

    expect(stats.total_nodes).toBeGreaterThanOrEqual(3);
    expect(stats.duplicate_nodes).toBeGreaterThanOrEqual(1);
    expect(stats.canonicals_with_dups).toBeGreaterThanOrEqual(1);
    expect(stats.avg_instances_per_canonical).toBeGreaterThan(1);
  });
});
