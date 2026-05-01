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

    // In legacy, normalized payloads don't exist as separate objects to insert via the queue,
    // they are part of the 'nodes' JSON that gets created/updated.
    // So we don't need to explicitly push them if skinnyNodes covers the node creation.

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
      payloadsWritten: 0,
      quarantinedRows: 0,
    };
  }

  async flush(): Promise<void> {
    await this.queue.forceFlush();
  }
}
