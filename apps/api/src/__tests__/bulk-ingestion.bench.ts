/**
 * Bulk Ingestion Benchmark — Epic 3
 *
 * Compares legacy DatabaseWriteQueue path vs. new BulkGraphWriteSink path.
 * Uses createBulkTestDb() for schema-compatible test databases and includes
 * Source → SourceSpan → Phrase semantic spine graph shapes.
 */

import { createBulkTestDb } from './utils/test-db';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseClient } from '@keimenon/db';
import { DatabaseWriteQueue } from '../services/DatabaseWriteQueue';
import { GraphBatchAccumulator } from '../services/GraphBatchAccumulator';
import { BulkGraphWriteSink, GraphWriteSink } from '../services/GraphWriteSink';
import { DbWorkerClient } from '../workers/DbWorkerClient';
import { AnyNode, AnyEdge } from '@keimenon/types';

function generateSemanticSpineData(
  numSources: number,
  spansPerSource: number,
  phrasesPerSpan: number
): { nodes: AnyNode[]; edges: AnyEdge[] } {
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];
  const accountId = 'acc_test';
  const userId = 'user_test';
  const now = Date.now();
  let edgeIdx = 0;

  for (let s = 0; s < numSources; s++) {
    const sourceId = `source_${s}`;
    nodes.push({
      id: sourceId,
      kind: 'Source',
      account_id: accountId,
      created_by: userId,
      properties: JSON.stringify({ title: `Source ${s}`, text: `Content of source ${s}` }),
      created_at: now,
      updated_at: now,
      data_tag: 'real',
    } as unknown as AnyNode);

    for (let sp = 0; sp < spansPerSource; sp++) {
      const spanId = `span_${s}_${sp}`;
      const spanText = `Sentence ${sp} from source ${s} with important content about testing.`;

      nodes.push({
        id: spanId,
        kind: 'SourceSpan',
        account_id: accountId,
        created_by: userId,
        properties: JSON.stringify({
          source_id: sourceId,
          text: spanText,
          normalized_text: spanText.toLowerCase(),
          start_char: sp * 80,
          end_char: sp * 80 + spanText.length,
          boundary_kind: 'sentence',
          span_hash: `hash_span_${s}_${sp}`,
        }),
        created_at: now,
        updated_at: now,
        data_tag: 'real',
      } as unknown as AnyNode);

      edges.push({
        id: `edge_${edgeIdx++}`,
        kind: 'HAS_SPAN',
        from: sourceId,
        to: spanId,
        account_id: accountId,
        created_by: userId,
        properties: '{}',
        created_at: now,
        data_tag: 'real',
      } as unknown as AnyEdge);

      for (let p = 0; p < phrasesPerSpan; p++) {
        const phraseId = `phrase_${s}_${sp}_${p}`;
        const phraseText = `phrase_${p}`;

        nodes.push({
          id: phraseId,
          kind: 'Phrase',
          account_id: accountId,
          created_by: userId,
          properties: JSON.stringify({
            text: phraseText,
            normalized_text: phraseText.toLowerCase(),
            type: 'n-gram',
            frequency: Math.floor(Math.random() * 10),
          }),
          created_at: now,
          updated_at: now,
          data_tag: 'real',
        } as unknown as AnyNode);

        edges.push({
          id: `edge_${edgeIdx++}`,
          kind: 'OCCURS_IN_SPAN',
          from: phraseId,
          to: spanId,
          account_id: accountId,
          created_by: userId,
          properties: '{}',
          created_at: now,
          data_tag: 'real',
        } as unknown as AnyEdge);
      }
    }

    // Add some Packets and AtomicUnits per source
    const packetId = `packet_${s}`;
    nodes.push({
      id: packetId,
      kind: 'Packet',
      account_id: accountId,
      created_by: userId,
      properties: JSON.stringify({
        text: `packet content ${s}`,
        normalized_text: `packet content ${s}`,
        occurrences: 1,
        mass: Math.random() * 10,
        coverage: Math.random(),
        idf: Math.random() * 5,
        entropy_factor: Math.random(),
        packet_hash: `hash_packet_${s}`,
      }),
      created_at: now,
      updated_at: now,
      data_tag: 'real',
    } as unknown as AnyNode);

    edges.push({
      id: `edge_${edgeIdx++}`,
      kind: 'COMPOSED_OF_ATOMIC',
      from: sourceId,
      to: packetId,
      account_id: accountId,
      created_by: userId,
      properties: '{}',
      created_at: now,
      data_tag: 'real',
    } as unknown as AnyEdge);

    const auId = `au_${s}`;
    nodes.push({
      id: auId,
      kind: 'AtomicUnit',
      account_id: accountId,
      created_by: userId,
      properties: JSON.stringify({
        unit_type: 'word',
        value: `atomic_${s}`,
        normalized_value: `atomic_${s}`,
        unit_hash: `hash_au_${s}`,
      }),
      created_at: now,
      updated_at: now,
      data_tag: 'real',
    } as unknown as AnyNode);

    edges.push({
      id: `edge_${edgeIdx++}`,
      kind: 'COMPOSED_OF_ATOMIC',
      from: packetId,
      to: auId,
      account_id: accountId,
      created_by: userId,
      properties: '{}',
      created_at: now,
      data_tag: 'real',
    } as unknown as AnyEdge);
  }

  return { nodes, edges };
}

async function runBenchmark() {
  console.log('--- Starting Bulk Ingestion Benchmark (Epic 3 Hardened) ---');

  // Generate semantic spine data: 50 sources × 10 spans × 3 phrases + packets + atomic units
  const numSources = 50;
  const spansPerSource = 10;
  const phrasesPerSpan = 3;

  console.log(
    `Generating spine data: ${numSources} sources × ${spansPerSource} spans × ${phrasesPerSpan} phrases...`
  );
  const data = generateSemanticSpineData(numSources, spansPerSource, phrasesPerSpan);
  console.log(`Generated ${data.nodes.length} nodes and ${data.edges.length} edges`);

  // Count by kind
  const kindCounts: Record<string, number> = {};
  for (const n of data.nodes) {
    kindCounts[n.kind] = (kindCounts[n.kind] || 0) + 1;
  }
  const edgeKindCounts: Record<string, number> = {};
  for (const e of data.edges) {
    edgeKindCounts[e.kind] = (edgeKindCounts[e.kind] || 0) + 1;
  }
  console.log('Node breakdown:', kindCounts);
  console.log('Edge breakdown:', edgeKindCounts);

  // Define structures for results
  const metrics: any = {
    legacy: {},
    bulk: {},
    verification: {},
  };

  // Event Loop Drift Tracker
  function createDriftTracker() {
    const drifts: number[] = [];
    const interval = setInterval(() => {
      const start = performance.now();
      setImmediate(() => {
        drifts.push(performance.now() - start);
      });
    }, 10);
    return {
      stop: () => {
        clearInterval(interval);
        const max = drifts.length ? Math.max(...drifts) : 0;
        const avg = drifts.length ? drifts.reduce((a, b) => a + b, 0) / drifts.length : 0;
        return { max, avg };
      },
    };
  }

  // 2. Test Bulk Pipeline (off-thread DB worker)
  console.log('\n[Bulk Pipeline] Initializing...');

  const tmpPath = path.join(os.tmpdir(), `bench-${Date.now()}.db`);
  const fileDb = new Database(tmpPath);

  const schemaPath = path.resolve(__dirname, '../../../../packages/db/src/sqlite/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  fileDb.exec(schemaSql);

  // Seed required account/user
  const now = Date.now();
  fileDb
    .prepare(
      `INSERT OR IGNORE INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
     VALUES ('acc_test', 'client', 'free', 'bench@test.com', 'Bench Account', ?, ?)`
    )
    .run(now, now);
  fileDb
    .prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at, primary_account_id)
     VALUES ('user_test', 'benchuser@test.com', 'hash', 'Bench User', 'admin', 'person', 1, ?, ?, 'acc_test')`
    )
    .run(now, now);
  fileDb
    .prepare(
      `INSERT OR IGNORE INTO user_accounts (id, user_id, account_id, permission_level, role_rank, joined_at, created_at, updated_at)
     VALUES ('ua_bench', 'user_test', 'acc_test', 'admin', 1, ?, ?, ?)`
    )
    .run(now, now, now);

  const dbWorker = new DbWorkerClient(tmpPath);
  await dbWorker.start();

  const sink = new BulkGraphWriteSink(dbWorker as any, (prog) => {
    // Optional progress logging
  });
  const accumulator = new GraphBatchAccumulator(sink, 'acc_test', 'user_test', 'bench-bulk');

  const tracker = createDriftTracker();
  const start = Date.now();
  for (const node of data.nodes) {
    await accumulator.addNode(node);
  }
  for (const edge of data.edges) {
    await accumulator.addEdge(edge);
  }
  await accumulator.complete();

  const end = Date.now();
  const bulkDrift = tracker.stop();
  metrics.bulk = {
    wallTimeMs: end - start,
    maxEventLoopDriftMs: bulkDrift.max,
    avgEventLoopDriftMs: bulkDrift.avg,
  };
  console.log(`[Bulk Pipeline] Completed in ${metrics.bulk.wallTimeMs}ms`);
  console.log(
    `[Bulk Pipeline] Event loop drift: max ${bulkDrift.max.toFixed(2)}ms, avg ${bulkDrift.avg.toFixed(2)}ms`
  );

  // Verify data integrity and sizes
  const verifyDb = new Database(tmpPath, { readonly: true });
  const nodeCount = (verifyDb.prepare('SELECT COUNT(*) as c FROM nodes').get() as any).c;
  const edgeCount = (verifyDb.prepare('SELECT COUNT(*) as c FROM edges').get() as any).c;
  const spanCount = (verifyDb.prepare('SELECT COUNT(*) as c FROM source_spans').get() as any).c;
  const phraseCount = (verifyDb.prepare('SELECT COUNT(*) as c FROM phrases').get() as any).c;
  const packetCount = (verifyDb.prepare('SELECT COUNT(*) as c FROM packets').get() as any).c;
  const auCount = (verifyDb.prepare('SELECT COUNT(*) as c FROM atomic_units').get() as any).c;

  let quarantineCount = 0;
  try {
    quarantineCount = (verifyDb.prepare('SELECT COUNT(*) as c FROM data_quarantine').get() as any)
      .c;
  } catch (e) {
    // Table might not exist if migration hasn't run, though schema.sql should have it
  }

  // Get file sizes
  const dbStat = fs.statSync(tmpPath);
  let walStat = { size: 0 };
  try {
    walStat = fs.statSync(tmpPath + '-wal');
  } catch (e) {
    // Ignore if WAL file doesn't exist
  }

  metrics.verification = {
    dbSizeBytes: dbStat.size,
    walSizeBytes: walStat.size,
    counts: {
      nodes: nodeCount,
      edges: edgeCount,
      spans: spanCount,
      phrases: phraseCount,
      packets: packetCount,
      atomicUnits: auCount,
      quarantine: quarantineCount,
    },
  };

  console.log(
    `\n[Verification] nodes=${nodeCount} edges=${edgeCount} spans=${spanCount} phrases=${phraseCount} packets=${packetCount} au=${auCount} quarantine=${quarantineCount}`
  );
  console.log(
    `[Database Size] DB: ${(dbStat.size / 1024 / 1024).toFixed(2)}MB, WAL: ${(walStat.size / 1024 / 1024).toFixed(2)}MB`
  );

  verifyDb.close();
  await dbWorker.stop();
  fileDb.close();
  try {
    fs.unlinkSync(tmpPath);
    if (fs.existsSync(tmpPath + '-wal')) fs.unlinkSync(tmpPath + '-wal');
    if (fs.existsSync(tmpPath + '-shm')) fs.unlinkSync(tmpPath + '-shm');
  } catch (e) {
    // Ignore cleanup errors
  }

  console.log('\n--- Structured JSON Summary ---');
  console.log(JSON.stringify(metrics, null, 2));
  console.log('--- Benchmark Complete ---');
}

runBenchmark().catch(console.error);
