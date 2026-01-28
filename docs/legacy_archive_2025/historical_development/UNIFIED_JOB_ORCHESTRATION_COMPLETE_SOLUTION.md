# Unified Job Orchestration - Complete Solution Architecture

**Date**: 2025-10-18
**Status**: 🚧 In Progress - Comprehensive Implementation Plan
**Priority**: Critical - System Currently Non-Functional

---

## Executive Summary

We've been fixing symptoms (state machine transitions, SSE formats, database migrations) rather than addressing the **fundamental architectural problems**. This document provides a complete, exhaustive solution based on industry-standard patterns.

### What We're Building

A **modular monolith** with:

- **Background job processing** (Producer-Consumer pattern)
- **Worker pool with supervisor** (bounded concurrency + backpressure)
- **Event sourcing** (append-only job_events log)
- **Reactive UI** (SSE pub/sub for real-time updates)
- **CQRS-lite** (read models separated from write models)
- **Finite State Machine** (rigorous job lifecycle)

### Industry Terms

- **Asynchronous Task Queue** = Jobs table + worker pool
- **Job Orchestration** = Multi-phase workflow (parse → dedupe → persist → group)
- **Pub/Sub** = SSE broadcaster pushing to subscribed clients
- **Event Sourcing** = Append-only job_events for full audit trail
- **Backpressure** = Limit N concurrent jobs, queue the rest
- **Reactive UI** = Live updates via observable streams
- **Service-Oriented Monolith** = Clean module boundaries in single process

---

## Current System State Analysis

### What's Broken (Symptoms)

1. ❌ **Settings page not loading** - UI thread starvation
2. ❌ **Jobs table empty** - SSE not connecting or broadcasting
3. ❌ **Jobs stuck in blocked state** - Concurrency logic deadlock
4. ❌ **No real-time updates** - Pull-only, no push
5. ❌ **Silent failures** - Errors swallowed, no visibility

### Root Causes

#### 1. **No Automatic Migration System**

- Migration 008 exists but isn't run automatically
- Developers must remember to run manually
- **Result**: Jobs table missing, system non-functional

#### 2. **Incorrect Concurrency Logic**

```typescript
// BROKEN: Counts 'queued' jobs as "active"
AND status IN ('queued', 'running', 'blocked')

// CORRECT: Only 'running' jobs block others
AND status = 'running'
```

- **Result**: All jobs block each other (deadlock)

#### 3. **SSE Not Properly Integrated**

- SSE broadcaster runs but no jobs exist to broadcast
- Frontend connects but receives no events
- **Result**: UI shows stale state

#### 4. **No Error Boundaries**

- Database errors caught and swallowed
- No user feedback when operations fail
- **Result**: Silent failures, confused users

#### 5. **State Synchronization Issues**

- Frontend has its own job state (BackgroundOperationsContext)
- Backend has database state
- SSE supposed to sync them but doesn't work
- **Result**: UI shows phantom jobs

---

## Complete Architecture Design

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ Settings   │  │ Dashboard   │  │ BackgroundOps        │ │
│  │ (Trigger)  │  │ (View)      │  │ Context (State)      │ │
│  └─────┬──────┘  └──────▲──────┘  └──────▲───────────────┘ │
│        │                 │                 │                 │
│        │ POST            │ GET             │ SSE             │
│        │ /jobs/delete    │ /jobs           │ /stream/jobs    │
└────────┼─────────────────┼─────────────────┼─────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Server (Express)                      │
│  ┌──────────────┐  ┌────────────┐  ┌────────────────────┐  │
│  │ Jobs Routes  │  │ Jobs Query │  │ SSE Broadcaster    │  │
│  │ (Commands)   │  │ (Queries)  │  │ (Event Stream)     │  │
│  └──────┬───────┘  └─────▲──────┘  └─────▲──────────────┘  │
│         │                 │                │                 │
│         ▼                 │                │                 │
│  ┌──────────────────────┐ │                │                 │
│  │ EnqueueJob Use Case  │ │                │                 │
│  │ (Domain Service)     │ │                │                 │
│  └──────┬───────────────┘ │                │                 │
│         │                 │                │                 │
│         ▼                 │                │                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              JobRepository (Data Layer)             │    │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────────┐ │    │
│  │  │ save()  │  │ find()   │  │ appendEvent()      │ │    │
│  │  └────┬────┘  └────▲─────┘  └────▲───────────────┘ │    │
│  └───────┼────────────┼─────────────┼──────────────────┘    │
│          │            │             │                        │
└──────────┼────────────┼─────────────┼────────────────────────┘
           │            │             │
           ▼            ▼             │
    ┌─────────────────────────────────┼──────────────────┐
    │            SQLite Database       │                  │
    │  ┌───────┐  ┌────────────┐  ┌──┴────────────┐     │
    │  │ jobs  │  │ job_events │  │ job_items     │     │
    │  └───▲───┘  └──────▲─────┘  └───────────────┘     │
    └──────┼─────────────┼──────────────────────────────┘
           │             │
           │  ┌──────────┴──────────┐
           │  │                     │
    ┌──────┴──┴────────┐     ┌──────▼────────────┐
    │   Worker Pool    │     │  SSE Coalescer    │
    │   (Supervisor)   │     │  (500ms ticker)   │
    │                  │     │                   │
    │  ┌────────────┐  │     │  Broadcasts:      │
    │  │ Import     │  │     │  - Job state      │
    │  │ Worker     │  │     │  - Progress       │
    │  └────────────┘  │     │  - Errors         │
    │                  │     └───────────────────┘
    │  ┌────────────┐  │
    │  │ Delete     │  │
    │  │ Worker     │  │
    │  └────────────┘  │
    │                  │
    │  Max: 3 jobs     │
    │  Poll: 5s        │
    └──────────────────┘
```

### Data Flow Diagrams

#### Write Path (Command)

```
User clicks "Clear Keimenon Data"
  ↓
POST /api/v1/jobs/delete { scope: 'keimenon' }
  ↓
EnqueueJob.execute()
  ├─ Validate input
  ├─ Check idempotency
  ├─ Create Job aggregate
  │   ├─ Generate ID
  │   ├─ Set status='queued'
  │   ├─ Record createdAt
  │   └─ Add 'job.queued' event
  ├─ JobRepository.save(job)
  │   ├─ INSERT INTO jobs
  │   └─ INSERT INTO job_events
  └─ Return { jobId, status: 'created' }
  ↓
Response: 201 { jobId: 'job_xxx', message: 'Monitor via SSE' }
```

#### Read Path (Query)

```
Frontend loads Dashboard
  ↓
GET /api/v1/jobs?limit=50
  ↓
JobRepository.find({ status: ['queued', 'running'], limit: 50 })
  ↓
SELECT * FROM jobs WHERE status IN ('queued', 'running') ORDER BY created_at DESC
  ↓
Map DB records → Job aggregates
  ↓
Return { jobs: [ {...}, {...} ] }
  ↓
Frontend: convertAPIJobToImportJob()
  ↓
Display in table
```

#### Event Path (SSE Stream)

```
Worker updates job progress
  ↓
job.reportProgress(50, 100, 'Deleting nodes...')
  ├─ Update _progress
  ├─ Add 'job.progress' event
  └─ SSEBroadcaster.broadcastJobUpdate(job)
      ↓
      Coalesce events (500ms window)
      ↓
      Flush to connected clients
      ↓
      EventSource receives:
      {
        type: 'jobs.update',
        data: {
          jobs: [{
            jobId: 'job_xxx',
            status: 'running',
            progress: { current: 50, total: 100, percent: 50 },
            timestamp: 1760815970694
          }]
        }
      }
      ↓
      useJobStream updates Map<jobId, JobUpdate>
      ↓
      React re-renders with new progress
```

### Worker Pool Lifecycle

```
┌─────────────────────────────────────────────────┐
│            Worker Pool (Supervisor)             │
├─────────────────────────────────────────────────┤
│                                                 │
│  Every 5 seconds:                               │
│  1. Check available slots                      │
│     capacity = maxConcurrent - activeJobs.size │
│                                                 │
│  2. Find queued jobs                            │
│     SELECT * FROM jobs                          │
│     WHERE status = 'queued'                     │
│     ORDER BY created_at                         │
│     LIMIT capacity                              │
│                                                 │
│  3. For each job:                               │
│     ┌────────────────────────────────────────┐ │
│     │ Concurrency Check                      │ │
│     │ - Is concurrencyGroup set?             │ │
│     │ - Are any RUNNING jobs in same group?  │ │
│     │ - If yes → block job                   │ │
│     │ - If no → dispatch                     │ │
│     └────────────────────────────────────────┘ │
│                                                 │
│  4. Dispatch job to worker                      │
│     ┌────────────────────────────────────────┐ │
│     │ StartJob.execute({ jobId })            │ │
│     │ - Transition: queued → running         │ │
│     │ - Record startedAt                     │ │
│     │ - Save to DB                           │ │
│     └────────────────────────────────────────┘ │
│                                                 │
│  5. Run worker in background                    │
│     worker.execute(job, context)                │
│     ├─ Phase 1: Read data                      │
│     ├─ Phase 2: Process                        │
│     ├─ Phase 3: Write results                  │
│     └─ Complete or fail                        │
│                                                 │
│  6. On completion:                              │
│     ┌────────────────────────────────────────┐ │
│     │ CompleteJob.execute()                  │ │
│     │ - Remove from activeJobs               │ │
│     │ - Transition: running → succeeded      │ │
│     │ - Record completedAt                   │ │
│     │ - Unblock waiting jobs                 │ │
│     └────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Foundation (Infrastructure)

#### Task 1.1: Automatic Migration System ✅ CRITICAL

**File**: `packages/db/src/sqlite/MigrationRunner.ts`

```typescript
import { Database } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface Migration {
  id: number;
  name: string;
  filePath: string;
}

export class MigrationRunner {
  constructor(
    private db: Database,
    private migrationsDir: string
  ) {}

  async runPendingMigrations(): Promise<void> {
    // 1. Ensure migrations tracking table exists
    this.ensureMigrationsTable();

    // 2. Get applied migrations from DB
    const applied = this.getAppliedMigrations();

    // 3. Scan migrations directory
    const available = this.getAvailableMigrations();

    // 4. Filter pending migrations
    const pending = available.filter((m) => !applied.has(m.name));

    // 5. Run each pending migration in transaction
    for (const migration of pending) {
      console.log(`🔄 Running migration: ${migration.name}`);
      this.runMigration(migration);
      console.log(`✅ Migration complete: ${migration.name}`);
    }

    if (pending.length === 0) {
      console.log('✅ All migrations up to date');
    }
  }

  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      )
    `);
  }

  private getAppliedMigrations(): Set<string> {
    const stmt = this.db.prepare('SELECT name FROM migrations ORDER BY id');
    const rows = stmt.all() as Array<{ name: string }>;
    return new Set(rows.map((r) => r.name));
  }

  private getAvailableMigrations(): Migration[] {
    const files = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // Lexicographic order: 001_xxx.sql, 002_yyy.sql

    return files.map((file, index) => ({
      id: index + 1,
      name: file,
      filePath: path.join(this.migrationsDir, file),
    }));
  }

  private runMigration(migration: Migration): void {
    const sql = fs.readFileSync(migration.filePath, 'utf-8');

    // Run in transaction
    this.db.transaction(() => {
      // Execute migration SQL
      this.db.exec(sql);

      // Record completion
      const stmt = this.db.prepare(`
        INSERT INTO migrations (name, applied_at)
        VALUES (?, ?)
      `);
      stmt.run(migration.name, Date.now());
    })();
  }
}
```

**Integration**: `apps/api/src/index.ts`

```typescript
import { MigrationRunner } from '@keimenon/db/sqlite/MigrationRunner';
import path from 'path';

// After database initialization
const dbClient = await DatabaseFactory.getClient(config);

// Run schema
if ((dbClient as any).initializeSchema) {
  await (dbClient as any).initializeSchema();
}

// NEW: Run pending migrations
const migrationsDir = path.join(__dirname, '../../packages/db/src/sqlite/migrations');
const migrationRunner = new MigrationRunner((dbClient as any).db, migrationsDir);
await migrationRunner.runPendingMigrations();
```

#### Task 1.2: Fix Concurrency Logic ✅ DONE

Already completed - changed `countActiveInGroup` to only count `'running'` jobs.

#### Task 1.3: Add Comprehensive Error Handling

**File**: `apps/api/src/modules/jobs/infrastructure/JobRepository.ts`

```typescript
async save(job: Job): Promise<void> {
  try {
    const record = job.toDatabase();

    // Upsert job
    const stmt = this.db.prepare(`
      INSERT INTO jobs (
        id, type, account_id, created_by, config, status,
        state_data, created_at, updated_at, idempotency_key,
        concurrency_group, data_tag
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        state_data = excluded.state_data,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      record.id,
      record.type,
      record.account_id,
      record.created_by,
      JSON.stringify(record.config),
      record.status,
      JSON.stringify(record.state_data),
      record.created_at,
      record.updated_at,
      record.idempotency_key,
      record.concurrency_group,
      record.data_tag
    );

    console.log(`✅ Job saved: ${job.id} (status: ${job.status})`);
  } catch (error: any) {
    console.error(`❌ Failed to save job ${job.id}:`, error);
    console.error('   Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
    });
    throw new Error(`Database error saving job: ${error.message}`);
  }
}
```

---

### Phase 2: Worker Pool Improvements

#### Task 2.1: Add Worker Pool State Visibility

**File**: `apps/api/src/modules/workers/domain/WorkerPool.ts`

Add method to expose state for debugging:

```typescript
getStatus(): {
  activeJobs: number;
  maxConcurrent: number;
  isRunning: boolean;
  workerTypes: string[];
} {
  return {
    activeJobs: this.activeJobs.size,
    maxConcurrent: this.config.maxConcurrentJobs,
    isRunning: this.isRunning,
    workerTypes: Array.from(this.workers.keys()),
  };
}
```

Add health check endpoint:

```typescript
// apps/api/src/index.ts
app.get('/api/v1/jobs/pool/status', (req, res) => {
  if (!workerPool) {
    return res.status(503).json({ error: 'Worker pool not initialized' });
  }

  res.json({
    success: true,
    pool: workerPool.getStatus(),
  });
});
```

#### Task 2.2: Add Graceful Shutdown

```typescript
async stop(): Promise<void> {
  console.log('🛑 Stopping worker pool...');
  this.isRunning = false;

  if (this.pollTimer) {
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  // Wait for active jobs to complete (with timeout)
  const timeout = 30000; // 30 seconds
  const start = Date.now();

  while (this.activeJobs.size > 0 && Date.now() - start < timeout) {
    console.log(`  Waiting for ${this.activeJobs.size} active jobs to complete...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (this.activeJobs.size > 0) {
    console.warn(`  ⚠️  Force stopping with ${this.activeJobs.size} jobs still active`);
  }

  console.log('✅ Worker pool stopped');
}
```

---

### Phase 3: SSE Improvements

#### Task 3.1: Add SSE Connection Status to UI

**File**: `apps/web/src/hooks/useJobStream.ts`

```typescript
export interface UseJobStreamResult {
  jobs: Map<string, JobUpdate>;
  connected: boolean;
  error: string | null;
  reconnecting: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error'; // NEW
  lastEventTime: number | null; // NEW
}
```

#### Task 3.2: Add SSE Heartbeat

**File**: `apps/api/src/modules/jobs/infrastructure/SSEBroadcaster.ts`

```typescript
private startHeartbeat(): void {
  this.heartbeatInterval = setInterval(() => {
    this.sendHeartbeat();
  }, 30000); // Every 30 seconds
}

private sendHeartbeat(): void {
  for (const [accountId, connections] of this.connections.entries()) {
    for (const conn of connections) {
      try {
        this.sendMessage(conn.response, {
          type: 'heartbeat',
          data: { timestamp: Date.now() },
        });
      } catch (error) {
        console.warn(`Heartbeat failed for account ${accountId}:`, error);
      }
    }
  }
}
```

---

### Phase 4: Frontend Improvements

#### Task 4.1: Single Source of Truth

Remove `BackgroundOperationsContext` state duplication - use only SSE + initial fetch.

**File**: `apps/web/src/components/keimenon/ImportsTableCard.tsx`

```typescript
// REMOVE: Local state managed by context
// KEEP: Only SSE + initial fetch

const [jobs, setJobs] = useState<ImportJob[]>([]);
const { jobs: sseJobs, connected } = useJobStream();

// Initial fetch
useEffect(() => {
  fetchJobs();
}, []);

// SSE updates (real-time)
useEffect(() => {
  if (sseJobs.size > 0) {
    setJobs((prev) => {
      const updated = new Map(prev.map((j) => [j.id, j]));

      // Merge SSE updates
      for (const [jobId, sseJob] of sseJobs.entries()) {
        updated.set(jobId, convertSSEJobToImportJob(sseJob));
      }

      return Array.from(updated.values());
    });
  }
}, [sseJobs]);
```

#### Task 4.2: Connection Status Indicator

```typescript
{!connected && (
  <div className="bg-yellow-900/20 border border-yellow-600/30 p-2 mb-4">
    <div className="flex items-center gap-2 text-sm text-yellow-300">
      <AlertTriangle className="w-4 h-4" />
      <span>Live updates disconnected. Showing last known state.</span>
    </div>
  </div>
)}
```

---

### Phase 5: Testing & Validation

#### Task 5.1: Integration Test

**File**: `apps/api/src/__tests__/jobs-integration.test.ts`

```typescript
describe('Complete Job Flow', () => {
  test('Delete job: create → queue → run → complete', async () => {
    // 1. Create job
    const response = await request(app)
      .post('/api/v1/jobs/delete')
      .send({ scope: 'keimenon' })
      .expect(201);

    const { jobId } = response.body;

    // 2. Verify queued
    let job = await jobRepository.findById(jobId, accountId);
    expect(job.status).toBe('queued');

    // 3. Wait for worker to pick up
    await sleep(6000); // Poll interval + processing

    // 4. Verify running
    job = await jobRepository.findById(jobId, accountId);
    expect(job.status).toBeIn(['running', 'succeeded']);

    // 5. Wait for completion
    await waitFor(() => {
      job = jobRepository.findById(jobId, accountId);
      return job.status === 'succeeded';
    }, 30000);

    // 6. Verify results
    const events = await jobRepository.loadEvents(jobId, accountId);
    expect(events).toContainEqual(expect.objectContaining({ type: 'job.succeeded' }));
  });
});
```

---

## Deployment Checklist

### Pre-Deploy

- [ ] Run all migrations locally
- [ ] Verify tables exist: `jobs`, `job_events`, `job_items`, `job_idempotency`, `migrations`
- [ ] Test complete flow manually
- [ ] Run integration tests
- [ ] Check for console errors

### Deploy

- [ ] Stop running servers
- [ ] Pull latest code
- [ ] `npm install` (in case dependencies changed)
- [ ] Start with `npm run dev:clean`
- [ ] Watch logs for migration execution
- [ ] Verify SSE connections in browser DevTools
- [ ] Test job creation

### Post-Deploy Validation

- [ ] Create delete job → verify appears in table
- [ ] Check progress updates in real-time
- [ ] Verify job completes successfully
- [ ] Check database for proper records
- [ ] Verify no console errors
- [ ] Test concurrent deletes (should queue properly)

---

## Current Status

**Infrastructure**:

- ✅ Migration 008 run manually
- ✅ Concurrency logic fixed
- ❌ Automatic migration runner (not implemented)
- ❌ Error boundaries (not implemented)

**Worker Pool**:

- ✅ Basic polling implemented
- ✅ Concurrency guard working
- ❌ Graceful shutdown (not implemented)
- ❌ Status endpoint (not implemented)

**SSE**:

- ✅ Broadcaster running
- ✅ Coalescing working
- ❌ Heartbeat (not implemented)
- ❌ Connection status UI (not implemented)

**Frontend**:

- ❌ Still has state duplication (BackgroundOperationsContext)
- ❌ No connection status indicator
- ❌ No error recovery

**Testing**:

- ❌ No integration tests
- ❌ No E2E tests

---

## Next Immediate Steps

1. **Debug current broken state**:
   - Check API logs for errors
   - Verify SSE is connecting
   - Check if migration succeeded

2. **Implement MigrationRunner** (highest priority):
   - Prevents this entire class of issues
   - 2-3 hours of work
   - Huge payoff

3. **Add comprehensive logging**:
   - Every state transition
   - Every DB operation
   - Every SSE broadcast

4. **Test E2E flow**:
   - Create job → appears in table → runs → completes
   - Verify at each step

5. **Document everything**:
   - Architecture decisions
   - Data flow diagrams
   - Troubleshooting guide

This is the complete, exhaustive solution. No more band-aids.
