# SSE Subscription Best Practices

## Overview

This guide documents best practices for subscribing to Server-Sent Events (SSE) in React components to avoid race conditions and stuck loading states.

**Related Bug Fix**: UI Loading State Bug (2025-11-17)
**Implementation**: See `apps/web/src/components/settings/DataManagementCard.tsx` and `apps/web/src/components/canvas/ImportsTableCard.tsx`

---

## The Problem: Polling Anti-Pattern

### ❌ Bad: Indirect Polling (Race Conditions)

```typescript
// DON'T DO THIS
const { getOperation } = useBackgroundOperationsContext();

useEffect(() => {
  const checkInterval = setInterval(() => {
    const operation = getOperation(jobId); // Polls every 1 second
    if (operation?.status === 'done') {
      setIsLoading(false);
    }
  }, 1000);

  return () => clearInterval(checkInterval);
}, [jobId, getOperation]);
```

**Why this is bad**:

- 3-layer async state propagation: SSE → useJobStream → BackgroundOperationsContext → Component
- React batching delays cause 1-3 second latency
- Polling interval adds another 1 second delay
- Race condition: polling may check before BackgroundOperationsContext processes SSE update
- Result: **Loading states get stuck, timeouts trigger prematurely**

---

## The Solution: Direct SSE Subscription

### ✅ Good: Direct Subscription (Reactive)

```typescript
// DO THIS INSTEAD
import { useJobStream } from '@/hooks/useJobStream';

const { jobs: sseJobs } = useJobStream();

useEffect(() => {
  if (!jobId) return;

  const job = sseJobs.get(jobId);

  // Job completed successfully
  if (job?.status === 'succeeded') {
    console.log('[Component] Job complete via SSE');
    setSuccess('Operation completed successfully!');
    setIsLoading(false);
  }
  // Job failed
  else if (job?.status === 'failed') {
    console.error('[Component] Job failed via SSE:', job);
    setError('Operation failed.');
    setIsLoading(false);
  }
  // Job not yet in SSE stream - add timeout for connection issues
  else if (!job) {
    const timeout = setTimeout(() => {
      const latestJob = sseJobs.get(jobId);
      if (!latestJob) {
        console.error('[Component] Job not received via SSE after 10s');
        setError('Lost connection to server. Please refresh the page.');
        setIsLoading(false);
      }
    }, 10000); // 10 second timeout for SSE delivery

    return () => clearTimeout(timeout);
  }
}, [sseJobs, jobId]);
```

**Why this is better**:

- Direct subscription: SSE → useJobStream → Component (1 layer removed)
- No polling delays
- Reactive: updates immediately when SSE event arrives (~500ms latency)
- No race conditions: component reads from the same Map that SSE updates
- Result: **Loading states clear promptly, no false timeouts**

---

## Pattern Breakdown

### 1. Subscribe Directly to useJobStream

```typescript
const { jobs: sseJobs } = useJobStream();
```

**What this gives you**:

- `sseJobs`: `Map<string, JobUpdate>` - Real-time job state
- Updates automatically when SSE events arrive
- No manual polling or state management needed

### 2. React to SSE Updates

```typescript
useEffect(() => {
  const job = sseJobs.get(jobId);

  if (job?.status === 'succeeded') {
    // Handle success
  } else if (job?.status === 'failed') {
    // Handle failure
  }
}, [sseJobs, jobId]);
```

**Key points**:

- Dependency array includes `sseJobs` - triggers when SSE updates Map
- Check job status directly from Map (no intermediate context)
- No polling intervals or timers needed

### 3. Handle Connection Issues

```typescript
else if (!job) {
  const timeout = setTimeout(() => {
    const latestJob = sseJobs.get(jobId);
    if (!latestJob) {
      setError('Lost connection to server.');
      setIsLoading(false);
    }
  }, 10000);

  return () => clearTimeout(timeout);
}
```

**Why 10 seconds**:

- SSE broadcasts job status within 500ms typically
- 10 seconds allows for network delays
- Only triggers if job NEVER appears (true connection failure)
- Not a false timeout for slow jobs

---

## Loading State Management

### Pattern: Reactive to SSE Job Status

```typescript
useEffect(() => {
  if (jobsBeingOperated.size === 0) {
    setBulkActionLoading(false);
    return;
  }

  // Check if any operated jobs are still active via SSE
  const stillActive = Array.from(jobsBeingOperated).some((jobId) => {
    const job = sseJobs.get(jobId);
    return job && (job.status === 'queued' || job.status === 'running');
  });

  if (!stillActive) {
    // All jobs completed or failed, clear loading state
    setBulkActionLoading(false);
    setJobsBeingOperated(new Set());
  }

  // Fallback timeout: only trigger if SSE fails for 5 minutes
  const timeoutId = setTimeout(() => {
    console.error('[Component] Timeout after 5 min');
    setBulkActionLoading(false);
  }, 300000); // 5 minutes

  return () => clearTimeout(timeoutId);
}, [sseJobs, jobsBeingOperated]);
```

**Key principles**:

- Loading state clears when SSE reports job completion
- Timeout is a **fallback** for connection failures (5 minutes), not primary mechanism
- Timeout must be longer than longest expected job duration
- React to SSE, don't poll

---

## Common Pitfalls

### Pitfall 1: Polling BackgroundOperationsContext

```typescript
// ❌ Bad
const { getOperation } = useBackgroundOperations();

useEffect(() => {
  const interval = setInterval(() => {
    const op = getOperation(jobId);
    // Polling creates race conditions
  }, 1000);
}, [jobId, getOperation]);
```

**Fix**: Subscribe to `useJobStream` directly (see solution above)

### Pitfall 2: Timeout Too Short

```typescript
// ❌ Bad: 30 second timeout
setTimeout(() => {
  setIsLoading(false); // Fires before job completes!
}, 30000);
```

**Fix**: Use 5-minute timeout for fallback, let SSE clear loading state

### Pitfall 3: Not Handling Connection Drops

```typescript
// ❌ Bad: No fallback for SSE failure
useEffect(() => {
  const job = sseJobs.get(jobId);
  if (job?.status === 'succeeded') {
    setIsLoading(false);
  }
  // What if SSE never delivers the job?
}, [sseJobs, jobId]);
```

**Fix**: Add 10-second timeout check for missing jobs (see Pattern #3 above)

---

## Testing Considerations

### E2E Tests Should Verify

1. **Job Completion → UI State Clears**

   ```typescript
   test('should clear loading state when job completes via SSE', async ({ page }) => {
     // Trigger job
     // Wait for SSE event
     // Verify loading state clears within 5 seconds
   });
   ```

2. **Long-Running Jobs**

   ```typescript
   test('should handle long deletions without timeout', async ({ page }) => {
     // Create large dataset
     // Trigger bulk deletion
     // Verify no false timeout for 40-60 second job
   });
   ```

3. **SSE Reconnection**

   ```typescript
   test('should recover when SSE reconnects', async ({ page }) => {
     // Trigger job
     // Close SSE connection
     // Verify reconnection
     // Verify loading state still clears
   });
   ```

4. **Connection Failure**
   ```typescript
   test('should show error on SSE timeout', async ({ page }) => {
     // Block SSE endpoint
     // Trigger job
     // Verify error after 10 seconds
     // Verify loading state cleared
   });
   ```

See: `tests/e2e/data-management-ui-updates.spec.ts` for complete examples

---

## Migration Checklist

When migrating a component from polling to direct SSE subscription:

- [ ] Add `import { useJobStream } from '@/hooks/useJobStream'`
- [ ] Add `const { jobs: sseJobs } = useJobStream()`
- [ ] Replace `setInterval` polling with `useEffect(() => {}, [sseJobs, jobId])`
- [ ] Handle 3 states: success, failure, missing (connection issue)
- [ ] Add 10-second timeout for missing jobs
- [ ] Extend fallback timeout to 5 minutes
- [ ] Update E2E tests to verify loading state clears promptly
- [ ] Verify TypeScript compiles
- [ ] Test manually: trigger job, verify loading clears within 1-2 seconds
- [ ] Monitor Sentry for stuck loading errors (should drop to 0)

---

## SSE Connection Health Monitoring

### Use Case: Show Connection Status to User

```typescript
import { useSSEConnectionStatus } from '@/contexts/BackgroundOperationsContext';

function Component() {
  const { connected, error } = useSSEConnectionStatus();

  if (!connected) {
    return (
      <div className="bg-yellow-100 text-yellow-800 p-2 rounded">
        ⚠️ Real-time updates disconnected. Reconnecting...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 text-red-800 p-2 rounded">
        ❌ Connection error: {error.message}
      </div>
    );
  }

  // Normal UI
}
```

**When to use**:

- Debug stuck loading states
- Show user when SSE is disconnected
- Provide manual refresh option when connection fails

---

## Performance Comparison

### Before (Polling)

```
SSE Event (t=0ms)
  ↓
useJobStream updates Map (t=500ms)
  ↓
BackgroundOperationsContext syncs (t=700ms, React batching)
  ↓
Component polls getOperation() (t=1000ms, next interval tick)
  ↓
Loading state clears (t=1000-3000ms total latency)
```

**Race condition**: If component polls at t=600ms, operation not yet in context → timeout triggers

### After (Direct Subscription)

```
SSE Event (t=0ms)
  ↓
useJobStream updates Map (t=500ms)
  ↓
Component useEffect triggers (t=500ms, immediate React update)
  ↓
Loading state clears (t=500-700ms total latency)
```

**Result**: 3-6x faster, zero race conditions

---

## Related Documentation

- **Architecture**: [docs/architecture/OVERVIEW.md](../architecture/OVERVIEW.md) - SSE infrastructure
- **Testing**: [tests/e2e/data-management-ui-updates.spec.ts](../../tests/e2e/data-management-ui-updates.spec.ts) - E2E test examples
- **Hook API**: [apps/web/src/hooks/useJobStream.ts](../../apps/web/src/hooks/useJobStream.ts) - useJobStream hook
- **Context API**: [apps/web/src/contexts/BackgroundOperationsContext.tsx](../../apps/web/src/contexts/BackgroundOperationsContext.tsx) - useSSEConnectionStatus hook
- **Bug Fix Details**: [IMPLEMENTATION_COMPLETE_2025-11-15.md](../../IMPLEMENTATION_COMPLETE_2025-11-15.md)

---

## Summary

**Old Approach**: Polling BackgroundOperationsContext every 1 second
**Problem**: Race conditions, 1-3 second delays, false timeouts
**New Approach**: Direct subscription to useJobStream
**Benefits**: Reactive (500ms latency), no race conditions, no false timeouts

**Key Takeaway**: Always subscribe directly to useJobStream for job status, never poll BackgroundOperationsContext.
