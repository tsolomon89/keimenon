# Progressive Checkpoint Usage Guide

## Overview

Progressive checkpointing saves job state periodically during batch operations, enabling resume capability if the process crashes.

## Integration Steps

### 1. Import the helper

```typescript
import { createProgressiveCheckpoint } from '../../jobs/domain/ProgressiveCheckpoint';
import { JOB_CONFIG } from '../../jobs/jobs.config';
```

### 2. Create checkpoint manager

```typescript
// In worker's execute() method
const checkpoint = createProgressiveCheckpoint(
  job,
  context,
  JOB_CONFIG.workers.delete.checkpointInterval // Every 10 batches
);
```

### 3. Save checkpoint in batch loop

```typescript
// Inside your batch processing loop
for (let batchNumber = 1; batchNumber <= totalBatches; batchNumber++) {
  // ... process batch ...
  // ... update changeTracker ...

  // Save checkpoint every N batches
  await checkpoint.saveIfNeeded(changeTracker, batchNumber);
}
```

## Complete Example: DeleteWorker

```typescript
private async deleteNodes(
  scope: string,
  accountId: string,
  changeTracker: ChangeTracker,
  job?: Job,
  context?: WorkerContext
): Promise<{ deletedCount: number; changeTracker: ChangeTracker }> {
  const BATCH_SIZE = JOB_CONFIG.workers.delete.batchSize;
  let tracker = changeTracker;
  let batchNumber = 0;

  // Create checkpoint manager
  const checkpoint = job && context
    ? createProgressiveCheckpoint(job, context, JOB_CONFIG.workers.delete.checkpointInterval)
    : null;

  while (true) {
    batchNumber++;

    // ... get batch, delete nodes, track changes ...

    tracker = trackNodesDeleted(tracker, nodeIds);

    // ... delete batch ...

    // ✅ Save checkpoint periodically
    if (checkpoint) {
      await checkpoint.saveIfNeeded(tracker, batchNumber);
    }

    // ... report progress, yield to event loop ...
  }

  return { deletedCount, changeTracker: tracker };
}
```

## Complete Example: ImportWorker

```typescript
private async executeWithCheckpoints(job: Job, context: WorkerContext): Promise<WorkerResult> {
  let changeTracker = createChangeTracker();

  // Create checkpoint manager
  const checkpoint = createProgressiveCheckpoint(
    job,
    context,
    JOB_CONFIG.workers.import.checkpointInterval
  );

  // ... parse files ...

  // Run import pipeline
  const result = await importService.import(conversations, uploadHash, config, {
    accountId: job.accountId,
    userId: job.createdBy,
  });

  // Track created entities
  const createdNodes = await dbClient.execute(
    `SELECT id FROM nodes WHERE account_id = ? AND json_extract(metadata, '$.uploadHash') = ?`,
    [job.accountId, uploadHash]
  );

  changeTracker = trackNodesCreated(changeTracker, createdNodes.records.map(r => r.id));

  // ✅ Force save final checkpoint
  await checkpoint.save(changeTracker, 1);

  return {
    success: true,
    metadata: {
      uploadHash,
      changeTracker: serializeChangeTracker(changeTracker),
    },
  };
}
```

## Benefits

1. **Resume Capability**: If server crashes mid-operation, can resume from last checkpoint
2. **Progress Visibility**: Job state always reflects current progress
3. **Rollback Support**: Change tracker is always up-to-date for compensation
4. **Low Overhead**: Checkpoints saved every N batches (default: 10), not every operation

## Configuration

Override checkpoint interval via environment variables:

```bash
# Save checkpoint every 5 batches instead of 10
JOB_CHECKPOINT_BATCH_INTERVAL=5 npm run dev:api
```

## Troubleshooting

### Checkpoint saves failing

Check logs for errors from `ProgressiveCheckpoint`. Common causes:
- Database connection issues
- Invalid state serialization
- Disk space exhausted

### Performance impact

Checkpointing adds ~10-50ms per checkpoint (database write). With default interval of 10 batches:
- 100 batches = 10 checkpoints = ~100-500ms overhead
- 1000 batches = 100 checkpoints = ~1-5s overhead
- Negligible compared to actual work (deleting nodes, importing data)

## Related Files

- `apps/api/src/modules/jobs/domain/ProgressiveCheckpoint.ts` - Helper implementation
- `apps/api/src/modules/jobs/jobs.config.ts` - Configuration values
- `apps/api/src/modules/jobs/domain/ChangeTracker.ts` - Change tracking
- `apps/api/src/modules/jobs/application/CompensateJob.ts` - Uses changeTracker for rollback
