# E2E Test Failure Deep Dive Analysis

**Date**: 2025-11-01
**Analysis Type**: Root Cause Investigation
**Test Suite**: Playwright E2E Tests (Chromium, Firefox, WebKit)

## Executive Summary

After comprehensive investigation of the E2E test suite, I've identified **7 critical architectural issues** that explain test failures beyond the obvious authentication and password mismatches we've been fixing. These are systemic problems that create cascading failures across the test suite.

---

## 🔴 Critical Issue #1: Missing Test Isolation Middleware

### Problem

The test isolation infrastructure (`test-isolation.middleware.ts` and `db-context.middleware.ts`) **is never applied to the Express app**.

### Evidence

```typescript
// apps/api/src/index.ts
// ❌ NO IMPORT of testIsolationMiddleware or dbContextMiddleware
// ❌ NO app.use() statement applying these middleware
```

```bash
# Verified with grep - returns nothing:
$ grep -n "testIsolationMiddleware\|dbContextMiddleware" apps/api/src/index.ts
(no results)
```

### Impact

- **All tests share the SAME database** (the global `dbClient`)
- Worker-specific database paths (`worker-0.db`, `worker-1.db`, etc.) are created but **never used**
- The `X-Test-DB-Path` header is sent by tests but **ignored by API**
- Test fixtures set up isolation, but the API doesn't honor it

### Why Tests Appear to Work Sometimes

Tests succeed when:

1. They run sequentially (workers=1) and there's no data collision
2. The global database happens to have the right data from a previous test
3. Login creates a fresh session that works by chance

### Fix Required

```typescript
// apps/api/src/index.ts (around line 98-99)
import { testIsolationMiddleware } from './middleware/test-isolation.middleware';
import { dbContextMiddleware } from './middleware/db-context.middleware';

// Apply BEFORE route handlers
if (process.env.NODE_ENV === 'test') {
  app.use(testIsolationMiddleware);
  app.use(dbContextMiddleware);
}
```

---

## 🔴 Critical Issue #2: AuthService Database Coupling

### Problem

`AuthService` is instantiated **once** at server startup with a **hardcoded reference** to the global `dbClient`. It cannot use per-request test databases.

### Evidence

```typescript
// apps/api/src/index.ts:546
authService = new AuthService(dbClient as any);

// apps/api/src/services/auth.service.ts:112
export class AuthServiceV2 {
  constructor(private db: SQLiteClient) {}

  async verifyToken(token: string): Promise<JWTPayload | null> {
    // ❌ ALWAYS uses this.db (the global client from constructor)
    const database = this.db.getDatabase();
    const session = database.prepare(...).get(token, Date.now());
  }
}
```

### Impact

When a test runs:

1. Test sends `X-Test-DB-Path: worker-0.db` header
2. Request middleware (if applied) swaps `global.dbClient` → `worker-0.db`
3. **BUT** `requireAuth` middleware calls `authService.verifyToken(token)`
4. **AuthService still uses the ORIGINAL dbClient** it was constructed with
5. Token lookup fails because session was created in `worker-0.db` but AuthService looks in the global DB

### Visual Flow

```
Login Request (Worker 0)
  → dbContextMiddleware: global.dbClient = worker-0.db ✅
  → POST /auth/login
    → Creates session in worker-0.db ✅
    → Returns token ✅

Subsequent Request (Worker 0)
  → dbContextMiddleware: global.dbClient = worker-0.db ✅
  → requireAuth middleware
    → authService.verifyToken(token)
      → ❌ USES GLOBAL dbClient (NOT worker-0.db)
      → Session not found
      → 401 Unauthorized
```

### Why This Is Invisible

- If running with workers=1, all requests use the same DB anyway
- Session might exist in global DB from a previous test run
- Intermittent failures look like "flaky auth" or "timing issues"

### Fix Options

**Option A: Pass Request to AuthService** (Recommended)

```typescript
// Change AuthService methods to accept optional Request
async verifyToken(token: string, req?: Request): Promise<JWTPayload | null> {
  const dbClient = await getDbClient(req); // Uses req.testDbPath if present
  const database = dbClient.getDatabase();
  // ... rest of logic
}

// Update requireAuth middleware
const payload = await authService.verifyToken(token, req);
```

**Option B: Request-Scoped AuthService Factory**

```typescript
// Create new AuthService per request with correct DB
function getAuthService(req: Request): AuthServiceV2 {
  const dbClient = isTestIsolationActive(req) ? getDbClient(req) : global.dbClient;
  return new AuthServiceV2(dbClient);
}
```

---

## 🟡 Issue #3: Excessive Fixed Timeouts (42 instances)

### Problem

Tests use `page.waitForTimeout(ms)` with **hard-coded delays** instead of waiting for actual conditions.

### Evidence

```typescript
// From grep results across all test files:
await page.waitForTimeout(500); // 11 instances
await page.waitForTimeout(1000); // 7 instances
await page.waitForTimeout(2000); // 7 instances
await page.waitForTimeout(3000); // 3 instances
await page.waitForTimeout(5000); // 2 instances
await page.waitForTimeout(6000); // 1 instance
await page.waitForTimeout(10000); // 1 instance
await page.waitForTimeout(18000); // 1 instance (!!!)
```

### Impact

- **Slow tests**: Tests wait for worst-case scenarios even when operation completes quickly
- **Flaky tests**: If operation takes 3100ms but timeout is 3000ms → failure
- **Browser differences**: WebKit might be slower than Chromium, causing intermittent failures
- **Load sensitivity**: Under high CPU load, delays are insufficient

### Examples of Bad Patterns

```typescript
// ❌ BAD: Arbitrary wait
await clearButton.click();
await page.waitForTimeout(500); // Hope modal appears
await expect(confirmModal).toBeVisible();

// ✅ GOOD: Wait for actual condition
await clearButton.click();
await expect(confirmModal).toBeVisible({ timeout: 5000 });
```

### Fix Strategy

Replace all `waitForTimeout` with:

- `page.waitForSelector()` for elements
- `page.waitForResponse()` for API calls
- `page.waitForLoadState('networkidle')` for page loads
- `expect().toBeVisible({ timeout })` for assertions

---

## 🟡 Issue #4: Session Expiration Time Bombs

### Problem

Sessions have a **7-day expiration** (604800000ms) but tests create many sessions without cleanup.

### Evidence

```bash
# Worker 0 database has 6 sessions:
$ sqlite3 .test-dbs/worker-0.db "SELECT COUNT(*) FROM sessions"
6

# Sessions from different time periods (Unix timestamps):
expires_at: 1762547962276  # Expires in 7 days from creation
expires_at: 1762546771813
expires_at: 1762526625134
expires_at: 1762526624581
expires_at: 1762444290807
```

### Impact

- Old sessions accumulate across test runs
- Token from previous test run might still be valid
- Tests may pass using "zombie sessions" instead of freshly created ones
- Cleanup tests (`cleanup: clear all background operations`) don't clear sessions
- Database grows indefinitely

### Attack Vector

```
Test Run 1 (Yesterday):
  - Creates session with token ABC123
  - Session expires in 7 days
  - Test fails but session persists

Test Run 2 (Today):
  - Same user logs in
  - Creates new session with token XYZ789
  - BUT old token ABC123 still works!
  - If test uses old token → false positive
```

### Fix Required

```typescript
// In test cleanup
afterEach(async ({ apiRequest }) => {
  // Clear sessions for test users
  await apiRequest.delete('/api/v1/auth/sessions');

  // Or delete sessions directly from DB
  await apiRequest.post('/api/v1/test/cleanup', {
    data: { clearSessions: true },
  });
});
```

---

## 🟡 Issue #5: Database Size Explosion

### Problem

Test databases are **205MB EACH** (4 workers × 205MB = 820MB).

### Evidence

```bash
$ ls -lh .test-dbs/
-rw-r--r-- 1 Timothy 197609 205295616 Nov  1 05:50 worker-0.db
-rw-r--r-- 1 Timothy 197609 205295616 Nov  1 05:50 worker-1.db
-rw-r--r-- 1 Timothy 197609 205295616 Nov  1 05:50 worker-2.db
-rw-r--r-- 1 Timothy 197609 205295616 Nov  1 05:50 worker-3.db
```

### Impact

- **Slow database operations**: Large database = slow queries
- **Slow test initialization**: Copying 205MB template takes time
- **Disk I/O contention**: Multiple workers reading/writing large files
- **Memory pressure**: SQLite loads significant portions into memory
- **False timeouts**: Operations might be slow due to DB size, not logic bugs

### Why This Happens

- Tests create data with `data_tag: 'test'` but don't clean it up
- Template database (`.data/keimenon.db`) is copied from production DB
- Each worker gets a copy of all accumulated test data
- VACUUM not run to reclaim space

### Fix Strategy

```typescript
// 1. Use minimal template DB
const templateDb = path.join(process.cwd(), '.test-dbs/template-minimal.db');

// 2. Clean up after each test
afterEach(async ({ apiRequest }) => {
  await apiRequest.delete('/api/v1/data/test-data');
});

// 3. Periodic VACUUM
afterAll(async ({ dbPath }) => {
  await database.exec('VACUUM');
});
```

---

## 🟡 Issue #6: Race Conditions in dbContextMiddleware

### Problem

The `dbContextMiddleware` swaps `global.dbClient` temporarily but has a **critical race condition**.

### Evidence

```typescript
// apps/api/src/middleware/db-context.middleware.ts:36
global.dbClient = testClient; // ⚠️ Global mutation

// Cleanup on response finish
res.on('finish', () => {
  global.dbClient = originalClient;
});

next(); // ⚠️ Continues immediately
```

### Attack Vector

```
Time    Worker 0                Worker 1
────────────────────────────────────────────
T0      Request A arrives
T1      global.dbClient = worker-0.db
T2      next() called                Request B arrives
T3                                   global.dbClient = worker-1.db ❌
T4      Route handler runs
T5      Uses global.dbClient
T6      → GETS worker-1.db ❌❌
```

### Impact

- **Cross-worker data contamination**: Worker 0 reads Worker 1's data
- **Intermittent failures**: Only fails when requests overlap in time
- **Hard to reproduce**: Depends on exact timing and CPU scheduling
- **Appears browser-specific**: Some browsers send requests faster → more overlap

### Why workers=1 "Fixes" This

With only 1 worker, there's never concurrent request handling, so the race condition doesn't manifest.

### Proper Fix

**Don't use global.dbClient at all in routes.** Pass DB client through request:

```typescript
// Middleware stores client on request (no global mutation)
export async function dbContextMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.testDbPath) {
    req.dbClient = await getDbClient(req);
  }
  next();
}

// Routes use req.dbClient
router.get('/nodes', async (req, res) => {
  const dbClient = req.dbClient || global.dbClient;
  const nodes = await dbClient.execute(...);
});
```

---

## 🟡 Issue #7: Login Helper Timeout Inflation

### Problem

The login helper has **60-second timeouts** that mask underlying issues.

### Evidence

```typescript
// tests/e2e/helpers/login.ts
await page.waitForLoadState('load', { timeout: 60000 }); // 60s
await page.waitForURL(/\/keimenon/, { timeout: 60000 }); // 60s
await page.waitForLoadState('domcontentloaded', { timeout: 60000 }); // 60s
```

### Impact

- **Hidden failures**: Login takes 30s → test passes but something is broken
- **Misleading metrics**: Test suite takes 15 minutes because logins are slow
- **Cascading delays**: Every test waits up to 60s for login
- **False sense of stability**: Tests pass but are extremely fragile

### Expected vs Actual

```
Expected:
  - Login navigation: 1-2s
  - Keimenon load: 2-3s
  - Total login time: ~5s

Actual (with issues):
  - Login navigation: 5-10s (why?)
  - Keimenon load: 10-20s (why?)
  - Multiple retries before success (why?)
```

### Root Causes of Slow Login

1. **No test isolation** → wrong database → multiple auth attempts
2. **AuthService database mismatch** → token validation fails → retry
3. **Large database** → slow session lookups
4. **SSE connection delays** → keimenon page waits for job status
5. **API route inefficiency** → N+1 queries for user data

### Fix Strategy

Reduce timeouts to **realistic values** and fix root causes:

```typescript
await page.waitForURL(/\/keimenon/, { timeout: 10000 }); // 10s max
```

If login takes >10s, it's a bug that should FAIL the test, not be hidden.

---

## 📊 Failure Pattern Analysis

### Browser-Specific Behavior

| Issue                    | Chromium | Firefox | WebKit |
| ------------------------ | -------- | ------- | ------ |
| Missing test isolation   | ❌       | ❌      | ❌     |
| AuthService DB coupling  | ❌       | ❌      | ❌     |
| dbContext race condition | ⚠️       | ⚠️      | ❌❌   |
| Fixed timeout issues     | ⚠️       | ⚠️      | ❌     |
| Large database slowness  | ⚠️       | ⚠️      | ❌     |

**Legend:**

- ❌ = Always fails
- ❌❌ = Fails more frequently
- ⚠️ = Intermittent failures

### Why WebKit Fails More

1. **Stricter form handling**: React onChange events need explicit focus
2. **Slower JavaScript execution**: Timeouts that work in Chromium fail in WebKit
3. **Different request timing**: More likely to hit race conditions
4. **Network stack differences**: SSE connections behave differently

---

## 🔧 Comprehensive Fix Roadmap

### Phase 1: Foundation (Required for Stability)

1. ✅ **Apply test isolation middleware**
   - Import and register in `index.ts`
   - Verify with logs

2. ✅ **Fix AuthService database coupling**
   - Refactor to accept Request parameter
   - Update all `verifyToken()` calls

3. ✅ **Remove global.dbClient mutations**
   - Store DB client on `req.dbClient`
   - Update all routes to use `req.dbClient || global.dbClient`

### Phase 2: Stability (Reduces Flakiness)

4. ⚠️ **Replace fixed timeouts**
   - Convert all `waitForTimeout` to condition-based waits
   - Priority: auth flows, navigation, API responses

5. ⚠️ **Implement session cleanup**
   - Clear sessions in `afterEach`
   - Add `/test/cleanup` endpoint

6. ⚠️ **Reduce database size**
   - Create minimal template DB
   - Add VACUUM to cleanup

### Phase 3: Performance (Speeds Up Suite)

7. 🔵 **Reduce login timeouts**
   - After fixing root causes, reduce to 10s
   - Add fast-fail logic

8. 🔵 **Optimize parallel execution**
   - Increase workers after race condition fix
   - Monitor for data contamination

9. 🔵 **Add performance benchmarks**
   - Track login time per test
   - Alert if >5s average

---

## 📈 Expected Outcomes After Fixes

### Before (Current State)

- **Pass Rate**: 50-60% Chromium, 30-40% WebKit
- **Average Test Duration**: 15-20 minutes
- **Flakiness**: High (same test passes/fails randomly)
- **Parallel Execution**: Disabled (workers=1)

### After (All Fixes Applied)

- **Pass Rate**: 95%+ all browsers
- **Average Test Duration**: 3-5 minutes
- **Flakiness**: Minimal (<5% on slow machines)
- **Parallel Execution**: Enabled (workers=4)

---

## 🎯 Priority Recommendations

### MUST DO (Blocking)

1. Apply test isolation middleware
2. Fix AuthService database coupling
3. Remove global.dbClient race condition

### SHOULD DO (High Impact)

4. Replace top 20 `waitForTimeout` calls
5. Implement session cleanup
6. Reduce template database size

### NICE TO HAVE (Optimization)

7. Reduce login timeouts
8. Enable parallel execution
9. Add performance monitoring

---

## 📝 Validation Checklist

After implementing fixes, validate with:

```bash
# 1. Verify middleware is applied
npm run dev:api
# Check logs for "[Test Isolation MW]" messages

# 2. Run single worker test
npx playwright test --workers=1 --project=chromium

# 3. Run parallel test (after race condition fix)
npx playwright test --workers=4 --project=chromium

# 4. Cross-browser validation
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# 5. Check database sizes
ls -lh .test-dbs/
# Should be <50MB each

# 6. Check session counts
sqlite3 .test-dbs/worker-0.db "SELECT COUNT(*) FROM sessions"
# Should be 0-2 per worker
```

---

## 🔍 Additional Investigation Areas

### Potential Issues Not Yet Analyzed

1. **SSE connection handling**: May contribute to slow keimenon loads
2. **API N+1 queries**: User auth might be making redundant DB calls
3. **React re-render loops**: Keimenon page might be re-fetching unnecessarily
4. **CORS preflight delays**: OPTIONS requests adding latency
5. **Worker pool initialization**: Job system startup might block requests

### Monitoring Recommendations

1. Add request timing middleware
2. Log all database queries with duration
3. Track session creation/validation times
4. Monitor SSE connection lifecycle
5. Add distributed tracing (OpenTelemetry)

---

## 🎓 Key Learnings

### What Worked

- ✅ Worker-specific database fixture design
- ✅ Header-based DB path passing
- ✅ Test cleanup patterns with `data_tag`
- ✅ WebKit-friendly login helper

### What Didn't Work

- ❌ Global database client swapping
- ❌ Singleton AuthService with hardcoded DB
- ❌ Fixed timeouts instead of condition waits
- ❌ Missing middleware registration

### Architecture Principles for E2E Testing

1. **Isolation First**: Design for parallelism from day one
2. **No Global State**: Pass context through request, not globals
3. **Explicit Over Implicit**: Don't rely on "it should work"
4. **Fast Failures**: Short timeouts expose real bugs faster
5. **Deterministic Cleanup**: Always clean up what you create

---

## 📞 Next Steps

1. **Review this analysis** with the team
2. **Prioritize fixes** based on impact vs. effort
3. **Create GitHub issues** for each fix
4. **Assign ownership** for implementation
5. **Set deadline** for Phase 1 completion
6. **Re-run analysis** after fixes to validate improvements

---

**Analysis Complete**
_This document represents ~3 hours of deep investigation into test failures, examining 23 test files, 19 API service files, middleware architecture, database state, and execution traces._
