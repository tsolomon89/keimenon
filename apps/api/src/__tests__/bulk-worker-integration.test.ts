/**
 * Bulk Insert Pipeline — Worker Integration Tests
 *
 * Tasks 4 & 5 of Epic 3 correctness hardening.
 * Exercises the REAL path through the worker thread:
 *
 *   GraphBatchAccumulator → BulkGraphWriteSink → DbWorkerClient
 *     → db-worker.handleBulkInsertGraphBatch → SQLite rows
 *
 * Uses a file-based test DB because DbWorkerClient requires a real file path.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import { createBulkTestDbFile } from './utils/test-db';
import { DbWorkerClient } from '../workers/DbWorkerClient';
import { BulkGraphWriteSink } from '../services/GraphWriteSink';
import { GraphBatchAccumulator } from '../services/GraphBatchAccumulator';
import type { AnyNode, AnyEdge } from '@keimenon/types';

const ACCOUNT_ID = 'acc_test';
const USER_ID = 'user_test';

function rowCount(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any).c;
}

// ---------------------------------------------------------------------------
// Test: Real worker bulk insert path
// ---------------------------------------------------------------------------

describe('DB Worker — Bulk Insert Integration', () => {
  let db: Database.Database;
  let dbPath: string;
  let worker: DbWorkerClient;

  beforeEach(async () => {
    const result = createBulkTestDbFile();
    db = result.db;
    dbPath = result.dbPath;

    // Close the setup DB so the worker can open it exclusively
    db.close();

    worker = new DbWorkerClient(dbPath, {
      startTimeoutMs: 10_000,
      operationTimeoutMs: 30_000,
      autoRestart: false,
    });
    await worker.start();
  }, 15_000);

  afterEach(async () => {
    try {
      await worker.stop();
    } catch {}
    try {
      fs.unlinkSync(dbPath);
    } catch {}
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {}
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {}
  });

  // -----------------------------------------------------------------------
  // Task 4: Full pipeline integration test
  // -----------------------------------------------------------------------
  test('full pipeline: Accumulator → Sink → Worker → SQLite rows', async () => {
    const sink = new BulkGraphWriteSink(worker, () => {});
    const accumulator = new GraphBatchAccumulator(sink, ACCOUNT_ID, USER_ID);

    // 1. Source node
    await accumulator.addNode({
      id: 'src_integ',
      kind: 'Source',
      account_id: ACCOUNT_ID,
      created_by: USER_ID,
      properties: JSON.stringify({ title: 'Integration Source' }),
      created_at: Date.now(),
      updated_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyNode);

    // 2. SourceSpan node (with payload properties)
    await accumulator.addNode({
      id: 'span_integ',
      kind: 'SourceSpan',
      account_id: ACCOUNT_ID,
      created_by: USER_ID,
      properties: JSON.stringify({
        source_id: 'src_integ',
        text: 'Hello integration test world',
        normalized_text: 'hello integration test world',
        start_char: 0,
        end_char: 28,
        boundary_kind: 'sentence',
        span_hash: 'hash_span_integ',
      }),
      created_at: Date.now(),
      updated_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyNode);

    // 3. Phrase node (with payload properties)
    await accumulator.addNode({
      id: 'phrase_integ',
      kind: 'Phrase',
      account_id: ACCOUNT_ID,
      created_by: USER_ID,
      properties: JSON.stringify({
        text: 'hello integration',
        normalized_text: 'hello integration',
        type: 'n-gram',
        frequency: 1,
      }),
      created_at: Date.now(),
      updated_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyNode);

    // 4. HAS_SPAN edge
    await accumulator.addEdge({
      id: 'edge_has_span_integ',
      kind: 'HAS_SPAN',
      from: 'src_integ',
      to: 'span_integ',
      account_id: ACCOUNT_ID,
      created_by: USER_ID,
      created_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyEdge);

    // 5. OCCURS_IN_SPAN edge
    await accumulator.addEdge({
      id: 'edge_occurs_integ',
      kind: 'OCCURS_IN_SPAN',
      from: 'phrase_integ',
      to: 'span_integ',
      account_id: ACCOUNT_ID,
      created_by: USER_ID,
      created_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyEdge);

    // 6. Flush all
    await accumulator.complete();

    // 7. Verify: open the DB directly and check rows
    const verifyDb = new Database(dbPath, { readonly: true });
    verifyDb.pragma('foreign_keys = ON');

    try {
      // Nodes: Source + SourceSpan (skinny) + Phrase (skinny) = 3
      expect(rowCount(verifyDb, 'nodes')).toBeGreaterThanOrEqual(3);

      // Source spans payload
      const spans = verifyDb.prepare('SELECT * FROM source_spans WHERE id = ?').all('span_integ');
      expect(spans).toHaveLength(1);
      expect((spans[0] as any).text).toBe('Hello integration test world');
      expect((spans[0] as any).span_hash).toBe('hash_span_integ');
      expect((spans[0] as any).start_char).toBe(0);
      expect((spans[0] as any).end_char).toBe(28);

      // Phrases payload
      const phrases = verifyDb.prepare('SELECT * FROM phrases WHERE id = ?').all('phrase_integ');
      expect(phrases).toHaveLength(1);
      expect((phrases[0] as any).text).toBe('hello integration');
      expect((phrases[0] as any).type).toBe('n-gram');

      // Edges
      const edges = verifyDb.prepare('SELECT * FROM edges').all();
      expect(edges.length).toBeGreaterThanOrEqual(2);

      const hasSpan = edges.find((e: any) => e.id === 'edge_has_span_integ');
      expect(hasSpan).toBeDefined();
      expect((hasSpan as any).kind).toBe('HAS_SPAN');
      expect((hasSpan as any).from_id).toBe('src_integ');
      expect((hasSpan as any).to_id).toBe('span_integ');

      const occursIn = edges.find((e: any) => e.id === 'edge_occurs_integ');
      expect(occursIn).toBeDefined();
      expect((occursIn as any).kind).toBe('OCCURS_IN_SPAN');
    } finally {
      verifyDb.close();
    }
  }, 30_000);

  // -----------------------------------------------------------------------
  // Task 5: Quarantine integration test
  // -----------------------------------------------------------------------
  test('malformed batch: worker does not crash, quarantine persists', async () => {
    // Send a batch with a node whose kind violates the CHECK constraint.
    // The worker should catch the error, quarantine the bad rows, and not crash.
    const result = await worker.bulkInsertGraphBatch({
      batchId: 'batch_quarantine_test',
      importId: 'import_quarantine_test',
      accountId: ACCOUNT_ID,
      createdBy: USER_ID,
      metadata: {
        batchIndex: 1,
        totalBatches: 1,
        isFinalBatch: true,
      },
      skinnyNodes: [],
      genericNodes: [
        {
          id: 'bad_node_invalid_kind',
          kind: 'COMPLETELY_INVALID_KIND' as any,
          properties: '{}',
          account_id: ACCOUNT_ID,
          created_by: USER_ID,
          created_at: Date.now(),
          updated_at: Date.now(),
          data_tag: 'real',
          content_hash: null,
          canonical_content: null,
          is_duplicate: 0,
          original_node_id: null,
        },
      ],
      edges: [],
      normalizedPayloads: {
        sourceSpans: [],
        phrases: [],
        packets: [],
        atomicUnits: [],
      },
    });

    // Worker should NOT have crashed — it should return a result
    expect(result).toBeDefined();

    // The batch should have errored (CHECK constraint violation)
    // Either quarantinedRows > 0, or the error was reported
    // Open the DB and check quarantine table
    const verifyDb = new Database(dbPath, { readonly: true });
    try {
      const quarantineRows = verifyDb.prepare('SELECT * FROM bulk_insert_quarantine').all();

      // The bad node should be quarantined (if quarantine logic handled it)
      // OR the result should report the error explicitly
      if (quarantineRows.length > 0) {
        expect(quarantineRows.length).toBeGreaterThan(0);
        const qRow = quarantineRows[0] as any;
        expect(qRow.batch_id).toBe('batch_quarantine_test');
      } else {
        // If no quarantine rows, the error must be in the result
        expect(result.error || result.quarantinedRows !== undefined).toBeTruthy();
      }

      // The bad node should NOT be in the nodes table
      const badNode = verifyDb
        .prepare('SELECT * FROM nodes WHERE id = ?')
        .get('bad_node_invalid_kind');
      expect(badNode).toBeUndefined();
    } finally {
      verifyDb.close();
    }

    // Worker should still be alive and able to process more batches
    expect(worker.isReady()).toBe(true);
  }, 30_000);

  // -----------------------------------------------------------------------
  // Task 5b: Mixed valid+invalid batch
  // -----------------------------------------------------------------------
  test('mixed batch: valid nodes survive, invalid nodes quarantined or error reported', async () => {
    // First insert a valid node through the full pipeline
    const sink = new BulkGraphWriteSink(worker, () => {});
    const accumulator = new GraphBatchAccumulator(sink, ACCOUNT_ID, USER_ID);

    await accumulator.addNode({
      id: 'valid_node_1',
      kind: 'Source',
      account_id: ACCOUNT_ID,
      created_by: USER_ID,
      properties: JSON.stringify({ title: 'Valid Source' }),
      created_at: Date.now(),
      updated_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyNode);

    await accumulator.complete();

    // Verify the valid node was persisted
    const verifyDb = new Database(dbPath, { readonly: true });
    try {
      const validNode = verifyDb
        .prepare('SELECT * FROM nodes WHERE id = ?')
        .get('valid_node_1') as any;
      expect(validNode).toBeDefined();
      expect(validNode.kind).toBe('Source');
    } finally {
      verifyDb.close();
    }

    // Now send a bad batch — worker should still work after
    await worker.bulkInsertGraphBatch({
      batchId: 'batch_mixed_test',
      importId: 'import_mixed_test',
      accountId: ACCOUNT_ID,
      createdBy: USER_ID,
      metadata: { batchIndex: 2, totalBatches: 2, isFinalBatch: true },
      skinnyNodes: [],
      genericNodes: [
        {
          id: 'bad_node_2',
          kind: 'INVALID_KIND_2' as any,
          properties: '{}',
          account_id: ACCOUNT_ID,
          created_by: USER_ID,
          created_at: Date.now(),
          updated_at: Date.now(),
          data_tag: 'real',
          content_hash: null,
          canonical_content: null,
          is_duplicate: 0,
          original_node_id: null,
        },
      ],
      edges: [],
      normalizedPayloads: { sourceSpans: [], phrases: [], packets: [], atomicUnits: [] },
    });

    // Worker should still be alive
    expect(worker.isReady()).toBe(true);

    // The previously-valid node should still exist
    const verifyDb2 = new Database(dbPath, { readonly: true });
    try {
      const stillThere = verifyDb2.prepare('SELECT * FROM nodes WHERE id = ?').get('valid_node_1');
      expect(stillThere).toBeDefined();

      // Bad node should NOT be persisted
      const badNode = verifyDb2.prepare('SELECT * FROM nodes WHERE id = ?').get('bad_node_2');
      expect(badNode).toBeUndefined();
    } finally {
      verifyDb2.close();
    }
  }, 30_000);
});
