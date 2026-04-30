/**
 * DB Worker Thread
 *
 * Runs long-running SQLite operations off the main Node.js event loop.
 * Opens its own better-sqlite3 connection in WAL mode (concurrent reads
 * from the main thread are safe).
 *
 * This file runs as a worker_threads Worker. It must NOT import anything
 * that depends on Express, SSE, or the main-thread DatabaseClient.
 */

import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';
import type {
  DbWorkerInit,
  DbWorkerOperation,
  DbWorkerMessage,
  FlushImportBatchResult,
  ComputeAuthorityResult,
  DeleteSubgraphResult,
  RebuildInvertedIndexResult,
  HealthCheckResult,
  SerializedNode,
  SerializedEdge,
} from './db-worker-protocol';

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

const init = workerData as DbWorkerInit;
if (!parentPort) {
  throw new Error('[db-worker] Must be run as a worker_threads Worker');
}

let db: Database.Database;

try {
  db = new Database(init.dbPath);

  // Mirror the pragma setup from packages/db/src/sqlite/client.ts
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 30000');
  db.pragma('cache_size = -64000'); // 64 MB
  db.pragma('foreign_keys = ON');

  console.log(`[db-worker] Connected to SQLite at: ${init.dbPath}`);
} catch (err: any) {
  console.error(`[db-worker] Failed to open database: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const port = parentPort;

function sendResult(id: string, data: unknown): void {
  const msg: DbWorkerMessage = { type: 'result', id, data };
  port.postMessage(msg);
}

function sendError(id: string, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const msg: DbWorkerMessage = {
    type: 'error',
    id,
    error: error.message,
    stack: error.stack,
  };
  port.postMessage(msg);
}

function sendProgress(
  id: string,
  phase: string,
  current: number,
  total: number,
  message?: string
): void {
  const msg: DbWorkerMessage = {
    type: 'progress',
    id,
    progress: { phase, current, total, message },
  };
  port.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Operation: flushImportBatch
// ---------------------------------------------------------------------------

// Prepared statements (created lazily, reused across flushes)
let insertNodeStmt: Database.Statement | null = null;
let insertEdgeStmt: Database.Statement | null = null;
let insertSourceSpanStmt: Database.Statement | null = null;
let insertPhraseStmt: Database.Statement | null = null;
let insertPacketStmt: Database.Statement | null = null;
let insertAtomicUnitStmt: Database.Statement | null = null;
let insertQuarantineStmt: Database.Statement | null = null;

function ensureStatements(): void {
  if (!insertNodeStmt) {
    insertNodeStmt = db.prepare(`
      INSERT OR REPLACE INTO nodes (
        id, kind, properties, account_id, created_by, created_at, updated_at,
        data_tag, content_hash, canonical_content, is_duplicate, original_node_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  if (!insertEdgeStmt) {
    insertEdgeStmt = db.prepare(`
      INSERT OR REPLACE INTO edges (
        id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  if (!insertSourceSpanStmt) {
    insertSourceSpanStmt = db.prepare(`
      INSERT OR REPLACE INTO source_spans (
        id, account_id, source_id, message_id, conversation_id, text, normalized_text,
        start_char, end_char, boundary_kind, span_hash, created_by, created_at, updated_at, data_tag, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  if (!insertPhraseStmt) {
    insertPhraseStmt = db.prepare(`
      INSERT OR REPLACE INTO phrases (
        id, account_id, text, normalized_text, type, entity_type, frequency,
        created_by, created_at, updated_at, data_tag, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  if (!insertPacketStmt) {
    insertPacketStmt = db.prepare(`
      INSERT OR REPLACE INTO packets (
        id, account_id, text, normalized_text, occurrences, mass, coverage, idf, entropy_factor, packet_hash,
        created_by, created_at, updated_at, data_tag, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  if (!insertAtomicUnitStmt) {
    insertAtomicUnitStmt = db.prepare(`
      INSERT OR REPLACE INTO atomic_units (
        id, account_id, unit_type, value, normalized_value, unit_hash,
        created_by, created_at, updated_at, data_tag, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  if (!insertQuarantineStmt) {
    insertQuarantineStmt = db.prepare(`
      INSERT INTO bulk_insert_quarantine (
        id, account_id, batch_id, import_id, row_kind, row_id, reason, error_message, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
}

function handleFlushImportBatch(
  id: string,
  nodes: SerializedNode[],
  edges: SerializedEdge[]
): void {
  ensureStatements();

  let nodesWritten = 0;
  let edgesWritten = 0;
  let fkFailures = 0;

  // Write nodes first (edges reference them via foreign keys)
  const writeNodes = db.transaction((batch: SerializedNode[]) => {
    for (const node of batch) {
      if (node.kind === 'SourceSpan') {
        const props = JSON.parse(node.properties);
        insertSourceSpanStmt!.run(
          node.id,
          node.account_id,
          props.source_id,
          props.message_id || null,
          props.conversation_id || null,
          props.text,
          props.normalized_text,
          props.start_char,
          props.end_char,
          props.boundary_kind || 'sentence',
          props.span_hash,
          node.created_by,
          node.created_at,
          node.updated_at,
          node.data_tag,
          props.metadata ? JSON.stringify(props.metadata) : null
        );
      } else if (node.kind === 'Phrase') {
        const props = JSON.parse(node.properties);
        insertPhraseStmt!.run(
          node.id,
          node.account_id,
          props.text,
          props.normalized_text,
          props.type || 'n-gram',
          props.entity_type || null,
          props.frequency || 0,
          node.created_by,
          node.created_at,
          node.updated_at,
          node.data_tag,
          props.metadata ? JSON.stringify(props.metadata) : null
        );
      } else if (node.kind === 'Packet') {
        const props = JSON.parse(node.properties);
        insertPacketStmt!.run(
          node.id,
          node.account_id,
          props.text,
          props.normalized_text,
          props.occurrences || 1,
          props.mass || 0,
          props.coverage || 0,
          props.idf || 0,
          props.entropy_factor || 0,
          props.packet_hash,
          node.created_by,
          node.created_at,
          node.updated_at,
          node.data_tag,
          props.metadata ? JSON.stringify(props.metadata) : null
        );
      } else if (node.kind === 'AtomicUnit') {
        const props = JSON.parse(node.properties);
        insertAtomicUnitStmt!.run(
          node.id,
          node.account_id,
          props.unit_type,
          props.value,
          props.normalized_value,
          props.unit_hash,
          node.created_by,
          node.created_at,
          node.updated_at,
          node.data_tag,
          props.metadata ? JSON.stringify(props.metadata) : null
        );
      } else {
        insertNodeStmt!.run(
          node.id,
          node.kind,
          node.properties,
          node.account_id,
          node.created_by,
          node.created_at,
          node.updated_at,
          node.data_tag,
          node.content_hash,
          node.canonical_content,
          node.is_duplicate,
          node.original_node_id
        );
      }
      nodesWritten++;
    }
  });

  if (nodes.length > 0) {
    writeNodes(nodes);
  }

  // Write edges (individual writes to handle FK failures gracefully)
  if (edges.length > 0) {
    for (const edge of edges) {
      try {
        insertEdgeStmt!.run(
          edge.id,
          edge.kind,
          edge.from_id,
          edge.to_id,
          edge.properties,
          edge.account_id,
          edge.created_by,
          edge.created_at,
          edge.data_tag
        );
        edgesWritten++;
      } catch (err: any) {
        const msg = String(err?.message || '').toUpperCase();
        if (
          msg.includes('FOREIGN KEY CONSTRAINT FAILED') ||
          msg.includes('SQLITE_CONSTRAINT_FOREIGNKEY')
        ) {
          fkFailures++;
        } else {
          throw err; // Re-throw non-FK errors
        }
      }
    }
  }

  const result: FlushImportBatchResult = {
    nodesWritten,
    edgesWritten,
    totalWritten: nodesWritten + edgesWritten,
    fkFailures,
  };
  sendResult(id, result);
}

// ---------------------------------------------------------------------------
// Operation: bulkInsertGraphBatch
// ---------------------------------------------------------------------------

import type { GraphBatchPayload, BatchResult, BulkProgressEvent } from './db-worker-protocol';

function sendBulkProgress(id: string, progress: BulkProgressEvent): void {
  const msg: DbWorkerMessage = {
    type: 'bulk_progress',
    id,
    progress,
  };
  port.postMessage(msg);
}

function handleBulkInsertGraphBatch(id: string, payload: GraphBatchPayload): void {
  ensureStatements();
  const start = Date.now();
  let lastProgressMs = start;

  let nodesWritten = 0;
  let edgesWritten = 0;
  let payloadsWritten = 0;
  let quarantinedRows = 0;

  const emitProgress = (phase: BulkProgressEvent['phase'], force = false, errorMsg?: string) => {
    const now = Date.now();
    if (force || now - lastProgressMs >= 100) {
      sendBulkProgress(id, {
        batchId: payload.batchId,
        phase,
        batchIndex: payload.metadata.batchIndex,
        totalBatches: payload.metadata.totalBatches,
        nodesWritten,
        edgesWritten,
        payloadsWritten,
        quarantinedRows,
        elapsedMs: now - start,
        error: errorMsg,
      });
      lastProgressMs = now;
    }
  };

  const writeQuarantine = (
    kind: string,
    rowId: string,
    reason: string,
    errMessage: string,
    rowPayload: any
  ) => {
    insertQuarantineStmt!.run(
      `quar_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      payload.accountId,
      payload.batchId,
      payload.importId || null,
      kind,
      rowId,
      reason,
      errMessage,
      JSON.stringify(rowPayload),
      Date.now()
    );
    quarantinedRows++;
  };

  const quarantinedNodeIds = new Set<string>();

  emitProgress('validate', true);

  db.exec('BEGIN IMMEDIATE');
  db.pragma('defer_foreign_keys = ON');

  try {
    // 1. Skinny Nodes & Generic Nodes
    emitProgress('insert_nodes', true);

    // Attempt skinny nodes
    for (const node of payload.skinnyNodes) {
      try {
        insertNodeStmt!.run(
          node.id,
          node.kind,
          '{}',
          node.account_id,
          node.created_by,
          node.created_at,
          node.updated_at,
          node.data_tag,
          node.content_hash,
          node.canonical_content,
          node.is_duplicate,
          node.original_node_id
        );
        nodesWritten++;
        emitProgress('insert_nodes');
      } catch (err: any) {
        writeQuarantine('node', node.id, 'SKINNY_NODE_INSERT_FAILED', err.message, node);
        quarantinedNodeIds.add(node.id);
      }
    }

    // Attempt generic nodes
    for (const node of payload.genericNodes) {
      try {
        insertNodeStmt!.run(
          node.id,
          node.kind,
          node.properties,
          node.account_id,
          node.created_by,
          node.created_at,
          node.updated_at,
          node.data_tag,
          node.content_hash,
          node.canonical_content,
          node.is_duplicate,
          node.original_node_id
        );
        nodesWritten++;
        emitProgress('insert_nodes');
      } catch (err: any) {
        writeQuarantine('node', node.id, 'GENERIC_NODE_INSERT_FAILED', err.message, node);
        quarantinedNodeIds.add(node.id);
      }
    }

    emitProgress('insert_payloads', true);

    // 2. Normalized Payloads
    const writePayloadRow = (kind: string, row: any, runInsert: () => void) => {
      const nodeId = row.node_id;
      if (quarantinedNodeIds.has(nodeId)) {
        writeQuarantine(
          kind,
          nodeId,
          'MISSING_ENDPOINT_DUE_TO_QUARANTINED_NODE',
          'Node was quarantined earlier in batch',
          row
        );
        return;
      }
      try {
        runInsert();
        payloadsWritten++;
        emitProgress('insert_payloads');
      } catch (err: any) {
        writeQuarantine(kind, nodeId, 'PAYLOAD_INSERT_FAILED', err.message, row);
      }
    };

    for (const span of payload.normalizedPayloads.sourceSpans) {
      writePayloadRow('source_span', span, () => {
        insertSourceSpanStmt!.run(
          span.node_id,
          payload.accountId,
          span.source_id,
          null,
          null,
          span.text,
          span.text.toLowerCase(),
          span.start_index,
          span.end_index,
          'sentence',
          'hash-placeholder',
          payload.createdBy,
          Date.now(),
          Date.now(),
          'real',
          null
        );
      });
    }

    for (const phrase of payload.normalizedPayloads.phrases) {
      writePayloadRow('phrase', phrase, () => {
        insertPhraseStmt!.run(
          phrase.node_id,
          payload.accountId,
          phrase.text,
          phrase.text.toLowerCase(),
          'n-gram',
          null,
          phrase.token_count,
          payload.createdBy,
          Date.now(),
          Date.now(),
          'real',
          null
        );
      });
    }

    for (const packet of payload.normalizedPayloads.packets) {
      writePayloadRow('packet', packet, () => {
        insertPacketStmt!.run(
          packet.node_id,
          payload.accountId,
          packet.content,
          packet.content.toLowerCase(),
          1,
          0,
          0,
          0,
          0,
          'hash-placeholder',
          payload.createdBy,
          Date.now(),
          Date.now(),
          'real',
          null
        );
      });
    }

    for (const au of payload.normalizedPayloads.atomicUnits) {
      writePayloadRow('atomic_unit', au, () => {
        insertAtomicUnitStmt!.run(
          au.node_id,
          payload.accountId,
          au.unit_type,
          au.content,
          au.content.toLowerCase(),
          'hash-placeholder',
          payload.createdBy,
          Date.now(),
          Date.now(),
          'real',
          null
        );
      });
    }

    emitProgress('insert_edges', true);

    // 3. Edges
    for (const edge of payload.edges) {
      if (quarantinedNodeIds.has(edge.from_id) || quarantinedNodeIds.has(edge.to_id)) {
        writeQuarantine(
          'edge',
          edge.id,
          'MISSING_ENDPOINT_DUE_TO_QUARANTINED_NODE',
          'One or both endpoints quarantined',
          edge
        );
        continue;
      }
      try {
        insertEdgeStmt!.run(
          edge.id,
          edge.kind,
          edge.from_id,
          edge.to_id,
          edge.properties,
          edge.account_id,
          edge.created_by,
          edge.created_at,
          edge.data_tag
        );
        edgesWritten++;
        emitProgress('insert_edges');
      } catch (err: any) {
        writeQuarantine('edge', edge.id, 'EDGE_INSERT_FAILED', err.message, edge);
      }
    }

    emitProgress('foreign_key_check', true);

    const violations = db.prepare('PRAGMA foreign_key_check').all() as any[];
    if (violations.length > 0) {
      throw new Error(`Foreign key check failed: ${JSON.stringify(violations.slice(0, 10))}`);
    }

    emitProgress('commit', true);
    db.exec('COMMIT');

    emitProgress('complete', true);

    const batchResult: BatchResult = {
      success: true,
      nodesWritten,
      edgesWritten,
      payloadsWritten,
      quarantinedRows,
    };
    sendResult(id, batchResult);
  } catch (err: any) {
    if (db.inTransaction) {
      db.exec('ROLLBACK');
    }
    emitProgress('error', true, err.message);
    const errResult: BatchResult = {
      success: false,
      nodesWritten: 0,
      edgesWritten: 0,
      payloadsWritten: 0,
      quarantinedRows: 0,
      error: err.message,
    };
    sendResult(id, errResult);
  }
}

// ---------------------------------------------------------------------------
// Operation: computeAuthority
// ---------------------------------------------------------------------------

function handleComputeAuthority(id: string, accountId: string): void {
  const start = Date.now();

  // Lazy-import the service (it only depends on better-sqlite3)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AuthorityScoringService } = require('../services/authority-scoring.service');
  const service = new AuthorityScoringService(db);
  const stats = service.computeAuthority(accountId);

  const result: ComputeAuthorityResult = {
    phraseScores: stats.phraseScores ?? 0,
    sourceScores: stats.sourceScores ?? 0,
    topicScores: stats.topicScores ?? 0,
    durationMs: Date.now() - start,
  };
  sendResult(id, result);
}

// ---------------------------------------------------------------------------
// Operation: rebuildInvertedIndex
// ---------------------------------------------------------------------------

function handleRebuildInvertedIndex(id: string, accountId: string): void {
  const start = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { InvertedIndexService } = require('../services/inverted-index.service');
  const service = new InvertedIndexService(db);

  if (!service.hasIndexTables()) {
    sendResult(id, {
      postingCount: 0,
      uniqueTerms: 0,
      sourceCount: 0,
      spanCount: 0,
      durationMs: Date.now() - start,
    } as RebuildInvertedIndexResult);
    return;
  }

  const stats = service.rebuildIndex(accountId);

  const result: RebuildInvertedIndexResult = {
    postingCount: stats.postingCount ?? 0,
    uniqueTerms: stats.uniqueTerms ?? 0,
    sourceCount: stats.sourceCount ?? 0,
    spanCount: stats.spanCount ?? 0,
    durationMs: Date.now() - start,
  };
  sendResult(id, result);
}

// ---------------------------------------------------------------------------
// Operation: deleteSubgraph
// ---------------------------------------------------------------------------

function handleDeleteSubgraph(
  id: string,
  accountId: string,
  scope: 'keimenon' | 'all-clients',
  isAdmin: boolean
): void {
  const start = Date.now();
  const BATCH_SIZE = 500;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getSystemNodeInClause } = require('@keimenon/types');
  const systemKindsClause = getSystemNodeInClause();

  // Build the count query
  let countQuery: string;
  let countParams: any[];

  if (scope === 'all-clients' && isAdmin) {
    countQuery = `SELECT COUNT(*) as count FROM nodes WHERE kind NOT IN (${systemKindsClause})`;
    countParams = [];
  } else {
    countQuery = `SELECT COUNT(*) as count FROM nodes WHERE account_id = ? AND kind NOT IN (${systemKindsClause})`;
    countParams = [accountId];
  }

  const totalNodes = (db.prepare(countQuery).get(...countParams) as { count: number })?.count ?? 0;

  if (totalNodes === 0) {
    sendResult(id, {
      nodesDeleted: 0,
      edgesDeleted: 0,
      durationMs: Date.now() - start,
    } as DeleteSubgraphResult);
    return;
  }

  sendProgress(id, 'delete', 0, totalNodes, `Deleting ${totalNodes} nodes...`);

  // Build the batch delete query
  let deleteQuery: string;
  let deleteParams: any[];

  if (scope === 'all-clients' && isAdmin) {
    deleteQuery = `DELETE FROM nodes WHERE rowid IN (
      SELECT rowid FROM nodes WHERE kind NOT IN (${systemKindsClause}) LIMIT ?
    )`;
    deleteParams = [BATCH_SIZE];
  } else {
    deleteQuery = `DELETE FROM nodes WHERE rowid IN (
      SELECT rowid FROM nodes WHERE account_id = ? AND kind NOT IN (${systemKindsClause}) LIMIT ?
    )`;
    deleteParams = [accountId, BATCH_SIZE];
  }

  // FTS trigger suppression + batch delete in a single transaction
  db.exec('BEGIN IMMEDIATE');

  let totalDeleted = 0;
  let batchNumber = 0;

  try {
    // Drop slow FTS triggers
    db.exec('DROP TRIGGER IF EXISTS nodes_fts_delete');
    db.exec('DROP TRIGGER IF EXISTS nodes_fts_update');
    db.exec('DROP TRIGGER IF EXISTS messages_fts_duplicate_delete');
    db.exec('DROP TRIGGER IF EXISTS messages_fts_duplicate_update');

    // Manual FTS cleanup and drop normalized table records
    if (scope === 'all-clients' && isAdmin) {
      db.exec('DELETE FROM messages_fts_duplicate');
      db.exec('DELETE FROM nodes_fts');
      db.exec('DELETE FROM source_spans');
      db.exec('DELETE FROM phrases');
      db.exec('DELETE FROM packets');
      db.exec('DELETE FROM atomic_units');
    } else {
      db.prepare('DELETE FROM messages_fts_duplicate WHERE account_id = ?').run(accountId);
      db.prepare(
        `DELETE FROM nodes_fts WHERE id IN (SELECT id FROM nodes WHERE account_id = ? AND kind NOT IN (${systemKindsClause}))`
      ).run(accountId);
      db.prepare('DELETE FROM source_spans WHERE account_id = ?').run(accountId);
      db.prepare('DELETE FROM phrases WHERE account_id = ?').run(accountId);
      db.prepare('DELETE FROM packets WHERE account_id = ?').run(accountId);
      db.prepare('DELETE FROM atomic_units WHERE account_id = ?').run(accountId);
    }

    const deleteStmt = db.prepare(deleteQuery);

    // Batch delete loop
    while (true) {
      batchNumber++;
      const result = deleteStmt.run(...deleteParams);
      const batchDeleted = Number(result.changes || 0);

      if (batchDeleted === 0) break;

      totalDeleted += batchDeleted;

      if (batchNumber % 10 === 0 || batchNumber <= 3) {
        sendProgress(
          id,
          'delete',
          totalDeleted,
          totalNodes,
          `Deleted ${totalDeleted}/${totalNodes} nodes (batch ${batchNumber})`
        );
      }
    }

    // Recreate FTS triggers
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
        DELETE FROM nodes_fts WHERE id = old.id;
        INSERT INTO nodes_fts(id, content) VALUES (new.id, new.properties);
      END;
      CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
        DELETE FROM nodes_fts WHERE id = old.id;
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_update
      AFTER UPDATE ON nodes
      WHEN new.kind = 'Message'
        AND (old.canonical_content != new.canonical_content OR old.canonical_content IS NULL)
        AND new.canonical_content IS NOT NULL
      BEGIN
        DELETE FROM messages_fts_duplicate WHERE node_id = old.id;
        INSERT INTO messages_fts_duplicate(node_id, content, account_id)
        VALUES (new.id, new.canonical_content, new.account_id);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_duplicate_delete
      AFTER DELETE ON nodes
      WHEN old.kind = 'Message'
      BEGIN
        DELETE FROM messages_fts_duplicate WHERE node_id = old.id;
      END;
    `);

    db.exec('COMMIT');
  } catch (err) {
    if (db.inTransaction) {
      db.exec('ROLLBACK');
    }
    throw err;
  }

  // Delete orphaned edges
  let edgesDeleted = 0;
  try {
    sendProgress(id, 'edges', 0, 1, 'Cleaning up orphaned edges...');

    if (scope === 'all-clients' && isAdmin) {
      const edgeResult = db
        .prepare(`DELETE FROM edges WHERE kind NOT IN (${systemKindsClause})`)
        .run();
      edgesDeleted = Number(edgeResult.changes || 0);
    } else {
      const edgeResult = db
        .prepare(
          'DELETE FROM edges WHERE account_id = ? AND from_id NOT IN (SELECT id FROM nodes) OR to_id NOT IN (SELECT id FROM nodes)'
        )
        .run(accountId);
      edgesDeleted = Number(edgeResult.changes || 0);
    }
  } catch (err: any) {
    console.warn(`[db-worker] Edge cleanup warning: ${err.message}`);
  }

  const result: DeleteSubgraphResult = {
    nodesDeleted: totalDeleted,
    edgesDeleted,
    durationMs: Date.now() - start,
  };
  sendResult(id, result);
}

// ---------------------------------------------------------------------------
// Operation: healthCheck
// ---------------------------------------------------------------------------

function handleHealthCheck(id: string): void {
  const nodeCount = (db.prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number }).c;
  const edgeCount = (db.prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number }).c;

  const result: HealthCheckResult = {
    ok: true,
    dbPath: init.dbPath,
    nodeCount,
    edgeCount,
  };
  sendResult(id, result);
}

// ---------------------------------------------------------------------------
// Message dispatcher
// ---------------------------------------------------------------------------

port.on('message', (op: DbWorkerOperation) => {
  const opId = op.id;
  try {
    switch (op.type) {
      case 'flushImportBatch':
        handleFlushImportBatch(op.id, op.payload.nodes, op.payload.edges);
        break;
      case 'bulkInsertGraphBatch':
        handleBulkInsertGraphBatch(op.id, (op as any).payload);
        break;
      case 'computeAuthority':
        handleComputeAuthority(op.id, op.payload.accountId);
        break;
      case 'deleteSubgraph':
        handleDeleteSubgraph(op.id, op.payload.accountId, op.payload.scope, op.payload.isAdmin);
        break;
      case 'rebuildInvertedIndex':
        handleRebuildInvertedIndex(op.id, op.payload.accountId);
        break;
      case 'healthCheck':
        handleHealthCheck(op.id);
        break;
      default:
        sendError(opId, new Error(`Unknown operation type: ${(op as any).type}`));
    }
  } catch (err) {
    sendError(opId, err);
  }
});

// Signal readiness
port.postMessage({ type: 'ready' });
