# E2E Test Suite - Phase 2 Design: Test Isolation System

**Date**: 2025-10-30
**Objective**: Achieve >90% E2E test pass rate through per-worker database isolation
**Estimated Implementation Time**: 6-10 hours
**Expected Impact**: Eliminate flaky tests caused by resource contention

---

## Executive Summary

Phase 2 will implement a **per-worker database isolation system** to eliminate resource contention between parallel E2E tests. This design leverages existing infrastructure ([test-isolation.middleware.ts](apps/api/src/middleware/test-isolation.middleware.ts) and [test-isolation.ts](tests/e2e/fixtures/test-isolation.ts)) to provide each Playwright worker with its own isolated SQLite database.

**Current State**: 59% pass rate (55/93 tests) with test failures and flaky behavior
**Target State**: >90% pass rate with consistent, reliable test results

---

## Problem Statement

### Root Cause of Test Failures

The current E2E test suite experiences failures due to **shared database state** across parallel test workers:

1. **Resource Contention**:
   - Both workers access the same `canvas-memory.db` file
   - Concurrent writes cause SQLite locking
   - Tests read stale data from other workers' operations

2. **Test Isolation Violations**:
   - Worker 1 creates test data → Worker 2 sees it
   - Worker 1 deletes data → Worker 2's test fails
   - Token expiration affects both workers simultaneously

3. **Non-Deterministic Behavior**:
   - Test pass/fail depends on execution order
   - Timing-dependent race conditions
   - Flaky tests that pass in isolation but fail in parallel

### Example Failure Scenario

```
Worker 0: Login as admin@admin.com → Token A generated
Worker 1: Login as admin@admin.com → Token B generated
Worker 0: API call with Token A → SUCCESS
Worker 1: API call with Token B → SUCCESS
Worker 0: Creates 10 test jobs
Worker 1: Expects 0 jobs (fresh state) → FAILS (sees Worker 0's jobs)
Worker 1: Deletes all jobs
Worker 0: Expects 10 jobs → FAILS (Worker 1 deleted them)
```

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Playwright Test Runner                      │
│  ┌────────────┐                        ┌────────────┐       │
│  │  Worker 0  │                        │  Worker 1  │       │
│  │            │                        │            │       │
│  │  Tests     │                        │  Tests     │       │
│  │  1,3,5...  │                        │  2,4,6...  │       │
│  └─────┬──────┘                        └─────┬──────┘       │
│        │ X-Test-DB-Path                      │              │
│        │ worker-0.db                         │ worker-1.db  │
│        │                                     │              │
└────────┼─────────────────────────────────────┼──────────────┘
         │                                     │
         ▼                                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Canvas Memory API Server                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │   Test Isolation Middleware                          │   │
│  │   - Reads X-Test-DB-Path header                      │   │
│  │   - Validates path security                          │   │
│  │   - Attaches dbPath to request                       │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │   Database Client                                    │   │
│  │   - Uses req.testDbPath if present                  │   │
│  │   - Falls back to default DB                        │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │   SQLite Databases                                   │   │
│  │   - .test-dbs/worker-0.db   (Worker 0's data)       │   │
│  │   - .test-dbs/worker-1.db   (Worker 1's data)       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Test Initialization**:
   - Playwright worker starts
   - Fixture creates `worker-{N}.db` from template
   - Test receives `dbPath` via fixture

2. **HTTP Request**:
   - Test sets `X-Test-DB-Path: /path/to/worker-N.db` header
   - All API requests include this header

3. **Middleware Processing**:
   - `testIsolationMiddleware` intercepts request
   - Validates DB path is within `.test-dbs/` directory
   - Attaches `req.testDbPath = normalizedPath`

4. **Database Connection**:
   - Database client checks `req.testDbPath`
   - If present, uses worker-specific DB
   - If absent, uses default DB

5. **Test Execution**:
   - Each worker operates on isolated database
   - No cross-worker data visibility
   - No resource contention

---

## Implementation Plan

### Phase 2.1: Database Client Integration (2 hours)

#### File: `apps/api/src/index.ts`

**Current State** ([lines 494-536](apps/api/src/index.ts#L494-L536)):

```typescript
const dbClient = await DatabaseFactory.getClient({
  mode: storageMode,
  local: {
    databasePath: sqlitePath, // Always uses same path
    verbose: process.env.NODE_ENV === 'development',
  },
  // ...
});

global.dbClient = dbClient; // Global singleton
```

**Problem**: Uses a single global `dbClient` for all requests, ignoring `req.testDbPath`.

**Solution**: Create request-scoped database clients in routes.

#### Option A: Per-Request Client (Recommended)

**Benefits**:

- No global state
- True per-request isolation
- Easy to reason about

**Implementation**:

1. **Create helper function** (`apps/api/src/utils/get-db-client.ts`):

```typescript
import { DatabaseFactory } from '@canvas-memory/db';
import { Request } from 'express';
import path from 'path';

export async function getDbClient(req?: Request) {
  const storageMode = process.env.STORAGE_MODE || 'local';

  // In test mode with test DB path, use worker-specific database
  if (req?.testDbPath && process.env.NODE_ENV === 'test') {
    console.log(`[Test Isolation] Using DB: ${path.basename(req.testDbPath)}`);

    return await DatabaseFactory.getClient({
      mode: 'local',
      local: {
        databasePath: req.testDbPath,
        verbose: false,
      },
    });
  }

  // Otherwise, use global client
  return global.dbClient;
}
```

2. **Update routes to use helper**:

```typescript
// Before:
app.use('/api/v1/nodes', (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  return nodesRoutes(req, res, next);
});

// After:
app.use('/api/v1/nodes', async (req, res, next) => {
  if (!authService) return res.status(503).json({ error: 'Auth service not initialized' });
  const dbClient = await getDbClient(req);
  req.dbClient = dbClient; // Attach to request
  return nodesRoutes(req, res, next);
});
```

**Trade-off**: Requires middleware to attach `dbClient` to all routes.

#### Option B: Connection Pool with Path Key (Alternative)

**Benefits**:

- Reuses connections per worker
- Better performance for long-running test suites

**Implementation**:

```typescript
// apps/api/src/utils/db-pool.ts
class DatabasePool {
  private pool: Map<string, any> = new Map();

  async getClient(dbPath?: string) {
    if (!dbPath) return global.dbClient;

    if (!this.pool.has(dbPath)) {
      const client = await DatabaseFactory.getClient({
        mode: 'local',
        local: { databasePath: dbPath, verbose: false },
      });
      this.pool.set(dbPath, client);
    }

    return this.pool.get(dbPath);
  }

  async closeAll() {
    for (const client of this.pool.values()) {
      await client.close();
    }
    this.pool.clear();
  }
}

export const dbPool = new DatabasePool();
```

**Trade-off**: More complex, needs cleanup logic.

**Recommendation**: Start with **Option A** for simplicity. Optimize to Option B if performance becomes an issue.

---

### Phase 2.2: Test Fixture Migration (1 hour)

#### Update All Test Files

**Current State**:

```typescript
// tests/e2e/console-error-filtering.spec.ts
import { test, expect } from './fixtures/testId';
```

**Target State**:

```typescript
// tests/e2e/console-error-filtering.spec.ts
import { test, expect } from './fixtures/test-isolation';
```

**Files to Update** (8 total):

1. `tests/e2e/canvas-operations.spec.ts`
2. `tests/e2e/console-error-filtering.spec.ts`
3. `tests/e2e/data-management-ui-updates.spec.ts`
4. `tests/e2e/debug-auth.spec.ts`
5. `tests/e2e/debug-client-env.spec.ts`
6. `tests/e2e/flow-auth-canvas.spec.ts`
7. `tests/e2e/settings-navigation.spec.ts`
8. `tests/e2e/smoke.spec.ts`

**Process**:

1. Find/replace `'./fixtures/testId'` → `'./fixtures/test-isolation'`
2. Run tests to verify no regressions
3. Commit changes incrementally (per file or per 2-3 files)

---

### Phase 2.3: HTTP Header Configuration (1 hour)

#### Automatic Header Injection

**File**: `tests/e2e/fixtures/test-isolation.ts`

**Current State** ([lines 31-64](tests/e2e/fixtures/test-isolation.ts#L31-L64)):

```typescript
export const test = base.extend<TestIsolationFixtures>({
  dbPath: async ({ workerInfo }, use) => {
    // Creates worker-specific DB file
    const dbPath = path.join(dbDir, `worker-${workerInfo.workerIndex}.db`);
    await use(dbPath);
  },
});
```

**Enhanced State**:

```typescript
import { test as base } from '@playwright/test';
import path from 'path';
import fs from 'fs';

interface TestIsolationFixtures {
  workerStorageState: string;
  dbPath: string;
}

export const test = base.extend<TestIsolationFixtures>({
  // Provide database path for this worker
  dbPath: async ({ workerInfo }, use) => {
    const dbDir = path.join(process.cwd(), '.test-dbs');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, `worker-${workerInfo.workerIndex}.db`);

    console.log(`[Worker ${workerInfo.workerIndex}] Using isolated DB: ${dbPath}`);

    // Initialize DB from template
    const templateDb = path.join(process.cwd(), 'packages/db/data/canvas-memory.db');
    if (fs.existsSync(templateDb) && !fs.existsSync(dbPath)) {
      console.log(`[Worker ${workerInfo.workerIndex}] Copying template DB...`);
      fs.copyFileSync(templateDb, dbPath);
    } else if (!fs.existsSync(dbPath)) {
      console.log(`[Worker ${workerInfo.workerIndex}] Creating new DB...`);
      // DB will be created by API on first request
    }

    await use(dbPath);

    // Optional cleanup (commented out for debugging)
    // if (fs.existsSync(dbPath)) {
    //   fs.unlinkSync(dbPath);
    // }
  },

  // ✨ NEW: Automatically inject X-Test-DB-Path header
  page: async ({ page, dbPath }, use) => {
    // Set DB path header for all requests from this page
    await page.setExtraHTTPHeaders({
      'X-Test-DB-Path': dbPath,
    });

    console.log(`[Test Isolation] Configured page with DB: ${path.basename(dbPath)}`);

    await use(page);
  },

  // Worker-specific storage state
  workerStorageState: async ({ workerInfo }, use) => {
    const storageDir = path.join(process.cwd(), '.test-storage');

    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const storagePath = path.join(storageDir, `worker-${workerInfo.workerIndex}.json`);

    await use(storagePath);
  },
});

export { expect } from '@playwright/test';
```

**Key Addition**: The `page` fixture extension automatically sets the header for **all** HTTP requests made by that page, eliminating the need for manual header configuration in each test.

---

### Phase 2.4: Database Initialization Strategy (3 hours)

#### Problem: User Credential Conflicts

**Issue**: Template database contains `admin@admin.com` user. When both workers use the same credentials:

- Token collisions
- Session conflicts
- Auth failures

#### Solution: Worker-Specific Test Users

**Approach**:

1. **Template Database**: Contains base schema + default admin account
2. **Worker Initialization**: Each worker creates its own test user with unique email

**Implementation**:

##### File: `tests/e2e/fixtures/test-isolation.ts`

```typescript
import Database from 'better-sqlite3';

async function initializeWorkerDb(workerIndex: number, dbPath: string): Promise<void> {
  const templateDb = path.join(process.cwd(), 'packages/db/data/canvas-memory.db');

  // Copy template if DB doesn't exist
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(templateDb)) {
      console.log(`[Worker ${workerIndex}] Copying template DB...`);
      fs.copyFileSync(templateDb, dbPath);
    } else {
      throw new Error(`Template database not found: ${templateDb}`);
    }
  }

  // Open database and update test users with worker prefix
  const db = new Database(dbPath);

  try {
    // Update existing admin user to be worker-specific
    db.prepare(
      `
      UPDATE users
      SET email = REPLACE(email, 'admin@admin.com', 'worker${workerIndex}_admin@admin.com')
      WHERE email = 'admin@admin.com'
    `
    ).run();

    console.log(
      `[Worker ${workerIndex}] Created worker-specific admin: worker${workerIndex}_admin@admin.com`
    );

    // Verify user was updated
    const user = db
      .prepare('SELECT email FROM users WHERE email LIKE ?')
      .get(`worker${workerIndex}_admin@admin.com`);
    if (!user) {
      throw new Error(`Failed to create worker-specific user for worker ${workerIndex}`);
    }
  } finally {
    db.close();
  }
}
```

##### Updated Fixture:

```typescript
export const test = base.extend<TestIsolationFixtures>({
  dbPath: async ({ workerInfo }, use) => {
    const dbDir = path.join(process.cwd(), '.test-dbs');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, `worker-${workerInfo.workerIndex}.db`);

    // Initialize worker-specific database
    await initializeWorkerDb(workerInfo.workerIndex, dbPath);

    await use(dbPath);

    // Cleanup (optional)
    // if (fs.existsSync(dbPath)) {
    //   fs.unlinkSync(dbPath);
    // }
  },
});
```

##### Test Updates:

**Before**:

```typescript
const TEST_EMAIL = 'admin@admin.com';
const TEST_PASSWORD = 'admin123';
```

**After**:

```typescript
test.beforeEach(async ({ page, workerInfo }) => {
  const TEST_EMAIL = `worker${workerInfo.workerIndex}_admin@admin.com`;
  const TEST_PASSWORD = 'admin123'; // Same password, different email

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  // ...
});
```

**Alternative**: Use environment variable pattern

```typescript
// Global test setup file
process.env.TEST_USER_EMAIL = `worker${workerInfo.workerIndex}_admin@admin.com`;
process.env.TEST_USER_PASSWORD = 'admin123';

// Tests use env vars as normal
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
```

---

### Phase 2.5: Middleware Activation Verification (30 min)

#### Verify Test Isolation Middleware is Active

**File**: `apps/api/src/app.ts`

**Current State** ([lines 77-81](apps/api/src/app.ts#L77-L81)):

```typescript
// Test isolation (only active in test environment)
if (process.env.NODE_ENV === 'test') {
  app.use(testIsolationMiddleware);
  console.log('🧪 Test isolation middleware enabled - using per-worker databases');
}
```

**Status**: ✅ Already configured correctly

**Verification Steps**:

1. Start API with `NODE_ENV=test npm run dev:api`
2. Check console output for: `🧪 Test isolation middleware enabled`
3. Send test request with `X-Test-DB-Path` header
4. Verify middleware log: `[Test Isolation] Using worker DB: worker-0.db`

---

### Phase 2.6: Integration Testing & Validation (2 hours)

#### Test Plan

**Step 1: Unit Test Worker DB Creation**

```bash
# Test that worker DBs are created correctly
npx playwright test tests/e2e/smoke.spec.ts --project=chromium --workers=2

# Verify files exist
ls .test-dbs/
# Expected: worker-0.db, worker-1.db
```

**Step 2: Verify Header Injection**

```typescript
// Add debug test to verify headers
test('debug: verify X-Test-DB-Path header is sent', async ({ page, dbPath, request }) => {
  const response = await request.get('http://localhost:4001/api/v1/health');
  // Middleware should log the header
  console.log('DB Path used:', dbPath);
});
```

**Step 3: Test Data Isolation**

```typescript
test('worker isolation: data should not leak between workers', async ({ page, workerInfo }) => {
  // Worker 0 creates a job
  // Worker 1 should see 0 jobs (not Worker 0's job)

  const jobs = await page.evaluate(() => {
    return fetch('http://localhost:4001/api/v1/jobs').then((r) => r.json());
  });

  // Each worker should only see its own jobs
  expect(jobs.filter((j) => j.createdBy === `worker${workerInfo.workerIndex}`)).toBeTruthy();
});
```

**Step 4: Run Full Suite**

```bash
# Run full suite with test isolation
npx playwright test --reporter=html,list

# Expected results:
# - Pass rate > 90%
# - No database locking errors
# - Consistent results across runs
```

---

## Implementation Checklist

### Database Client Integration

- [ ] Create `apps/api/src/utils/get-db-client.ts` helper function
- [ ] Add middleware to attach `dbClient` to requests
- [ ] Update routes to use per-request client
- [ ] Test basic API request with worker DB

### Test Fixture Migration

- [ ] Update `tests/e2e/fixtures/test-isolation.ts` with page header injection
- [ ] Add `initializeWorkerDb()` function for worker-specific users
- [ ] Migrate test files (1-3 files initially, then all 8)
- [ ] Run migrated tests to verify no regressions

### Database Initialization

- [ ] Implement worker-specific user creation
- [ ] Update test beforeEach hooks to use worker email
- [ ] Verify template DB copying works correctly
- [ ] Test user authentication with worker-specific credentials

### Validation & Testing

- [ ] Unit test: Worker DB creation
- [ ] Integration test: Header injection
- [ ] Integration test: Data isolation
- [ ] Full suite run with >90% pass rate
- [ ] Document any remaining failures

### Cleanup & Documentation

- [ ] Add cleanup script for `.test-dbs/` directory
- [ ] Update `README.md` with test isolation instructions
- [ ] Document troubleshooting steps
- [ ] Create migration guide for future test additions

---

## Expected Outcomes

### Pass Rate Improvements

| Test Category              | Before Phase 2  | After Phase 2     | Change   |
| -------------------------- | --------------- | ----------------- | -------- |
| console-error-filtering    | 67% (12/18)     | **95%+ (17+/18)** | +28%     |
| data-management-ui-updates | 11% (3/27)      | **85%+ (23+/27)** | +74%     |
| debug-auth                 | 0% (0/3)        | **100% (3/3)**    | +100%    |
| Other suites               | ~80%            | **95%+**          | +15%     |
| **Overall**                | **59% (55/93)** | **>90% (84+/93)** | **+31%** |

### Eliminated Issues

✅ **Database Locking**: Each worker has its own DB file
✅ **Token Conflicts**: Worker-specific users prevent session collisions
✅ **Data Leakage**: Complete isolation between workers
✅ **Flaky Tests**: Deterministic test behavior
✅ **Race Conditions**: No cross-worker dependencies

---

## Risks & Mitigations

### Risk 1: Template DB Missing

**Problem**: `packages/db/data/canvas-memory.db` doesn't exist
**Mitigation**:

- Check for template in global setup
- Fail fast with clear error message
- Document how to create template DB

### Risk 2: Performance Degradation

**Problem**: Creating DB per worker adds overhead
**Mitigation**:

- Template copy is fast (~100ms)
- DB initialization cached per worker
- Total overhead: <5 seconds for full suite

### Risk 3: Disk Space Usage

**Problem**: Multiple DB files consume disk space
**Mitigation**:

- Automatic cleanup after tests (optional)
- `.gitignore` for `.test-dbs/` directory
- CI cleanup step in GitHub Actions

### Risk 4: Incomplete Migration

**Problem**: Forgetting to update a test file
**Mitigation**:

- Automated migration script
- Grep for remaining `testId` imports
- CI check for fixture consistency

---

## Rollback Plan

If Phase 2 causes regressions:

1. **Immediate Rollback**:

   ```bash
   git revert <phase-2-commit>
   ```

2. **Partial Rollback** (keep fixes, remove isolation):
   - Revert fixture migrations
   - Keep `getDbClient` helper (doesn't break anything)
   - Disable middleware temporarily

3. **Debug Approach**:
   - Run tests with `--workers=1` (no parallelism)
   - Check middleware logs for DB path issues
   - Verify template DB schema matches API expectations

---

## Success Criteria

### Must-Have

- ✅ Pass rate ≥ 90% (84+ of 93 tests)
- ✅ No database locking errors
- ✅ Tests pass consistently across 3+ runs
- ✅ All worker DBs created successfully
- ✅ Worker-specific users authenticate correctly

### Nice-to-Have

- ✅ Pass rate ≥ 95% (88+ of 93 tests)
- ✅ WebKit timeouts resolved
- ✅ Zero flaky tests
- ✅ Test execution time < 5 minutes

### Acceptance Test

```bash
# Run full suite 3 times
for i in {1..3}; do
  echo "Run $i:"
  npx playwright test --reporter=list | grep "passed"
done

# All 3 runs should show >90% pass rate with same results
```

---

## Timeline

### Immediate (Day 1)

- [ ] Implement `getDbClient()` helper
- [ ] Enhance `test-isolation.ts` fixture
- [ ] Migrate 2-3 test files
- [ ] Run partial test suite

### Short-term (Day 2-3)

- [ ] Migrate remaining test files
- [ ] Implement worker-specific users
- [ ] Run full test suite
- [ ] Fix any regressions

### Medium-term (Week 1)

- [ ] Optimize DB initialization
- [ ] Add cleanup automation
- [ ] Document best practices
- [ ] Update CI/CD pipelines

---

## Related Files

### To Modify

- ✏️ `apps/api/src/utils/get-db-client.ts` (new file)
- ✏️ `apps/api/src/index.ts` (add middleware for dbClient)
- ✏️ `tests/e2e/fixtures/test-isolation.ts` (enhance with headers + user init)
- ✏️ All 8 test spec files (change import statement)

### Reference Documentation

- 📖 [test-isolation.middleware.ts](apps/api/src/middleware/test-isolation.middleware.ts)
- 📖 [test-isolation.ts](tests/e2e/fixtures/test-isolation.ts)
- 📖 [E2E_PHASE1_RESULTS.md](E2E_PHASE1_RESULTS.md)
- 📖 [playwright.config.ts](playwright.config.ts)

---

## Phase 3 Preview: WebKit Optimization

After Phase 2 achieves >90% pass rate, Phase 3 will focus on:

1. **WebKit Timeout Investigation** (9 failing tests)
   - Increase WebKit-specific timeouts
   - Profile SSE connection behavior
   - Add WebKit-specific assertions

2. **Final Polish** (5% → 100%)
   - Fix remaining edge cases
   - Optimize test execution time
   - Documentation and best practices

**Expected Timeline**: 2-3 hours
**Target**: 95-100% pass rate across all browsers

---

**End of Phase 2 Design**
