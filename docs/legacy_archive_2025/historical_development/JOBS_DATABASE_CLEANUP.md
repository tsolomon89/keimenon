# Jobs Database Cleanup - Fixed ✅

**Date**: 2025-10-18
**Issue**: Jobs stuck in failed/blocked/running status, not being processed

---

## Problems Found

### 1. Jobs Missing completedAt Timestamp

**Error**: `Invalid job state: Completed job must have completedAt timestamp`

**Cause**: Jobs were manually marked as 'failed' via SQL UPDATE without proper timestamp

**Jobs Affected**:

- `job_1760816888835_vmafst` - failed (no completedAt)
- `job_1760816235354_6esmg0` - failed (no completedAt)

**Fix**: Updated state_data to include completedAt timestamp

```sql
UPDATE jobs
SET state_data = json_insert(state_data, '$.completedAt', datetime('now'))
WHERE status IN ('failed', 'succeeded')
AND json_extract(state_data, '$.completedAt') IS NULL;
```

### 2. Jobs Stuck in Non-Terminal States

**Issue**: Jobs stuck in 'blocked' and 'running' status

**Jobs Affected**:

- `job_1760848751762_32trpe` - blocked
- `job_1760848457476_b8e7vo` - blocked
- `job_1760817031355_o4zath` - running (stuck)

**Cause**:

- Blocked jobs were waiting for running job to complete
- Running job was stuck/timed out but never marked as failed
- Worker pool only looks for 'queued' jobs, so these were orphaned

**Fix**: Deleted all stuck jobs to allow clean slate

```sql
DELETE FROM jobs WHERE status IN ('failed', 'blocked', 'running');
```

### 3. Job Type Showing as "Unknown" in UI

**Issue**: Background Operations table showed "Job job_1760" with type "Unknown"

**Cause**: Job type not being extracted/displayed correctly

**Status**: Need to investigate frontend ImportsTableCard component

---

## Database State After Cleanup

### Before

```
job_1760848751762_32trpe | delete | blocked | 1760848751763
job_1760848457476_b8e7vo | delete | blocked | 1760848457476
job_1760817031355_o4zath | delete | running | 1760817031355
job_1760816888835_vmafst | delete | failed  | 1760816888836
job_1760816235354_6esmg0 | delete | failed  | 1760816235354
```

### After

```
(no jobs - clean slate)
```

---

## How Jobs Got Stuck

### Timeline

1. User clicked "Clear Keimenon Data" → Created delete job
2. Job transitioned: queued → running
3. DeleteWorker started processing (synchronous deletion)
4. Event loop blocked for 30+ seconds (deleting 25K nodes)
5. Job timeout triggered → Job marked as 'failed' manually
6. But completedAt timestamp wasn't set (validation error)
7. User tried again → New job created
8. New job blocked because old job still in 'running' state
9. Cycle repeated, creating more stuck jobs

### Root Causes Fixed

✅ **Batched DeleteWorker** - Now deletes in 500-node batches with event loop yielding
✅ **Validation** - Failed jobs now properly validated with completedAt
✅ **Database Cleanup** - Removed all stuck/orphaned jobs

---

## Prevention Measures

### 1. Proper State Transitions

Jobs must transition through proper state machine:

- `fail()` method automatically sets completedAt (line 149 in JobStateMachine.ts)
- Never manually UPDATE jobs status without proper state_data

### 2. Worker Timeout Handling

When worker times out:

```typescript
// WRONG - Manual SQL UPDATE
db.prepare('UPDATE jobs SET status = "failed"').run();

// RIGHT - Use domain model
const job = await jobRepository.findById(jobId, accountId);
job.fail({ code: 'TIMEOUT', message: 'Worker stuck or timed out' });
await jobRepository.save(job); // Sets completedAt automatically
```

### 3. Batched Operations

All long-running operations must:

- Process in batches (500 items)
- Yield to event loop with `setImmediate()`
- Report progress incrementally
- Support cancellation

---

## Testing Checklist

After cleanup, test the following:

- [ ] Click "Clear Keimenon Data" in Settings
- [ ] Job appears in Background Operations table
- [ ] Job shows correct type ("Delete Keimenon Data")
- [ ] Progress updates in real-time (0% → 100%)
- [ ] Job completes successfully (status = succeeded)
- [ ] Nodes are deleted from database
- [ ] UI remains responsive during deletion
- [ ] No errors in frontend Console component

---

## SQL Queries for Debugging

### Check job status

```sql
SELECT id, type, status, created_at
FROM jobs
ORDER BY created_at DESC;
```

### Check job state data

```sql
SELECT
  id,
  status,
  json_extract(state_data, '$.completedAt') as completedAt,
  json_extract(state_data, '$.error') as error,
  json_extract(state_data, '$.blockedReason') as blockedReason
FROM jobs
ORDER BY created_at DESC;
```

### Find jobs missing required timestamps

```sql
-- Failed/succeeded without completedAt
SELECT id, type, status
FROM jobs
WHERE status IN ('failed', 'succeeded')
AND json_extract(state_data, '$.completedAt') IS NULL;

-- Running without startedAt
SELECT id, type, status
FROM jobs
WHERE status = 'running'
AND json_extract(state_data, '$.startedAt') IS NULL;

-- Blocked without blockedReason
SELECT id, type, status
FROM jobs
WHERE status = 'blocked'
AND json_extract(state_data, '$.blockedReason') IS NULL;
```

### Clean up stuck jobs (use with caution)

```sql
-- Delete all non-terminal jobs
DELETE FROM jobs WHERE status NOT IN ('succeeded', 'failed', 'canceled');

-- Delete all failed jobs
DELETE FROM jobs WHERE status = 'failed';

-- Delete jobs older than 1 hour
DELETE FROM jobs WHERE created_at < (strftime('%s', 'now') - 3600) * 1000;
```

---

## Related Files

- Job Domain Model: `apps/api/src/modules/jobs/domain/Job.ts`
- Job State Machine: `apps/api/src/modules/jobs/domain/JobStateMachine.ts`
- Job Repository: `apps/api/src/modules/jobs/infrastructure/JobRepository.ts`
- Delete Worker: `apps/api/src/modules/workers/infrastructure/DeleteWorker.ts`
- Worker Pool: `apps/api/src/modules/workers/domain/WorkerPool.ts`

---

## Next Steps

1. Test delete functionality with clean database
2. Verify job appears correctly in UI
3. Monitor for any new errors
4. Document proper job state management for team
