import { DatabaseWriteQueue } from './DatabaseWriteQueue';
import { DbWorkerClient } from '../workers/DbWorkerClient';
import { GraphBatchPayload, BatchResult, BulkProgressEvent } from '../workers/db-worker-protocol';
import { AnyNode, AnyEdge } from '@keimenon/types';

export interface GraphWriteSink {
  writeGraphBatch(batch: GraphBatchPayload): Promise<BatchResult>;
  flush(): Promise<void>;
}

export class BulkGraphWriteSink implements GraphWriteSink {
  constructor(
    private dbWorker: DbWorkerClient,
    private onProgress?: (progress: BulkProgressEvent) => void
  ) {}

  async writeGraphBatch(batch: GraphBatchPayload): Promise<BatchResult> {
    return this.dbWorker.bulkInsertGraphBatch(batch, this.onProgress);
  }

  async flush(): Promise<void> {
    // Bulk graph writes are processed as discrete transactions off-thread immediately,
    // so there is no internal buffer to flush here.
  }
}

export class LegacyQueuedGraphWriteSink implements GraphWriteSink {
  constructor(private queue: DatabaseWriteQueue) {}

  async writeGraphBatch(batch: GraphBatchPayload): Promise<BatchResult> {
    // For legacy fallback, we unpack the graph batch back into AnyNode and AnyEdge
    // and queue them up in the DatabaseWriteQueue.
    // Note: this involves deserialization back to AnyNode which isn't perfectly efficient
    // but this is specifically the fallback path.

    let nodesAdded = 0;
    let edgesAdded = 0;
    let payloadsWritten = 0;

    const nodesToQueue: AnyNode[] = [];

    // Skinny nodes: reconstruct from properties (JSON-serialized node)
    for (const n of batch.skinnyNodes) {
      try {
        const parsed = JSON.parse(n.properties);
        // Ensure the parsed node has at minimum id and kind
        if (parsed && typeof parsed === 'object') {
          parsed.id = parsed.id || n.id;
          parsed.kind = parsed.kind || n.kind;
          parsed.account_id = parsed.account_id || n.account_id;
          parsed.created_by = parsed.created_by || n.created_by;
          parsed.created_at = parsed.created_at || n.created_at;
          parsed.updated_at = parsed.updated_at || n.updated_at;
          nodesToQueue.push(parsed as AnyNode);
        }
      } catch {
        // Skip malformed skinny nodes — they can't be queued via legacy path
        console.warn(`[LegacyQueuedGraphWriteSink] Skipping malformed skinny node ${n.id}`);
      }
    }

    for (const gn of batch.genericNodes) {
      try {
        const parsed = JSON.parse(gn.properties);
        if (parsed && typeof parsed === 'object') {
          nodesToQueue.push(parsed as AnyNode);
        }
      } catch {
        console.warn(`[LegacyQueuedGraphWriteSink] Skipping malformed generic node ${gn.id}`);
      }
    }

    // ── Normalized payload persistence ────────────────────────────────
    // Convert normalized payload rows back into AnyNode objects that
    // SQLiteClient.createNode already knows how to persist into their
    // respective tables (source_spans, phrases, packets, atomic_units).
    const payloads = batch.normalizedPayloads;
    if (payloads) {
      for (const span of payloads.sourceSpans ?? []) {
        nodesToQueue.push({
          id: span.node_id,
          kind: 'SourceSpan',
          account_id: batch.accountId,
          created_by: batch.createdBy,
          created_at: Date.now(),
          updated_at: Date.now(),
          source_id: span.source_id,
          message_id: span.message_id || null,
          conversation_id: span.conversation_id || null,
          text: span.text,
          normalized_text: span.normalized_text,
          start_char: span.start_char,
          end_char: span.end_char,
          boundary_kind: span.boundary_kind || 'sentence',
          span_hash: span.span_hash,
          metadata: span.metadata || null,
        } as any);
        payloadsWritten++;
      }

      for (const phrase of payloads.phrases ?? []) {
        nodesToQueue.push({
          id: phrase.node_id,
          kind: 'Phrase',
          account_id: batch.accountId,
          created_by: batch.createdBy,
          created_at: Date.now(),
          updated_at: Date.now(),
          text: phrase.text,
          normalized_text: phrase.normalized_text,
          type: phrase.type || 'phrase',
          entity_type: phrase.entity_type || null,
          frequency: phrase.frequency || 1,
          metadata: phrase.metadata || null,
        } as any);
        payloadsWritten++;
      }

      for (const packet of payloads.packets ?? []) {
        nodesToQueue.push({
          id: packet.node_id,
          kind: 'Packet',
          account_id: batch.accountId,
          created_by: batch.createdBy,
          created_at: Date.now(),
          updated_at: Date.now(),
          text: packet.text,
          normalized_text: packet.normalized_text,
          occurrences: packet.occurrences || 0,
          mass: packet.mass || 0,
          coverage: packet.coverage || 0,
          idf: packet.idf || 0,
          entropy_factor: packet.entropy_factor || 0,
          packet_hash: packet.packet_hash,
          metadata: packet.metadata || null,
        } as any);
        payloadsWritten++;
      }

      for (const au of payloads.atomicUnits ?? []) {
        nodesToQueue.push({
          id: au.node_id,
          kind: 'AtomicUnit',
          account_id: batch.accountId,
          created_by: batch.createdBy,
          created_at: Date.now(),
          updated_at: Date.now(),
          unit_type: au.unit_type,
          value: au.value,
          normalized_value: au.normalized_value,
          unit_hash: au.unit_hash,
          metadata: au.metadata || null,
        } as any);
        payloadsWritten++;
      }

      if (payloadsWritten > 0) {
        console.log(
          `[LegacyQueuedGraphWriteSink] Converted ${payloadsWritten} normalized payload(s) ` +
            `to AnyNode objects for legacy queue persistence`
        );
      }
    }

    const edgesToQueue: AnyEdge[] = [];
    for (const e of batch.edges) {
      try {
        const parsed = JSON.parse(e.properties);
        if (parsed && typeof parsed === 'object') {
          edgesToQueue.push(parsed as AnyEdge);
        }
      } catch {
        console.warn(`[LegacyQueuedGraphWriteSink] Skipping malformed edge ${e.id}`);
      }
    }

    this.queue.enqueueNodes(nodesToQueue);
    this.queue.enqueueEdges(edgesToQueue);

    nodesAdded += nodesToQueue.length;
    edgesAdded += edgesToQueue.length;

    return {
      success: true,
      nodesWritten: nodesAdded,
      edgesWritten: edgesAdded,
      payloadsWritten,
      quarantinedRows: 0,
    };
  }

  async flush(): Promise<void> {
    await this.queue.forceFlush();
  }
}
