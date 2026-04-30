import { createTestDb } from './utils/test-db';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseClient } from '@keimenon/db';
import { DatabaseWriteQueue } from '../services/DatabaseWriteQueue';
import { GraphBatchAccumulator } from '../services/GraphBatchAccumulator';
import { BulkGraphWriteSink, LegacyQueuedGraphWriteSink } from '../services/GraphWriteSink';
import { DbWorkerClient } from '../workers/DbWorkerClient';
import { AnyNode, AnyEdge } from '@keimenon/types';

async function generateData(
  numNodes: number,
  numEdges: number
): Promise<{ nodes: AnyNode[]; edges: AnyEdge[] }> {
  const nodes: AnyNode[] = [];
  const edges: AnyEdge[] = [];
  const accountId = 'acc_bench';

  for (let i = 0; i < numNodes; i++) {
    nodes.push({
      id: `node_${i}`,
      kind: 'Message',
      account_id: accountId,
      created_by: 'user_bench',
      properties: JSON.stringify({ content: `This is test message ${i}` }),
      created_at: Date.now(),
      updated_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyNode);
  }

  for (let i = 0; i < numEdges; i++) {
    edges.push({
      id: `edge_${i}`,
      kind: 'RepliesTo',
      from: `node_${i}`,
      to: `node_${Math.max(0, i - 1)}`,
      account_id: accountId,
      created_by: 'user_bench',
      properties: '{}',
      created_at: Date.now(),
      data_tag: 'real',
    } as unknown as AnyEdge);
  }

  return { nodes, edges };
}

async function runBenchmark() {
  console.log('--- Starting Bulk Ingestion Benchmark ---');

  const numNodes = 5000;
  const numEdges = 5000;

  console.log(`Generating ${numNodes} nodes and ${numEdges} edges...`);
  const data = await generateData(numNodes, numEdges);

  // 1. Test Legacy Queue (Off-thread disabled)
  console.log('\n[Legacy Queue] Initializing...');
  let db = createTestDb();
  let queue = new DatabaseWriteQueue(db as unknown as DatabaseClient);
  let sink = new LegacyQueuedGraphWriteSink(queue);
  let accumulator = new GraphBatchAccumulator(sink, 'acc_bench', 'user_bench');

  let start = Date.now();
  for (const node of data.nodes) {
    await accumulator.addNode(node);
  }
  for (const edge of data.edges) {
    await accumulator.addEdge(edge);
  }
  await accumulator.complete();

  let end = Date.now();
  console.log(`[Legacy Queue] Completed in ${end - start}ms`);

  // 2. Test Bulk Pipeline (Off-thread DB worker)
  console.log('\n[Bulk Pipeline] Initializing...');

  const tmpPath = path.join(os.tmpdir(), `bench-${Date.now()}.db`);
  const fileDb = new Database(tmpPath);

  const schemaPath = path.resolve(__dirname, '../../../../packages/db/src/sqlite/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  fileDb.exec(schemaSql);

  const dbWorker = new DbWorkerClient(tmpPath);
  await dbWorker.start();

  sink = new BulkGraphWriteSink(dbWorker as any, (prog) => {
    // Optional: log progress
  });
  accumulator = new GraphBatchAccumulator(sink, 'acc_bench', 'user_bench');

  start = Date.now();
  for (const node of data.nodes) {
    await accumulator.addNode(node);
  }
  for (const edge of data.edges) {
    await accumulator.addEdge(edge);
  }
  await accumulator.complete();

  end = Date.now();
  console.log(`[Bulk Pipeline] Completed in ${end - start}ms`);

  await dbWorker.stop();
  fileDb.close();
  try {
    fs.unlinkSync(tmpPath);
  } catch (e) {}

  console.log('\n--- Benchmark Complete ---');
}

runBenchmark().catch(console.error);
