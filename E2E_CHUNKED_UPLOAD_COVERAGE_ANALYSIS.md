# E2E Test Coverage Analysis: Chunked Upload Workflow

**Date**: 2025-11-18
**Analysis**: Evaluating existing E2E tests against chunked upload requirements

---

## Requirements Checklist

Your requirements for E2E test coverage:
1. ✅ Uploading data
2. ✅ Interruption
3. ✅ Resumption
4. ✅ Upload completion
5. ✅ Deletion
6. ✅ Deletion confirmation via backend and UI

---

## Current Test Coverage Analysis

### 📁 [tests/e2e/import-workflow.spec.ts](tests/e2e/import-workflow.spec.ts)

**What it tests:**
- ✅ File upload (ChatGPT export files)
- ✅ Job creation and monitoring
- ✅ Import completion polling
- ✅ Data verification (nodes created)
- ✅ Error handling (invalid JSON, empty files)
- ✅ Authentication requirements
- ✅ Concurrent imports

**What it DOES NOT test for chunked uploads:**
- ❌ **Chunked file upload** (uses direct file upload, not chunked)
- ❌ **Upload session creation**
- ❌ **Chunk-by-chunk progress tracking**
- ❌ **Upload interruption**
- ❌ **Upload resumption**
- ❌ **Missing chunk detection**

**Verdict**: Does NOT cover chunked upload workflow ❌

---

### 📁 [tests/e2e/data-management-ui-updates.spec.ts](tests/e2e/data-management-ui-updates.spec.ts)

**What it tests:**
- ✅ Canvas data deletion via UI
- ✅ Delete job creation and monitoring
- ✅ Background operations table updates
- ✅ Job deletion (single & bulk)
- ✅ SSE job completion events
- ✅ Loading state management
- ✅ Auto-removal of completed jobs
- ✅ **Deletion confirmation via backend** (checks DB state)
- ✅ **Deletion confirmation via UI** (checks UI updates)
- ✅ Error handling and recovery

**What it DOES NOT test for chunked uploads:**
- ❌ **Upload session deletion**
- ❌ **Temporary file cleanup**
- ❌ **Chunk file cleanup**
- ❌ **Upload cancellation**

**Verdict**: Excellent deletion coverage, but NOT for upload sessions ⚠️

---

## Gap Analysis

### 1. Uploading Data ❌ **NOT COVERED**

**Missing Tests:**
- Creating upload session via `POST /api/v1/uploads/initiate`
- Uploading chunks via `POST /api/v1/uploads/:sessionId/chunks/:index`
- Progress tracking (chunks uploaded / total chunks)
- Concurrent chunk uploads (3-6 parallel)
- Session state tracking (`uploading` → `assembling` → `completed`)

**Current Status**: Existing tests use direct file upload (`POST /api/v1/jobs/import`), NOT chunked upload

---

### 2. Interruption ❌ **NOT COVERED**

**Missing Tests:**
- Mid-upload interruption (browser close/refresh)
- Network failure during chunk upload
- Server restart during upload
- Expired upload session handling
- Partial chunk upload (chunk upload fails mid-stream)

**Current Status**: No interruption testing exists

---

### 3. Resumption ❌ **NOT COVERED**

**Missing Tests:**
- Query upload session status (`GET /api/v1/uploads/:sessionId`)
- Detect missing chunks (`session.missingChunks`)
- Resume upload from interrupted state
- Upload only missing chunks (not already uploaded)
- localStorage persistence of session ID
- Session expiry handling (4-hour TTL)

**Current Status**: No resumption testing exists

---

### 4. Upload Completion ❌ **NOT COVERED**

**Missing Tests:**
- All chunks received (session status → `assembling`)
- Auto-assembly triggered when last chunk received
- Assembled file created in temp directory
- Job creation after assembly completes
- `setJobId()` called to link job to session
- Import processing started
- Session status → `completed`
- Temp file cleanup after completion

**Current Status**: Import completion is tested, but NOT after chunked upload assembly

---

### 5. Deletion ⚠️ **PARTIALLY COVERED**

**Existing Coverage:**
- ✅ Canvas data deletion (nodes, edges)
- ✅ Job deletion (single & bulk)
- ✅ Background operations table updates after deletion
- ✅ SSE events for job completion

**Missing Coverage:**
- ❌ **Upload session deletion**
  - Delete incomplete upload sessions
  - Clean up temp chunk files
  - Verify chunks directory removed
- ❌ **Upload cancellation**
  - Cancel in-progress upload
  - Stop chunk uploads
  - Mark session as `cancelled`

**Current Status**: Good deletion coverage for jobs/nodes, but NOT for upload sessions

---

### 6. Deletion Confirmation via Backend and UI ✅ **WELL COVERED**

**Existing Coverage:**
- ✅ **Backend verification** ([data-management-ui-updates.spec.ts](tests/e2e/data-management-ui-updates.spec.ts)):
  - Lines 293-360: Verifies delete job created in DB
  - Lines 362-374: Checks background operations table state
  - Lines 376-473: Verifies row removal after deletion

- ✅ **UI verification**:
  - Lines 293-360: UI updates without page reload
  - Lines 709-735: Loading states during deletion
  - Lines 739-786: SSE updates trigger UI refresh
  - Lines 788-892: Bulk deletion UI feedback

**Missing for Upload Sessions:**
- ❌ Verify upload session deleted from `upload_sessions` table
- ❌ Verify chunk files removed from temp directory

**Current Status**: Excellent coverage for job/data deletion, needs extension for upload sessions

---

## Comprehensive Gap Summary

| Requirement | Current Coverage | Status | Missing Tests |
|-------------|------------------|--------|---------------|
| **1. Uploading data** | ❌ 0% | NOT COVERED | Session creation, chunk upload, progress tracking |
| **2. Interruption** | ❌ 0% | NOT COVERED | Browser close, network failure, server restart |
| **3. Resumption** | ❌ 0% | NOT COVERED | Session query, missing chunks, resume upload |
| **4. Upload completion** | ❌ 0% | NOT COVERED | Assembly, job creation, import start |
| **5. Deletion** | ⚠️ 50% | PARTIAL | Upload session deletion, chunk cleanup |
| **6. Deletion confirmation** | ✅ 90% | GOOD | Upload session deletion verification |

**Overall Coverage**: **~23% of chunked upload workflow tested**

---

## Recommended Test Implementation

### Priority 1: Core Chunked Upload Workflow (CRITICAL)

Create new test file: `tests/e2e/chunked-upload-workflow.spec.ts`

```typescript
test.describe('Chunked Upload Workflow', () => {
  test.describe.configure({ tag: '@smoke' });

  // Test 1: Upload session creation
  test('should create upload session with nullable jobId', async ({ apiRequest }) => {
    // POST /api/v1/uploads/initiate
    // Verify: session created, jobId is null, chunksPath set
  });

  // Test 2: Chunk upload
  test('should upload chunks and track progress', async ({ apiRequest }) => {
    // POST /api/v1/uploads/:sessionId/chunks/0
    // POST /api/v1/uploads/:sessionId/chunks/1
    // Verify: chunks saved, progress updated
  });

  // Test 3: Assembly and job creation
  test('should trigger assembly after all chunks uploaded', async ({ apiRequest }) => {
    // Upload all chunks
    // Verify: status → 'assembling', job created, jobId set
  });

  // Test 4: Import processing
  test('should process import after assembly completes', async ({ apiRequest }) => {
    // Upload all chunks → Assembly → Job created
    // Verify: nodes created, edges created
  });
});
```

### Priority 2: Interruption & Resumption (HIGH)

```typescript
test.describe('Upload Interruption & Resumption', () => {
  // Test 5: Interruption
  test('should handle mid-upload interruption', async ({ page, context }) => {
    // Start upload → Close browser mid-upload
    // Verify: partial chunks saved, session state preserved
  });

  // Test 6: Resumption
  test('should resume upload from interrupted state', async ({ page }) => {
    // Query session status
    // Get missing chunks
    // Upload only missing chunks
    // Verify: upload completes successfully
  });

  // Test 7: Session expiry
  test('should mark expired sessions as failed', async ({ apiRequest }) => {
    // Create session with short TTL
    // Wait for expiry
    // Verify: status → 'expired'
  });
});
```

### Priority 3: Deletion & Cleanup (MEDIUM)

```typescript
test.describe('Upload Session Deletion', () => {
  // Test 8: Session deletion
  test('should delete upload session and temp files', async ({ apiRequest }) => {
    // Create session with chunks
    // DELETE /api/v1/uploads/:sessionId
    // Verify: session deleted from DB, chunks directory removed
  });

  // Test 9: Upload cancellation
  test('should cancel in-progress upload', async ({ page }) => {
    // Start upload
    // Click cancel button
    // Verify: status → 'cancelled', chunks cleaned up
  });

  // Test 10: Auto-cleanup
  test('should auto-clean up expired sessions', async ({ apiRequest }) => {
    // Create expired session
    // Wait for cleanup cron
    // Verify: session deleted, temp files removed
  });
});
```

---

## Implementation Effort Estimate

| Test Suite | Tests | Complexity | Effort | Priority |
|------------|-------|------------|--------|----------|
| Core Chunked Upload | 4 tests | Medium | 4-6 hours | CRITICAL ⭐⭐⭐ |
| Interruption & Resumption | 3 tests | High | 6-8 hours | HIGH ⭐⭐ |
| Deletion & Cleanup | 3 tests | Low | 2-3 hours | MEDIUM ⭐ |
| **TOTAL** | **10 tests** | - | **12-17 hours** | - |

---

## Quick Win: Extend Existing Tests

### Minimal Effort Option (2-3 hours)

Instead of creating a new test file, extend existing tests:

1. **Extend [import-workflow.spec.ts](tests/e2e/import-workflow.spec.ts)**:
   ```typescript
   test('should upload file using chunked upload', async ({ apiRequest }) => {
     // 1. Create upload session
     // 2. Upload 5 chunks
     // 3. Verify assembly
     // 4. Verify import completes
   });
   ```

2. **Extend [data-management-ui-updates.spec.ts](tests/e2e/data-management-ui-updates.spec.ts)**:
   ```typescript
   test('should delete upload sessions when clearing canvas data', async ({ page }) => {
     // 1. Create upload session with chunks
     // 2. Clear canvas data
     // 3. Verify upload session deleted
     // 4. Verify temp files cleaned up
   });
   ```

**Effort**: 2-3 hours
**Coverage Gain**: +40% (basic upload + deletion)

---

## Recommendation

### Option A: Comprehensive Coverage (12-17 hours)
- Create dedicated `chunked-upload-workflow.spec.ts`
- Implement all 10 tests
- Achieves 95%+ chunked upload coverage
- **Best for production deployment**

### Option B: Quick Win (2-3 hours)
- Extend 2 existing test files
- Implement 2 critical tests
- Achieves 63% chunked upload coverage
- **Best for rapid validation**

### Option C: Hybrid Approach (6-8 hours)
- Create `chunked-upload-workflow.spec.ts`
- Implement Priority 1 tests (core workflow)
- Extend existing tests for deletion
- Achieves 80% chunked upload coverage
- **Best for balanced coverage**

---

## Final Verdict

### Current State: ❌ **INSUFFICIENT COVERAGE**

The existing E2E tests do **NOT** properly cover the chunked upload workflow:
- ❌ 0% coverage for upload session creation
- ❌ 0% coverage for chunk upload
- ❌ 0% coverage for interruption
- ❌ 0% coverage for resumption
- ❌ 0% coverage for upload completion (assembly → job creation)
- ⚠️ 50% coverage for deletion (jobs covered, upload sessions not covered)
- ✅ 90% coverage for deletion confirmation (excellent backend + UI verification)

**Overall**: Only **23% of chunked upload workflow** is tested

---

## Next Steps

1. **Immediate** (if deploying soon):
   - Option B: Add 2 critical tests to existing files (2-3 hours)
   - Validates upload works and cleans up properly

2. **Short-term** (this week):
   - Option C: Implement core workflow tests (6-8 hours)
   - Provides solid coverage for production

3. **Long-term** (this month):
   - Option A: Full test suite (12-17 hours)
   - Ensures bulletproof chunked upload system

---

**Generated**: 2025-11-18
**Analysis**: E2E Test Coverage for Chunked Upload Workflow
