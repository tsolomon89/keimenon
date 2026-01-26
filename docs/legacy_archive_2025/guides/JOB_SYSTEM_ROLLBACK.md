# Job System Rollback Guide

## Overview

The job system includes automatic rollback capability for failed operations. When an import or delete job fails partway through, you can roll back all partial changes to restore the database to its pre-job state.

## How It Works

### Change Tracking

Every job tracks its database modifications in a **ChangeTracker**:

```typescript
interface ChangeTracker {
  nodesCreated: string[]; // Node IDs created by this job
  edgesCreated: string[]; // Edge IDs created by this job
  nodesDeleted: string[]; // Node IDs deleted by this job
  edgesDeleted: string[]; // Edge IDs deleted by this job
  checkpointAt: number; // Timestamp of last checkpoint
  changesSinceCheckpoint: number; // Changes since last save
}
```

### Compensation

The `CompensateJob` use case reverses a job's changes:

1. **Load job** from database
2. **Extract ChangeTracker** from `job.state_data`
3. **Delete created entities** (nodes/edges added during import)
4. **Restore deleted entities** (future: recreate nodes/edges removed during delete)
5. **Mark job as compensated** to prevent duplicate rollbacks

## When to Use Rollback

### Automatic Triggers (Future)

- Import job fails with error code `TIMEOUT`
- Import job fails with error code `IMPORT_FAILED`
- Delete job fails mid-operation
- Job is canceled by user (optional, based on configuration)

### Manual Triggers

- User clicks "Rollback" button in UI (for failed jobs)
- Admin runs compensation command via API

## API Usage

### Compensate a Failed Job

```bash
POST /api/v1/jobs/:jobId/compensate
Authorization: Bearer <token>
Content-Type: application/json

{
  "compensatedBy": "user_abc123",
  "reason": "Import failed, rolling back partial changes"
}
```

### Response

```json
{
  "success": true,
  "compensation": {
    "nodesDeleted": 8997,
    "edgesDeleted": 12450,
    "duration": 3420,
    "compensatedAt": "2025-11-15T10:30:00.000Z",
    "compensatedBy": "user_abc123"
  }
}
```

## Example Scenarios

### Scenario 1: Failed Import Leaves 8997 Orphaned Nodes

**Problem**: Import job times out after creating 8997 nodes but before completing. These orphaned nodes clutter the canvas.

**Solution**:

```bash
# Find the failed job ID
curl -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/v1/jobs?status=failed&type=import

# Compensate the job
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"compensatedBy": "user_abc123"}' \
  https://api.example.com/api/v1/jobs/job_xyz789/compensate
```

**Result**: All 8997 nodes (and their edges) are deleted. Database is clean.

### Scenario 2: Delete Job Canceled Mid-Operation

**Problem**: User cancels delete operation after 500 nodes have been deleted. User changes mind and wants to undo.

**Solution**:

Currently, deleted nodes cannot be restored (compensation only deletes created entities). In the future, we'll support restoration via snapshots.

**Workaround**: User must restore from backup or manually recreate deleted data.

### Scenario 3: Import Creates Duplicates by Mistake

**Problem**: User imports same file twice. Second import creates 5000 duplicate nodes.

**Solution**:

```bash
# Compensate the SECOND import job (not the first!)
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/v1/jobs/job_second_import/compensate
```

**Result**: Only the duplicates (5000 nodes from second import) are deleted. Original import remains intact.

## Implementation Details

### Database Operations

Compensation uses batch deletion to avoid blocking the event loop:

```typescript
class CompensateJob {
  private readonly BATCH_SIZE = 500;

  async deleteEdgesInBatches(edgeIds: string[], accountId: string): Promise<number> {
    for (let i = 0; i < edgeIds.length; i += this.BATCH_SIZE) {
      const batch = edgeIds.slice(i, i + this.BATCH_SIZE);
      await db.execute(`DELETE FROM edges WHERE id IN (${placeholders}) AND account_id = ?`, [
        ...batch,
        accountId,
      ]);
      await yieldToEventLoop(); // ✅ Prevent blocking
    }
  }
}
```

### Multi-Tenant Isolation

All compensation operations enforce `account_id` isolation:

```sql
DELETE FROM nodes WHERE id IN (?) AND account_id = ?
DELETE FROM edges WHERE id IN (?) AND account_id = ?
```

This prevents cross-account data leakage even if IDs are guessed.

### Idempotency

Compensation is idempotent - running it twice has the same effect as once:

```typescript
// First call: Deletes 8997 nodes, marks job as compensated
await compensateJob.execute({ jobId, accountId });

// Second call: Sees job already compensated, returns same result
await compensateJob.execute({ jobId, accountId });
```

## Performance

### Small Jobs (<1000 entities)

- **Duration**: 100-500ms
- **Impact**: Negligible, runs inline

### Medium Jobs (1000-10000 entities)

- **Duration**: 1-5 seconds
- **Impact**: Low, batched deletion with event loop yielding

### Large Jobs (>10000 entities)

- **Duration**: 5-30 seconds
- **Impact**: Moderate, may block other operations briefly
- **Recommendation**: Run during low-traffic periods or as background job

## Limitations

### Current Limitations

1. **Cannot restore deleted nodes** - Only reverses creation, not deletion
2. **No snapshot support** - Cannot restore to arbitrary point in time
3. **Manual trigger only** - Not yet automatic on job failure

### Future Enhancements

1. **Automatic compensation** - Trigger on specific error codes
2. **Snapshot-based restoration** - Save pre-job state for full rollback
3. **Selective compensation** - Rollback only specific entities
4. **Dry run mode** - Preview what would be deleted
5. **Compensation jobs** - Run compensation as background job for large datasets

## Troubleshooting

### Compensation Fails with "Job not found"

**Cause**: Job ID is incorrect or belongs to different account

**Fix**: Verify job ID and ensure you're authenticated as the correct account

### Compensation Reports 0 Entities Deleted

**Cause**: Job never created any entities (failed before first checkpoint)

**Fix**: Check job's change tracker is populated:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/v1/jobs/job_xyz789

# Look for state.changeTracker in response
```

### Compensation Partially Completes

**Cause**: Database error or server crash mid-compensation

**Fix**: Re-run compensation (it's idempotent). Already-deleted entities will be skipped.

## Related Files

- `apps/api/src/modules/jobs/application/CompensateJob.ts` - Use case implementation
- `apps/api/src/modules/jobs/domain/ChangeTracker.ts` - Change tracking interface
- `apps/api/src/modules/workers/infrastructure/ImportWorker.ts` - Tracks created nodes/edges
- `apps/api/src/modules/workers/infrastructure/DeleteWorker.ts` - Tracks deleted nodes/edges
- `apps/api/src/modules/jobs/domain/ProgressiveCheckpoint.ts` - Checkpoint saving

## API Reference

### POST /api/v1/jobs/:jobId/compensate

Rollback a failed job's partial database changes.

**Authorization**: Bearer token (job owner or admin)

**Request Body**:

```typescript
{
  compensatedBy: string;  // User ID triggering compensation
  reason?: string;        // Optional reason for audit log
}
```

**Response**:

```typescript
{
  success: boolean;
  job?: Job;
  compensation?: {
    nodesDeleted: number;
    edgesDeleted: number;
    duration: number;
    compensatedAt: string;
    compensatedBy: string;
  };
  error?: string;
}
```

**Error Codes**:

- `404 Not Found` - Job does not exist or wrong account
- `409 Conflict` - Job already compensated
- `500 Internal Server Error` - Database error during compensation

## Security Considerations

### Multi-Tenant Isolation

Compensation enforces account boundaries:

```typescript
// ✅ Correct - only deletes nodes from jobId's account
await db.execute(`DELETE FROM nodes WHERE id IN (?) AND account_id = ?`, [nodeIds, accountId]);

// ❌ Wrong - could delete nodes from other accounts
await db.execute(`DELETE FROM nodes WHERE id IN (?)`, [nodeIds]);
```

### Authorization

Only these roles can trigger compensation:

- **Job creator** - User who created the job
- **Account admin** - Admin of the job's account
- **Super admin** - Platform administrator

### Audit Logging

All compensation operations are logged:

```json
{
  "action": "job.compensate",
  "jobId": "job_xyz789",
  "accountId": "acct_abc123",
  "compensatedBy": "user_def456",
  "nodesDeleted": 8997,
  "edgesDeleted": 12450,
  "timestamp": "2025-11-15T10:30:00.000Z"
}
```

## Examples

### CLI Tool (Future)

```bash
# Compensate a specific job
canvas-cli jobs compensate job_xyz789

# Compensate all failed imports for an account
canvas-cli jobs compensate --account acct_abc --status failed --type import

# Dry run (preview only, don't delete)
canvas-cli jobs compensate job_xyz789 --dry-run
```

### Node.js Script

```typescript
import { CompensateJob } from './apps/api/src/modules/jobs/application/CompensateJob';
import { getDbClient } from './apps/api/src/utils/get-db-client';

async function rollbackFailedImport(jobId: string, accountId: string) {
  const db = await getDbClient();
  const jobRepo = new SQLiteJobRepository(db);
  const compensateJob = new CompensateJob(jobRepo, db);

  const result = await compensateJob.execute({
    jobId,
    accountId,
    compensatedBy: 'system',
  });

  if (result.success) {
    console.log(`✅ Compensated job ${jobId}`);
    console.log(`   Deleted: ${result.compensation.nodesDeleted} nodes`);
  } else {
    console.error(`❌ Compensation failed: ${result.error}`);
  }
}
```

## Monitoring

### Metrics to Track

- `job.compensation.count` - Number of compensations performed
- `job.compensation.duration` - Time taken to compensate
- `job.compensation.entities_deleted` - Nodes + edges removed
- `job.failure.rate` - Percentage of jobs requiring compensation

### Alerts

Set up alerts for:

- **High compensation rate** (>10% of jobs) - Indicates systemic issues
- **Slow compensation** (>30s) - May need batch size tuning
- **Repeated compensation of same job** - Possible bug in idempotency

## Best Practices

1. **Checkpoint frequently** - Save change tracker every 10 batches (default)
2. **Test rollback** - Verify compensation works before production deployment
3. **Monitor failure rates** - High compensation needs indicate upstream problems
4. **Document incidents** - Include `reason` field when compensating manually
5. **Regular cleanup** - Delete old compensated jobs to free space

## Conclusion

The job system rollback feature provides a safety net for failed operations. By tracking all database modifications and enabling one-click compensation, users can confidently retry imports and deletes without fear of orphaned data.

For questions or issues, see the [Job System Architecture](../architecture/JOB_SYSTEM.md) documentation.
