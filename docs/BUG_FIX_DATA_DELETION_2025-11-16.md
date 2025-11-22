# Data Deletion Bug Fix - 2025-11-16

## Executive Summary

Fixed **three critical bugs** in the data deletion system that prevented users from properly clearing canvas data and caused the UI to become unresponsive.

**Impact**:
- ✅ Users can now successfully delete canvas data
- ✅ System nodes (UserNode, AccountNode, Board, Constellation) are preserved
- ✅ Button no longer gets stuck in disabled state
- ✅ Proper error handling and timeout recovery

---

## Bugs Fixed

### Bug #1: DeleteWorker Scope Error (CRITICAL - Data Integrity)

**Severity**: 🔴 Critical
**Component**: `apps/api/src/modules/workers/infrastructure/DeleteWorker.ts`

**Problem**:
The DeleteWorker was deleting **ALL nodes** when `scope === 'canvas'`, including system-critical nodes like UserNode, AccountNode, Board, and Constellation.

**Root Cause**:
```typescript
// BEFORE (Broken):
if (scope === 'canvas') {
  query = `SELECT id FROM nodes WHERE account_id = ? LIMIT ?`; // Deletes EVERYTHING!
}
```

**Impact**:
- Board nodes were being deleted, causing data to persist in graph visualization
- Account metadata could be corrupted
- User profiles could be lost

**Fix**:
```typescript
// AFTER (Fixed):
if (scope === 'canvas') {
  query = `SELECT id FROM nodes
           WHERE account_id = ?
           AND kind IN ('ChatThread', 'Message', 'Source', 'CodeBlock', 'Group', 'Folder')
           LIMIT ?`;
}
```

**Files Changed**:
- [DeleteWorker.ts:274-282](../apps/api/src/modules/workers/infrastructure/DeleteWorker.ts#L274-L282) - getNodeIdBatch()
- [DeleteWorker.ts:152-160](../apps/api/src/modules/workers/infrastructure/DeleteWorker.ts#L152-L160) - countNodesToDelete()

---

### Bug #2: Stuck Button State (UI/UX Critical)

**Severity**: 🟡 High
**Component**: `apps/web/src/components/settings/DataManagementCard.tsx`

**Problem**:
The "Clear Canvas Data" button could become permanently disabled if:
- The delete job got stuck in 'running' state
- The operation wasn't found in BackgroundOperationsContext
- Network failures occurred

**Root Cause**:
```typescript
// BEFORE: No timeout or recovery mechanism
useEffect(() => {
  const checkInterval = setInterval(() => {
    const operation = getOperation(deletionJobId);
    if (operation?.status === 'done') { /* cleanup */ }
    else if (operation?.status === 'error') { /* cleanup */ }
    // BUG: What if operation doesn't exist or is stuck?
    // Button stays disabled forever!
  }, 1000);
}, [deletionJobId]);
```

**Fix**:
Added multiple recovery mechanisms:

1. **5-second timeout** if operation not found
2. **5-minute timeout** for stuck jobs
3. **Automatic state reset** on button click if stuck without active job
4. **Improved button disable logic** - only disabled when there's an active job

```typescript
// AFTER: Robust timeout and recovery
let checksWithoutOperation = 0;
const MAX_CHECKS_WITHOUT_OPERATION = 5; // 5 seconds
const MAX_TOTAL_CHECKS = 300; // 5 minutes

if (!operation) {
  checksWithoutOperation++;
  if (checksWithoutOperation >= MAX_CHECKS_WITHOUT_OPERATION) {
    // Clear state and show error
    setError('Unable to track deletion progress...');
    setIsClearing(false);
    return;
  }
}
```

**Files Changed**:
- [DataManagementCard.tsx:38-101](../apps/web/src/components/settings/DataManagementCard.tsx#L38-L101) - useEffect monitoring
- [DataManagementCard.tsx:151-162](../apps/web/src/components/settings/DataManagementCard.tsx#L151-L162) - handleClearClick recovery
- [DataManagementCard.tsx:387](../apps/web/src/components/settings/DataManagementCard.tsx#L387) - button disable logic

---

### Bug #3: Scope Mismatch Between Endpoints

**Severity**: 🟡 Medium
**Component**: Multiple endpoints

**Problem**:
Two different delete endpoints with different behavior:
- `DELETE /api/v1/data/canvas` - deletes specific node kinds
- `POST /api/v1/jobs/delete` with `scope: 'canvas'` - was deleting everything

**Fix**:
Aligned both endpoints to use the same node kind filters:
- ChatThread
- Message
- Source
- CodeBlock
- Group
- Folder

System nodes now consistently preserved:
- UserNode
- AccountNode
- Board
- Constellation

---

## Cleanup & Garbage Collection Mechanisms

### ✅ Orphaned Job Recovery (Verified Working)

**Location**: `apps/api/src/modules/jobs/infrastructure/OrphanedJobRecovery.ts`

**How it works**:
1. Runs on server startup (before worker pool initialization)
2. Queries all jobs with status 'queued' or 'running'
3. Marks them as 'canceled' with clear error message
4. Logs recovery count for observability

**Usage**:
```typescript
// Called automatically in apps/api/src/index.ts:715
await recoverOrphanedJobs(jobRepository);
```

**What it prevents**:
- Jobs stuck in "running" state forever
- UI showing stale "Processing" jobs
- Database clutter from interrupted server restarts

### ✅ Upload Cleanup Service (Verified Working)

**Location**: `apps/api/src/modules/uploads/application/UploadCleanupService.ts`

**How it works**:
- Runs every 1 hour (configurable via `UPLOAD_CLEANUP_INTERVAL_MS`)
- Removes orphaned upload sessions
- Cleans up temporary files

**Usage**:
```typescript
// Initialized in apps/api/src/index.ts:747
uploadCleanupService = initializeCleanupService(uploadRepo, cleanupIntervalMs);
```

### ✅ Background Operations Auto-Cleanup

**Location**: UI component auto-cleanup (BackgroundOperationsContext)

**How it works**:
- Completed jobs auto-removed after 15 seconds
- Failed jobs auto-removed after 30 seconds
- User can manually clear all with "Clear" button

---

## Testing Coverage

### Integration Tests (Updated)

**File**: `apps/api/src/__tests__/jobs-batched-delete.test.ts`

**New Tests Added**:
1. ✅ **Delete Scope Verification** - Verifies system nodes are preserved
   - Tests canvas data deletion only removes canvas nodes
   - Ensures UserNode, AccountNode, Board, Constellation remain
   - CRITICAL: Catches the bug we just fixed

2. ✅ **Batched Deletion - Small Dataset** (existing, verified)
   - 1000 nodes with progress updates

3. ✅ **Batched Deletion - Medium Dataset** (existing, verified)
   - 5000 nodes without blocking event loop
   - Verifies server responsiveness during deletion

4. ✅ **Batched Deletion - Large Dataset** (existing, verified)
   - 10000+ nodes with incremental progress

5. ✅ **Performance Benchmarks** (existing, verified)
   - 25000 nodes (production-scale)

**Helper Functions Added**:
```typescript
countCanvasNodes(accountId)  // Count nodes that should be deleted
countSystemNodes(accountId)  // Count nodes that should NOT be deleted
```

### E2E Tests (Updated)

**File**: `tests/e2e/data-management-ui-updates.spec.ts`

**Enhanced Tests**:
1. ✅ **Canvas data deletion UI update** (enhanced)
   - Verifies button is not disabled before click
   - Checks modal shows stats correctly
   - Confirms delete job creation
   - Validates UI state without page reload
   - Added comprehensive logging

2. ✅ **Background operations table** (existing, verified)
3. ✅ **Job removal after deletion** (existing, verified)
4. ✅ **Bulk job deletion** (existing, verified)
5. ✅ **Loading states** (existing, verified)

---

## Deployment Instructions

### 1. Restart API Server

The DeleteWorker changes require a server restart:

```bash
# Windows
cmd /c taskkill /F /IM node.exe
npm run dev:api

# Linux/Mac
pkill node
npm run dev:api
```

### 2. Refresh Web App

Users need to refresh their browser to get the updated UI component:
- Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Or clear browser cache

### 3. Verify Fixes

**Test 1: Button Works**
1. Navigate to Settings → Data → Data Management
2. Click "Clear Canvas Data"
3. Modal should appear ✅
4. Button should NOT be disabled ✅

**Test 2: Deletion Works**
1. Confirm deletion in modal
2. Job should be created ✅
3. Check Background Operations table
4. Job should appear and complete ✅
5. Canvas data should be deleted ✅
6. Graph should only show Board/system nodes ✅

**Test 3: Recovery Works**
If button gets stuck (e.g., network failure):
1. Wait 5 seconds - button should auto-recover ✅
2. Or click button again - state resets ✅
3. Modal should appear on next attempt ✅

---

## Run Tests

### Integration Tests

```bash
# Run delete worker tests
node --import tsx --test apps/api/src/__tests__/jobs-batched-delete.test.ts

# Expected output:
# ✓ Delete Scope Verification > should preserve system nodes
# ✓ Batched Deletion - Small Dataset > should delete 1000 nodes
# ✓ Batched Deletion - Medium Dataset > should delete 5000 nodes
# ✓ Batched Deletion - Large Dataset > should delete 10000+ nodes
# ✓ Performance Benchmarks > should handle 25000 nodes
```

### E2E Tests

```bash
# Run data management E2E tests
npx playwright test tests/e2e/data-management-ui-updates.spec.ts

# Expected output:
# ✓ should update UI without reload after canvas data deletion
# ✓ should show delete job in background operations table
# ✓ should remove job from table after deletion
# ✓ should handle bulk job deletion
```

---

## Monitoring & Verification

### Check for Orphaned Jobs

```sql
-- Query database for jobs stuck in non-terminal states
SELECT id, type, status, created_at, updated_at
FROM jobs
WHERE status IN ('queued', 'running')
ORDER BY created_at DESC;

-- Should return 0 rows after server restart
```

### Check Delete Job Logs

```bash
# API server logs should show:
🔍 Checking for orphaned jobs from previous server instance...
✅ No orphaned jobs found
✅ Worker pool initialized and started

# During deletion:
🗑️ Delete worker processing canvas for job job_xxx
✅ Delete worker completed job job_xxx: N nodes deleted
```

### Check UI State

**Browser DevTools Console**:
```javascript
// Should see these logs during deletion:
[DataManagementCard] Delete job created: job_xxx
[BackgroundOperations] Job added: job_xxx
[BackgroundOperations] Job updated: job_xxx (progress: 50%)
[BackgroundOperations] Job completed: job_xxx
```

---

## Related Files

### Backend
- [DeleteWorker.ts](../apps/api/src/modules/workers/infrastructure/DeleteWorker.ts) - Worker implementation (FIXED)
- [OrphanedJobRecovery.ts](../apps/api/src/modules/jobs/infrastructure/OrphanedJobRecovery.ts) - Cleanup mechanism
- [data-management.ts](../apps/api/src/routes/data-management.ts) - Delete endpoint
- [import-jobs.routes.ts](../apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts) - Job endpoint
- [index.ts](../apps/api/src/index.ts) - Server initialization

### Frontend
- [DataManagementCard.tsx](../apps/web/src/components/settings/DataManagementCard.tsx) - UI component (FIXED)
- [ConfirmationModal.tsx](../apps/web/src/components/common/ConfirmationModal.tsx) - Modal component
- [BackgroundOperationsContext.tsx](../apps/web/src/contexts/BackgroundOperationsContext.tsx) - Job tracking

### Tests
- [jobs-batched-delete.test.ts](../apps/api/src/__tests__/jobs-batched-delete.test.ts) - Integration tests (UPDATED)
- [data-management-ui-updates.spec.ts](../tests/e2e/data-management-ui-updates.spec.ts) - E2E tests (UPDATED)

---

## Lessons Learned

### 1. Always Specify Node Kinds Explicitly

**DON'T**:
```sql
DELETE FROM nodes WHERE account_id = ?;  -- Deletes EVERYTHING!
```

**DO**:
```sql
DELETE FROM nodes
WHERE account_id = ?
AND kind IN ('ChatThread', 'Message', 'Source', 'CodeBlock', 'Group', 'Folder');
```

### 2. Always Add Timeouts for Async Operations

**DON'T**:
```typescript
setInterval(() => {
  checkStatus(); // Runs forever if status never changes!
}, 1000);
```

**DO**:
```typescript
let totalChecks = 0;
const MAX_CHECKS = 300;
setInterval(() => {
  if (++totalChecks >= MAX_CHECKS) {
    cleanup(); // Timeout after 5 minutes
    return;
  }
  checkStatus();
}, 1000);
```

### 3. Test Edge Cases First

The new test `Delete Scope Verification > should preserve system nodes` should have been written BEFORE implementing delete functionality. This would have caught the bug immediately.

**Test-Driven Development Approach**:
1. Write test that verifies system nodes are preserved
2. Watch it fail (because DeleteWorker deletes everything)
3. Fix DeleteWorker to make test pass
4. Prevent regression forever

---

## Future Improvements

### 1. Add Schema Validation

Create a `SYSTEM_NODE_KINDS` constant that's shared across:
- DeleteWorker
- Data management routes
- Tests

```typescript
// packages/types/src/node-kinds.ts
export const CANVAS_DATA_NODE_KINDS = [
  'ChatThread',
  'Message',
  'Source',
  'CodeBlock',
  'Group',
  'Folder',
] as const;

export const SYSTEM_NODE_KINDS = [
  'UserNode',
  'AccountNode',
  'Board',
  'Constellation',
] as const;
```

### 2. Add Mutation Observers

Track button state changes in E2E tests:
```typescript
// Detect when button gets stuck
page.on('locator', (locator) => {
  if (locator.disabled && locator.text === 'Clearing Data...') {
    // Button has been disabled for >5 seconds - flag it!
  }
});
```

### 3. Add Circuit Breaker

If delete jobs fail repeatedly, stop accepting new delete requests:
```typescript
if (recentDeleteFailures > 3) {
  throw new Error('Delete operations temporarily disabled due to repeated failures');
}
```

---

## Acknowledgments

**Bug Report**: User reported "deleted data still shows in graph, button doesn't work"

**Root Cause Analysis**: Systematic investigation through all 5 layers (Backend → Frontend → UI/UX → Tests → Docs)

**Fix Verification**:
- Integration tests verify scope fix
- E2E tests verify UI behavior
- Manual testing confirms user issue resolved

---

## Changelog

### [2025-11-16] - FIXED

#### Backend
- Fixed DeleteWorker to only delete canvas data nodes
- Fixed DeleteWorker to preserve system nodes (UserNode, AccountNode, Board, Constellation)
- Updated countNodesToDelete() to match getNodeIdBatch() logic
- Added comments explaining system vs canvas node distinction

#### Frontend
- Added 5-second timeout for missing operations
- Added 5-minute timeout for stuck jobs
- Added automatic state reset on button click
- Improved button disable logic to check for active job
- Added user-friendly error messages for timeout scenarios
- Added tooltip explaining why button is disabled

#### Tests
- Added Delete Scope Verification test
- Added countCanvasNodes() and countSystemNodes() helpers
- Enhanced E2E tests with button state checks
- Added modal content verification
- Added delete job creation verification

#### Documentation
- Created this comprehensive bug fix document
- Updated DeleteWorker comments
- Updated DataManagementCard comments
- Added TODOs for future improvements

---

**Status**: ✅ Fixed, Tested, Documented, Ready for Production
