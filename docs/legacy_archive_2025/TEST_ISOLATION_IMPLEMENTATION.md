# Test Isolation Implementation Guide

**Status**: Foundation Complete ✅ | Full Implementation Pending ⏳
**Goal**: Achieve >90% E2E test pass rate through per-worker database isolation

---

## What's Been Done ✅

### 1. Test Fixtures Created

**File**: `tests/e2e/fixtures/test-isolation.ts`

- Provides `dbPath` fixture with unique DB per worker
- Provides `workerStorageState` for isolated auth state
- Auto-creates `.test-dbs/` directory
- Copies template DB for each worker

### 2. API Middleware Created

**File**: `apps/api/src/middleware/test-isolation.middleware.ts`

- Accepts `X-Test-DB-Path` header from E2E tests
- Validates path security (prevents path traversal)
- Attaches `testDbPath` to Express Request object
- Only active when `NODE_ENV=test`

### 3. Middleware Integrated

**File**: `apps/api/src/app.ts`

- Middleware enabled in test environment
- Logs when test isolation is active
- Ready to receive worker-specific DB paths

---

## What's Still Needed ⏳

### Step 1: Update Database Client to Use Request Context

The SQLite client needs to check for `req.testDbPath` and use it instead of the default DB path.

**File to modify**: `packages/db/src/sqlite/client.ts`

**Current approach** (simplified):

```typescript
// Current: Uses single global DB
const dbPath = process.env.DB_PATH || 'packages/db/data/keimenon.db';
export const dbClient = new Database(dbPath);
```

**Needed approach**:

```typescript
// New: Per-request DB path
import { getDbPath } from '../../../apps/api/src/middleware/test-isolation.middleware';

export function getDbClient(req?: Request): Database {
  const dbPath = getDbPath(req);

  // Cache clients per path to avoid re-creating
  if (!dbClients.has(dbPath)) {
    dbClients.set(dbPath, new Database(dbPath));
  }

  return dbClients.get(dbPath)!;
}

// Global clients cache
const dbClients = new Map<string, Database>();
```

### Step 2: Pass Request Context Through Service Layers

All routes and services need to pass the `req` object down so the DB client can access `req.testDbPath`.

**Example Route Update**:

```typescript
// Before
app.get('/api/v1/nodes', requireAuth, async (req, res) => {
  const nodes = await nodesService.getAll(); // ❌ No request context
  res.json(nodes);
});

// After
app.get('/api/v1/nodes', requireAuth, async (req, res) => {
  const nodes = await nodesService.getAll(req); // ✅ Pass request
  res.json(nodes);
});
```

**Example Service Update**:

```typescript
// Before
export class NodesService {
  async getAll() {
    return dbClient.query('SELECT * FROM nodes'); // ❌ Global client
  }
}

// After
export class NodesService {
  async getAll(req?: Request) {
    const client = getDbClient(req); // ✅ Per-request client
    return client.query('SELECT * FROM nodes');
  }
}
```

### Step 3: Update E2E Tests to Use Isolation Fixtures

**Example test file**:

```typescript
// Before
import { test, expect } from './fixtures/testId';

test('my test', async ({ page }) => {
  await page.goto('/login');
  // ...
});

// After
import { test, expect } from './fixtures/test-isolation';

test('my test', async ({ page, dbPath, workerInfo }) => {
  // Set DB path header for all requests from this worker
  await page.setExtraHTTPHeaders({
    'X-Test-DB-Path': dbPath,
  });

  console.log(`[Worker ${workerInfo.workerIndex}] Using DB: ${dbPath}`);

  await page.goto('/login');
  // ... test continues normally
});
```

### Step 4: Update Global Setup

Ensure each worker gets a clean DB before tests start.

**File**: `tests/e2e/global-setup.ts`

```typescript
export default async function globalSetup() {
  // Clean .test-dbs directory
  const testDbsDir = path.join(process.cwd(), '.test-dbs');
  if (fs.existsSync(testDbsDir)) {
    fs.rmSync(testDbsDir, { recursive: true });
  }
  fs.mkdirSync(testDbsDir, { recursive: true });

  // Copy template DB for each worker (based on worker count)
  const workerCount = process.env.CI ? 1 : 2;
  const templateDb = path.join(process.cwd(), 'packages/db/data/keimenon.db');

  for (let i = 0; i < workerCount; i++) {
    const workerDb = path.join(testDbsDir, `worker-${i}.db`);
    fs.copyFileSync(templateDb, workerDb);
    console.log(`✅ Created isolated DB for worker ${i}`);
  }
}
```

---

## Benefits of Full Implementation

### Before (Current State - 71% pass rate)

- **Shared SQLite DB** causes lock contention
- **Token conflicts** between parallel workers
- **Race conditions** in settings loading
- **Test interdependencies** cause cascading failures

### After (Expected - >90% pass rate)

- **Each worker** has its own isolated database
- **No resource contention** - workers don't block each other
- **Parallel execution** fully stable
- **True test independence** - one test can't affect another

---

## Estimated Effort

| Task                            | Complexity | Time           | Priority |
| ------------------------------- | ---------- | -------------- | -------- |
| Update DB client                | Medium     | 1-2 hours      | High     |
| Pass req context through routes | High       | 3-4 hours      | High     |
| Update E2E test files           | Low        | 30-60 min      | Medium   |
| Update global setup             | Low        | 30 min         | Medium   |
| Test & validate                 | Medium     | 1-2 hours      | High     |
| **Total**                       |            | **6-10 hours** |          |

---

## Alternative: Simpler Approach

If the full request context passing is too invasive, consider a simpler approach:

### Use Environment Variables Per Worker

**Pros**:

- No need to pass `req` through all layers
- DB client can read env var directly
- Less code changes required

**Cons**:

- Must start separate API instances per worker
- More complex CI/CD setup
- Higher resource usage

**Implementation**:

```typescript
// In global setup, start API instances per worker
for (let i = 0; i < workerCount; i++) {
  const port = 4001 + i;
  const dbPath = path.join(testDbsDir, `worker-${i}.db`);

  spawn('npm', ['run', 'start'], {
    env: {
      ...process.env,
      PORT: port.toString(),
      DB_PATH: dbPath,
      WORKER_INDEX: i.toString(),
    },
  });
}

// Tests use worker-specific port
test('my test', async ({ page, workerInfo }) => {
  const port = 4001 + workerInfo.workerIndex;
  await page.goto(`http://localhost:${port}/login`);
});
```

---

## Testing the Implementation

### Step 1: Test Middleware Alone

```bash
# Start API in test mode
NODE_ENV=test npm run dev:api

# Send request with test DB header
curl -H "X-Test-DB-Path: /path/to/project/.test-dbs/worker-0.db" \
  http://localhost:4001/health

# Should see: "Using worker DB: worker-0.db" in logs
```

### Step 2: Test with Single E2E Test

```bash
# Run single test with isolation
npx playwright test tests/e2e/keimenon-operations.spec.ts \
  -g "should load keimenon page successfully" \
  --project=chromium
```

### Step 3: Test with Parallel Execution

```bash
# Run full suite with 2 workers
npx playwright test tests/e2e/ --project=chromium --workers=2

# Check logs for:
# ✅ "Worker 0 Using isolated DB: worker-0.db"
# ✅ "Worker 1 Using isolated DB: worker-1.db"
# ✅ No "database is locked" errors
```

---

## Success Criteria

✅ Each worker logs its DB path on startup
✅ No "database is locked" errors during parallel execution
✅ Tests can run with `--workers=4` without failures
✅ Chromium/Firefox pass rate >90% (up from 71%)
✅ WebKit pass rate >90% (up from 45%)
✅ Settings navigation tests consistently pass
✅ Debug-auth tests consistently pass

---

## Current Status Summary

**Foundation Complete** ✅

- Fixtures ready
- Middleware ready
- Integration ready

**Next Step**: Update database client to use request context

**Blocker**: Requires architectural changes to pass `req` through service layers OR use alternative approach with separate API instances per worker.

**Recommendation**: Implement alternative approach (separate API instances) as it's simpler and doesn't require changing service layer signatures.

---

**Last Updated**: 2025-10-29
**Author**: E2E Test Improvement Session
**Related**: E2E_SESSION_COMPLETE_OPTIONS_ABC.md
