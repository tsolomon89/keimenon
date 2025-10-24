# Jobs System Testing & Startup Guide

## Overview

This document outlines the testing strategy and startup script changes needed for the new **Unified Background Jobs System** with SSE streaming.

---

## 📋 Required Changes Summary

### ✅ Database Schema

**Status:** Already handled via migration 008

The jobs tables are created via migration `008_unified_jobs.sql` which includes:

- `jobs` table
- `job_events` table
- `job_items` table
- `job_idempotency` table
- Indexes, triggers, and views

**Action Required:** None - migration runs automatically on server start

---

### ✅ Startup Scripts

**Status:** No changes needed, but good to understand

The `npm run dev:clean` script already:

1. ✅ Kills conflicting processes on ports 3000 and 4001
2. ✅ Validates environment variables
3. ✅ Checks database availability (SQLite in local mode)
4. ✅ Starts API server (which runs migrations)
5. ✅ Waits for `/health` endpoint
6. ✅ Starts web server

**How Jobs System Starts:**

```javascript
// In apps/api/src/index.ts (lines 519-558)
async function start() {
  // 1. Database migrations run (including 008_unified_jobs.sql)
  if ((dbClient as any).initializeSchema) {
    await (dbClient as any).initializeSchema();
  }

  // 2. SSE Broadcaster initializes
  sseBroadcaster = new SSEBroadcaster();

  // 3. Worker Pool starts (5s polling for queued jobs)
  const jobRepository = new SQLiteJobRepository((dbClient as any).db);
  const startJob = new StartJob(jobRepository);

  const importWorker = new ImportWorker(dbClient);
  const deleteWorker = new DeleteWorker(dbClient);

  workerPool = new WorkerPool(
    jobRepository,
    startJob,
    sseBroadcaster,
    { maxWorkers: 3, pollInterval: 5000 }
  );

  workerPool.registerWorker(importWorker);
  workerPool.registerWorker(deleteWorker);

  await workerPool.start();
  console.log('✅ Worker pool started');
}
```

**Action Required:** None - everything auto-starts with `npm run dev`

---

## 🧪 Test Suite Updates Required

### 1. **NEW: Jobs System Integration Tests**

**File:** `apps/api/src/__tests__/jobs-system.test.ts` (needs to be created)

**Purpose:** Test the complete job lifecycle from creation → execution → completion

**Test Coverage:**

```typescript
describe('Jobs System Integration Tests', () => {
  describe('Import Jobs', () => {
    it('should create import job from file upload', async () => {
      // POST /api/v1/jobs/import (multipart file)
      // Verify job created with status: queued
      // Verify file metadata in job config
    });

    it('should process import job and update progress', async () => {
      // Create job
      // Wait for worker to pick it up
      // Monitor progress via job_events table
      // Verify status transitions: queued → running → succeeded
    });

    it('should emit SSE events during import', async () => {
      // Connect to SSE stream
      // Create import job
      // Verify jobs.update events received
      // Verify progress updates
    });

    it('should handle import job failure', async () => {
      // Upload malformed JSON file
      // Verify job fails with error details
      // Verify error in job_events
    });

    it('should support job cancellation', async () => {
      // Create long-running import
      // DELETE /api/v1/jobs/:id (cancel)
      // Verify status: canceled
    });
  });

  describe('Delete Jobs', () => {
    it('should create delete job with exclusive lock', async () => {
      // POST /api/v1/jobs/delete { scope: 'canvas' }
      // Verify concurrency_group: 'delete:{accountId}'
      // Attempt second delete job
      // Verify second job blocked until first completes
    });

    it('should delete all canvas data', async () => {
      // Create test data (nodes, edges)
      // Create delete job (scope: canvas)
      // Wait for completion
      // Verify all nodes deleted
      // Verify all edges deleted
    });

    it('should delete client data only', async () => {
      // Create test data including UserNode
      // Create delete job (scope: all-clients)
      // Verify client data deleted
      // Verify UserNode preserved
    });
  });

  describe('Job Idempotency', () => {
    it('should prevent duplicate jobs with same idempotency key', async () => {
      // POST /api/v1/jobs (with idempotencyKey)
      // POST /api/v1/jobs (same key)
      // Verify second request returns existing job
      // Verify status: 'existing'
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('should isolate jobs by account', async () => {
      // Create job for account A
      // Create job for account B
      // Query jobs as account A → should only see A's jobs
      // Query jobs as account B → should only see B's jobs
    });

    it('should isolate SSE streams by account', async () => {
      // Connect SSE as account A
      // Connect SSE as account B
      // Create job for account A
      // Verify only A's stream receives update
    });
  });

  describe('Worker Pool', () => {
    it('should respect max workers limit', async () => {
      // Create 5 import jobs (maxWorkers: 3)
      // Verify only 3 jobs running concurrently
      // Verify remaining 2 stay queued
    });

    it('should handle worker failures', async () => {
      // Create job that throws exception in worker
      // Verify job marked as failed
      // Verify worker pool continues processing other jobs
    });
  });
});
```

**Test Data Files:**

- Use existing: `ai_context/chat_data/test-samples/tiny.json`
- Use existing: `ai_context/chat_data/test-samples/small.json`

**Estimated LOC:** ~600-800 lines

---

### 2. **UPDATE: Import Enhanced Tests**

**File:** `apps/api/src/__tests__/import-enhanced.test.ts`

**Current State:** Tests synchronous `/api/v1/import/enhanced` endpoint

**Changes Needed:**

```typescript
// OPTION 1: Keep existing tests (legacy endpoint still works)
describe('Legacy Import Endpoint (Synchronous)', () => {
  // Keep all existing tests as-is
  // This endpoint still functions for backward compatibility
});

// OPTION 2: Add new tests for job-based endpoint
describe('Job-Based Import Endpoint (Async)', () => {
  it('should create import job instead of processing synchronously', async () => {
    const formData = new FormData();
    formData.append('files', fs.createReadStream('tiny.json'));

    const response = await fetch('http://localhost:4001/api/v1/jobs/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.jobId).toBeDefined();
    expect(data.job.status).toBe('queued');
  });
});
```

**Action Required:** Add new test section for job-based imports

---

### 3. **UPDATE: UI Integration Tests**

**File:** `apps/api/src/__tests__/ui-integration-test.test.ts`

**Changes Needed:**

```typescript
describe('SSE Job Streaming', () => {
  it('should receive real-time job updates via SSE', async () => {
    // 1. Connect to SSE stream
    const eventSource = new EventSource(`http://localhost:4001/api/v1/stream/jobs?token=${token}`);

    const events = [];
    eventSource.addEventListener('jobs.update', (event) => {
      events.push(JSON.parse(event.data));
    });

    // 2. Create import job
    await fetch('http://localhost:4001/api/v1/jobs/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: createMultipartForm('tiny.json'),
    });

    // 3. Wait for events
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 4. Verify events received
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.jobs[0].status === 'running')).toBe(true);
    expect(events.some((e) => e.jobs[0].status === 'succeeded')).toBe(true);

    eventSource.close();
  });

  it('should handle SSE reconnection', async () => {
    // Connect, disconnect, reconnect
    // Verify events continue after reconnection
  });
});
```

**Action Required:** Add SSE streaming tests

---

### 4. **UPDATE: Data Management Tests**

**File:** `apps/api/src/__tests__/data-management.test.ts`

**Changes Needed:**

The existing data management tests (`DELETE /api/v1/data/canvas`, `DELETE /api/v1/data/all-clients`) should **co-exist** with the new job-based delete endpoints.

**Add comparison tests:**

```typescript
describe('Delete Endpoints Comparison', () => {
  it('should produce identical results: sync vs async delete', async () => {
    // Setup: Create identical datasets for two accounts
    await setupTestData(accountA, 100); // 100 nodes
    await setupTestData(accountB, 100); // 100 nodes

    // Account A: Synchronous delete
    const syncStart = Date.now();
    await fetch(`http://localhost:4001/api/v1/data/canvas`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const syncDuration = Date.now() - syncStart;

    // Account B: Asynchronous delete via jobs
    const asyncStart = Date.now();
    const jobResponse = await fetch(`http://localhost:4001/api/v1/jobs/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'canvas' }),
    });
    const { jobId } = await jobResponse.json();

    // Wait for job completion
    await waitForJobCompletion(jobId, tokenB);
    const asyncDuration = Date.now() - asyncStart;

    // Verify both accounts have zero nodes
    const nodesA = await countNodes(accountA);
    const nodesB = await countNodes(accountB);

    expect(nodesA).toBe(0);
    expect(nodesB).toBe(0);

    console.log(`Sync delete: ${syncDuration}ms`);
    console.log(`Async delete: ${asyncDuration}ms`);
  });
});
```

**Action Required:** Add job-based delete tests alongside existing sync tests

---

### 5. **UPDATE: README.md**

**File:** `apps/api/src/__tests__/README.md`

**Changes Needed:**

Add new section for Jobs System tests:

````markdown
### 4. **Jobs System Tests** (`jobs-system.test.ts`)

**Purpose:** Test the unified background jobs system with SSE streaming

**What It Tests:**

- ✅ Job creation and lifecycle (queued → running → succeeded/failed)
- ✅ Import worker file parsing and processing
- ✅ Delete worker with exclusive locks
- ✅ SSE real-time progress updates
- ✅ Job idempotency
- ✅ Multi-tenant job isolation
- ✅ Worker pool concurrency limits
- ✅ Job cancellation
- ✅ Error handling and recovery

**When To Run:**

- After modifying job domain models
- After updating worker implementations
- After changing SSE broadcaster logic
- Before deploying jobs system changes

**Run:**

```bash
cd apps/api
npm test jobs-system
```
````

---

## Test Coverage Matrix

| Layer                      | Backend | UI  | Data Mgmt | **Jobs System** |
| -------------------------- | ------- | --- | --------- | --------------- |
| Job Creation               | ❌      | ❌  | ❌        | ✅              |
| Job Execution              | ❌      | ❌  | ❌        | ✅              |
| SSE Streaming              | ❌      | ⚠️  | ❌        | ✅              |
| Import Worker              | ⚠️      | ❌  | ❌        | ✅              |
| Delete Worker              | ❌      | ❌  | ⚠️        | ✅              |
| Concurrency Control        | ❌      | ❌  | ❌        | ✅              |
| Idempotency                | ❌      | ❌  | ❌        | ✅              |
| Multi-Tenant Job Isolation | ❌      | ❌  | ❌        | ✅              |

````

**Action Required:** Update test coverage matrix and add new section

---

## 🚀 Quick Start (Updated)

### Run All Tests (Including Jobs System)

```bash
cd apps/api
npm test
````

### Run Only Jobs System Tests

```bash
cd apps/api
npm test jobs-system
```

### Run With SSE Event Logging

```bash
DEBUG=sse npm test jobs-system
```

---

## 📊 Test File Structure (After Updates)

```
apps/api/src/__tests__/
├── README.md                           # ← UPDATE: Add jobs system section
├── comprehensive-system-test.ts        # ← No changes needed
├── ui-integration-test.test.ts         # ← UPDATE: Add SSE tests
├── data-management.test.ts             # ← UPDATE: Add job-based delete tests
├── import-enhanced.test.ts             # ← UPDATE: Add job-based import tests
└── jobs-system.test.ts                 # ← NEW: Complete jobs lifecycle tests
```

---

## 🎯 Priority Order for Test Implementation

### Priority 1: Critical Path (Must Have)

1. ✅ Create `jobs-system.test.ts`
   - Job creation tests
   - Import worker tests
   - Delete worker tests
   - Basic SSE tests

### Priority 2: Integration (Should Have)

2. ✅ Update `ui-integration-test.test.ts`
   - SSE reconnection tests
   - Multi-account streaming tests

3. ✅ Update `import-enhanced.test.ts`
   - Job-based import endpoint tests

### Priority 3: Comparison (Nice to Have)

4. ✅ Update `data-management.test.ts`
   - Sync vs async delete comparison
   - Performance benchmarks

5. ✅ Update `README.md`
   - Test coverage matrix
   - Quick start guide

---

## 🔧 Development Workflow

### 1. **Start Dev Server with Jobs System**

```bash
# Clean start (recommended)
npm run dev:clean

# This automatically:
# - Runs migration 008 (jobs tables)
# - Starts SSE broadcaster
# - Starts worker pool (3 workers, 5s polling)
# - Enables /api/v1/jobs/* endpoints
# - Enables /api/v1/stream/jobs SSE stream
```

### 2. **Verify Jobs System Running**

```bash
# Check health endpoint
curl http://localhost:4001/health

# Expected response:
{
  "status": "ok",
  "dependencies": {
    "database": "connected"
  }
}

# Check database for jobs tables
sqlite3 ~/.canvas-memory/canvas.db
> SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%job%';

# Expected output:
# jobs
# job_events
# job_items
# job_idempotency
```

### 3. **Test Import Job Manually**

```bash
# Get auth token (from seed migration)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...." # Admin token

# Create import job
curl -X POST http://localhost:4001/api/v1/jobs/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@ai_context/chat_data/test-samples/tiny.json"

# Expected response:
{
  "success": true,
  "jobId": "job_1234567890_abcdef",
  "message": "Import job created. Monitor progress via SSE at /api/v1/stream/jobs"
}

# Monitor via SSE (in another terminal)
curl -N http://localhost:4001/api/v1/stream/jobs?token=$TOKEN

# Expected output (real-time):
data: {"jobs":[{"jobId":"job_...","status":"queued","progress":{"percent":0}}]}

data: {"jobs":[{"jobId":"job_...","status":"running","progress":{"percent":25}}]}

data: {"jobs":[{"jobId":"job_...","status":"succeeded","progress":{"percent":100}}]}
```

### 4. **Test Delete Job Manually**

```bash
# Create delete job
curl -X POST http://localhost:4001/api/v1/jobs/delete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scope":"all-clients"}'

# Monitor progress via SSE (same as above)
```

---

## 🐛 Debugging Jobs System

### Check Worker Pool Status

```bash
# API server logs will show:
[API] 📋 Worker pool polling... (0 queued jobs)
[API] 🔄 Starting job: job_1234567890_abcdef (import)
[API] 📥 Import worker processing 1 file(s) for job job_...
[API] ✅ Import worker completed job job_...: 10 messages, 1 conversations
[API] ✅ Job succeeded: job_1234567890_abcdef
```

### Check Job Events

```bash
sqlite3 ~/.canvas-memory/canvas.db

# View all events for a job
SELECT type, sequence_number, timestamp, json_extract(data, '$.message') as message
FROM job_events
WHERE job_id = 'job_1234567890_abcdef'
ORDER BY sequence_number;

# Expected output:
# job.queued      | 0 | 1234567890000 | null
# job.started     | 1 | 1234567891000 | null
# job.progress    | 2 | 1234567892000 | "Loading files..."
# job.progress    | 3 | 1234567893000 | "Running import pipeline..."
# job.succeeded   | 4 | 1234567894000 | "Import complete"
```

### Check SSE Connections

```bash
# In worker pool logs:
[API] 📡 SSE client connected for account acc_...
[API] 📡 Broadcasting update to 1 connection(s) for account acc_...
```

---

## ✅ Checklist

### Before Committing Jobs System Code

- [ ] Run all tests: `npm test`
- [ ] Create `jobs-system.test.ts` with core tests
- [ ] Update `ui-integration-test.test.ts` with SSE tests
- [ ] Update `import-enhanced.test.ts` with job-based tests
- [ ] Update `data-management.test.ts` with comparison tests
- [ ] Update `README.md` with test coverage matrix
- [ ] Test manual import job creation
- [ ] Test manual delete job creation
- [ ] Verify SSE streaming works
- [ ] Verify worker pool processes jobs
- [ ] Check database for job records
- [ ] Check database for job events

### Before Deploying to Production

- [ ] All tests passing in CI
- [ ] Load testing with concurrent jobs
- [ ] SSE stress testing (100+ connections)
- [ ] Migration 008 tested on staging database
- [ ] Worker pool tested with real files
- [ ] Delete jobs tested with large datasets
- [ ] Idempotency tested with duplicate requests
- [ ] Multi-tenant isolation verified

---

## 📚 Related Documentation

- [apps/api/src/modules/jobs/README.md](apps/api/src/modules/jobs/README.md) - Jobs domain architecture
- [apps/api/src/modules/workers/README.md](apps/api/src/modules/workers/README.md) - Worker implementations
- [packages/db/src/sqlite/migrations/008_unified_jobs.sql](packages/db/src/sqlite/migrations/008_unified_jobs.sql) - Database schema

---

**Last Updated:** 2025-10-18
**Status:** ✅ Ready for Implementation
**Author:** Canvas Memory Team
