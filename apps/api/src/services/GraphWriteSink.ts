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

    // Skinny nodes, generic nodes, and payloads are essentially nodes.
    // We treat the raw payload JSON as the source of truth if we can,
    // or just assume nodes are already queued before.
    // To support the legacy queue properly, we just reconstruct objects:
    const nodesToQueue: AnyNode[] = [];

    for (const n of batch.skinnyNodes) {
      nodesToQueue.push(JSON.parse(n.canonical_content) as AnyNode);
    }

    for (const gn of batch.genericNodes) {
      nodesToQueue.push(JSON.parse(gn.properties) as AnyNode);
    }

    // In legacy, normalized payloads don't exist as separate objects to insert via the queue,
    // they are part of the 'nodes' JSON that gets created/updated.
    // So we don't need to explicitly push them if skinnyNodes covers the node creation.

    const edgesToQueue: AnyEdge[] = batch.edges.map((e) => JSON.parse(e.properties) as AnyEdge);

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
