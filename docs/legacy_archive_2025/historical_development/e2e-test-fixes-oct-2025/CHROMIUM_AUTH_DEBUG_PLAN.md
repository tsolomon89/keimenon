# Chromium Authentication with Test Isolation - Debug Plan

**Issue:** Chromium tests fail to authenticate when using isolated worker databases, despite identical setup working in Firefox.

**Status:** Critical Blocker for Phase 2 completion

## Problem Statement

### What's Happening

**Chromium Behavior:**

- Tests using test-isolation fixture get stuck on `/login` page
- Login form submission doesn't redirect to `/canvas`
- Error: `expect(page).toHaveURL(/\/canvas/)`
  - Expected: `/canvas`
  - Received: `/login`

**Firefox Behavior:**

- Same tests pass 100% (6/6)
- Login succeeds, redirects to canvas
- All functionality works as expected

**Test Context:**

- Both browsers use same test-isolation fixture
- Both send `X-Test-DB-Path` header
- Both workers initialize databases from same template
- Both use same test credentials (admin@admin.com)

### What We Know

✅ **Working:**

- Test isolation infrastructure (logs show worker DBs being used)
- Firefox authentication with isolated DBs (100% success)
- Chromium authentication WITHOUT isolated DBs (flow-auth-canvas tests pass)
- Worker database initialization (DBs contain test user)
- Middleware activation (logs show DB path routing)

❌ **Not Working:**

- Chromium authentication WITH isolated DBs
- Specific to console-error-filtering tests

### Files Involved

**Test Infrastructure:**

- [tests/e2e/fixtures/test-isolation.ts](../../tests/e2e/fixtures/test-isolation.ts)
- [tests/e2e/console-error-filtering.spec.ts](../../tests/e2e/console-error-filtering.spec.ts)
- [tests/e2e/helpers/auth.helper.ts](../../tests/e2e/helpers/auth.helper.ts)

**API Middleware:**

- [apps/api/src/middleware/test-isolation.middleware.ts](../../apps/api/src/middleware/test-isolation.middleware.ts)
- [apps/api/src/middleware/db-context.middleware.ts](../../apps/api/src/middleware/db-context.middleware.ts)
- [apps/api/src/utils/get-db-client.ts](../../apps/api/src/utils/get-db-client.ts)

**Authentication:**

- [apps/api/src/routes/v1/auth.ts](../../apps/api/src/routes/v1/auth.ts) (presumed)
- [apps/web/src/stores/authStore.ts](../../apps/web/src/stores/authStore.ts) (presumed)

## Hypothesis Tree

### Hypothesis 1: Header Propagation Issue

**Theory:** `X-Test-DB-Path` header not being sent in Chromium authentication requests

**Test Method:**

1. Add network logging to Chromium test
2. Capture all `/api/v1/auth/login` requests
3. Verify presence of `X-Test-DB-Path` header
4. Compare to Firefox network logs

**Expected Outcome:**

- If header missing → Chromium's `page.setExtraHTTPHeaders()` isn't working
- If header present → Move to next hypothesis

### Hypothesis 2: Database Path Validation Failure

**Theory:** Test isolation middleware rejects the DB path in Chromium (security check)

**Test Method:**

1. Add verbose logging to `test-isolation.middleware.ts`
2. Log received header value
3. Log path normalization result
4. Log validation checks
5. Compare Chromium vs Firefox logs

**Expected Outcome:**

- If validation fails → Path normalization issue (Windows path handling?)
- If validation passes → Move to next hypothesis

### Hypothesis 3: Database Client Creation Failure

**Theory:** `getDbClient()` fails to create client for Chromium requests

**Test Method:**

1. Add try-catch logging to `get-db-client.ts`
2. Log DatabaseFactory.getClient() calls
3. Check for errors during client creation
4. Verify database file accessibility

**Expected Outcome:**

- If client creation fails → Database file locking or permissions issue
- If client creation succeeds → Move to next hypothesis

### Hypothesis 4: Global Database Client Swap Issue

**Theory:** `global.dbClient` swap in db-context middleware fails in Chromium

**Test Method:**

1. Add logging before/after global.dbClient assignment
2. Verify cleanup handlers are registered
3. Check if original client is restored
4. Log timing of middleware execution

**Expected Outcome:**

- If swap fails → Race condition or async issue
- If swap succeeds → Move to next hypothesis

### Hypothesis 5: Authentication Query Issue

**Theory:** Auth route doesn't use `getDbClient()` or uses cached connection

**Test Method:**

1. Review authentication route code
2. Verify it calls `getDbClient(req)`
3. Check for cached database connections
4. Add logging to auth query execution

**Expected Outcome:**

- If not using getDbClient → Auth route bypassing test isolation
- If using global.dbClient directly → Needs refactoring

### Hypothesis 6: Test User Not in Worker DB

**Theory:** Worker database doesn't actually contain test user despite logs

**Test Method:**

1. After test failure, inspect worker DB file
2. Query users table directly with sqlite3
3. Verify test user exists with correct credentials
4. Compare to main database

**Expected Outcome:**

- If user missing → Database copy/initialization issue
- If user present → Move to next hypothesis

### Hypothesis 7: Browser-Specific Cookie/Storage Handling

**Theory:** Chromium handles cookies/localStorage differently with custom headers

**Test Method:**

1. Check if JWT token is stored in localStorage after login
2. Compare cookie behavior between Chromium and Firefox
3. Check for CORS or security policy differences
4. Review browser console for security warnings

**Expected Outcome:**

- If token not stored → Cookie/storage isolation issue
- If token stored but not sent → Header conflict issue

### Hypothesis 8: Race Condition with Database Initialization

**Theory:** Chromium is faster than Firefox, hits auth endpoint before DB is ready

**Test Method:**

1. Add explicit wait after database initialization
2. Verify database file exists before login attempt
3. Add health check that validates DB accessibility
4. Compare timing logs between browsers

**Expected Outcome:**

- If timing-related → Add initialization barriers
- If not timing → Move to next hypothesis

## Debug Approach

### Phase 1: Minimal Reproduction (Priority 1)

**Goal:** Create simplest possible failing case

**Steps:**

1. Create `debug-chromium-isolation.spec.ts`
2. Single test: authenticate with test-isolation fixture
3. Add extensive logging at each step
4. Run Chromium only

**Code:**

```typescript
import { test, expect } from './fixtures/test-isolation';

test.describe('Chromium Isolation Debug', () => {
  test('should authenticate with isolated database', async ({ page, dbPath }) => {
    console.log(`[Debug] Using DB: ${dbPath}`);

    // Check if DB file exists
    const fs = require('fs');
    console.log(`[Debug] DB exists: ${fs.existsSync(dbPath)}`);

    // Enable network logging
    page.on('request', (request) => {
      if (request.url().includes('/auth')) {
        console.log(`[Debug] Auth request: ${request.url()}`);
        console.log(`[Debug] Headers:`, request.headers());
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('/auth')) {
        console.log(`[Debug] Auth response: ${response.status()}`);
      }
    });

    // Navigate to login
    await page.goto('/login');
    console.log(`[Debug] On login page: ${page.url()}`);

    // Fill login form
    await page.fill('[type="email"]', 'admin@admin.com');
    await page.fill('[type="password"]', 'admin123');
    console.log(`[Debug] Form filled`);

    // Submit
    await page.click('button[type="submit"]');
    console.log(`[Debug] Form submitted`);

    // Wait for navigation (will fail, but we'll see logs)
    try {
      await expect(page).toHaveURL(/\/canvas/, { timeout: 10000 });
      console.log(`[Debug] ✅ Navigated to canvas`);
    } catch (error) {
      console.log(`[Debug] ❌ Still on: ${page.url()}`);
      throw error;
    }
  });
});
```

### Phase 2: API Request Logging (Priority 2)

**Goal:** Capture complete request flow through middleware stack

**Steps:**

1. Add detailed logging to middleware chain:
   - test-isolation.middleware.ts (header validation)
   - db-context.middleware.ts (client swapping)
   - auth route (query execution)
2. Run Chromium test and capture logs
3. Run Firefox test and capture logs
4. Compare logs side-by-side

**Logging Points:**

```typescript
// test-isolation.middleware.ts
console.log('[Test Isolation MW] Request:', {
  url: req.url,
  method: req.method,
  headers: {
    'x-test-db-path': req.headers['x-test-db-path'],
    'user-agent': req.headers['user-agent'],
  },
});

// db-context.middleware.ts
console.log('[DB Context MW] Before swap:', {
  hasTestDbPath: !!req.testDbPath,
  originalClient: !!global.dbClient,
});

console.log('[DB Context MW] After swap:', {
  newClient: !!global.dbClient,
  testDbPath: req.testDbPath,
});

// auth route (add if missing)
const dbClient = await getDbClient(req);
console.log('[Auth Route] Using DB client:', {
  hasClient: !!dbClient,
  testDbPath: req.testDbPath,
});
```

### Phase 3: Database Inspection (Priority 2)

**Goal:** Verify worker database contains test user

**Steps:**

1. After Chromium test fails, keep database file
2. Query database directly:

```bash
sqlite3 .test-dbs/worker-4.db "SELECT * FROM users WHERE email='admin@admin.com';"
sqlite3 .test-dbs/worker-4.db "SELECT * FROM accounts;"
```

3. Compare to main database
4. Verify schema matches

### Phase 4: Browser Comparison (Priority 3)

**Goal:** Identify Chromium-specific behavior differences

**Steps:**

1. Run same test in both browsers with identical logging
2. Capture:
   - Network requests (URLs, headers, bodies)
   - Console logs (both API and browser)
   - LocalStorage/Cookie state
   - Timing of each operation
3. Create side-by-side comparison table
4. Identify first point of divergence

## Implementation Plan

### Step 1: Add Enhanced Logging (30 minutes)

**Files to modify:**

1. Create `debug-chromium-isolation.spec.ts`
2. Add logging to `test-isolation.middleware.ts`
3. Add logging to `db-context.middleware.ts`
4. Add logging to `get-db-client.ts`

**Logging Strategy:**

- Prefix all logs with `[Test Isolation Debug]`
- Include browser type in logs (from user-agent)
- Log all header values
- Log database file paths
- Log client creation success/failure

### Step 2: Run Isolated Test (15 minutes)

**Commands:**

```bash
# Chromium only, single test, verbose output
npx playwright test debug-chromium-isolation --project=chromium --reporter=list

# Capture output
npx playwright test debug-chromium-isolation --project=chromium --reporter=list > chromium-debug.log 2>&1
```

**Expected Output:**

- Complete request flow through middleware
- All header values
- Database client state
- Authentication query results

### Step 3: Compare Browser Behavior (30 minutes)

**Commands:**

```bash
# Firefox with same logging
npx playwright test debug-chromium-isolation --project=firefox --reporter=list > firefox-debug.log 2>&1

# Compare logs
diff chromium-debug.log firefox-debug.log
```

**Analysis:**

- Identify first divergence point
- Compare header values
- Compare database paths
- Compare timing

### Step 4: Database Verification (15 minutes)

**Commands:**

```bash
# Inspect worker database
sqlite3 .test-dbs/worker-4.db ".schema users"
sqlite3 .test-dbs/worker-4.db "SELECT id, email, rank FROM users;"

# Compare to main database
sqlite3 .canvas-memory/canvas.db "SELECT id, email, rank FROM users;"
```

**Verification:**

- Test user exists in worker DB
- Schema matches main DB
- Credentials are correct

### Step 5: Fix and Validate (Variable)

Based on findings, implement fix and validate:

**If header propagation issue:**

- Fix: Update test-isolation fixture header setup
- Validate: Chromium test passes

**If path validation issue:**

- Fix: Update path normalization logic
- Validate: Both browsers pass

**If client creation issue:**

- Fix: Add error handling and retry logic
- Validate: Client creation succeeds

**If authentication bypass:**

- Fix: Refactor auth route to use getDbClient()
- Validate: Auth queries use worker DB

## Success Criteria

✅ Chromium console-error-filtering tests pass (6/6)
✅ Firefox tests remain passing (6/6)
✅ Test isolation logs show correct DB routing for both browsers
✅ No regression in other test files
✅ Documentation updated with findings

## Timeline Estimate

| Phase                | Duration      | Dependencies |
| -------------------- | ------------- | ------------ |
| Minimal Reproduction | 1 hour        | None         |
| API Logging          | 1 hour        | Phase 1      |
| Database Inspection  | 30 min        | Phase 1      |
| Browser Comparison   | 1 hour        | Phase 2      |
| Fix Implementation   | 2-4 hours     | Phase 2-4    |
| Validation           | 30 min        | Fix done     |
| **Total**            | **6-8 hours** | Sequential   |

## Next Actions

1. ✅ Document Phase 2 results
2. ⏳ Create debug test file
3. ⏳ Add enhanced logging to middleware
4. ⏳ Run Chromium isolated test
5. ⏳ Analyze logs and identify root cause
6. ⏳ Implement fix
7. ⏳ Validate with full test suite

---

**Current Status:** Ready to begin Phase 1 (Minimal Reproduction)
**Priority:** P0 - Blocking Phase 2 completion
**Owner:** AI Agent (Claude Code)
**Updated:** 2025-10-30
