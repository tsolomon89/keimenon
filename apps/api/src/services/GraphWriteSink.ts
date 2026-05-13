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
