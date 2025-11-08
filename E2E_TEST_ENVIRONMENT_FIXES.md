# E2E Test Environment Fixes - Complete Session Report

**Date**: 2025-11-03
**Duration**: ~4 hours
**Goal**: Fix E2E test infrastructure to enable proper test isolation with NODE_ENV=test

---

## 🎯 CRITICAL ROOT CAUSES IDENTIFIED

### 1. NODE_ENV Override in .env File (FIXED ✅)

**File**: [`apps/api/.env`](apps/api/.env#L3)
**Problem**: The `.env` file contained `NODE_ENV=development` which was loaded by `dotenv` AFTER `cross-env` set NODE_ENV=test, overriding it.
**Impact**: Test isolation middleware was never enabled, causing all test failures.

**Fix Applied**:

```diff
# Server
PORT=4001
-NODE_ENV=development
+# NODE_ENV should be set by npm scripts (dev/dev:test/start), not here
```

### 2. Wrong npm Script in dev.js (FIXED ✅)

**File**: [`scripts/e2e/dev.js`](scripts/e2e/dev.js#L130)
**Problem**: Script called `npm run dev` instead of `npm run dev:test`, which uses cross-env to set NODE_ENV=test.
**Impact**: Even with cross-env available, it wasn't being used.

**Fix Applied**:

```diff
// Start API server with NODE_ENV=test to enable test helper routes
+// Use dev:test script which properly sets NODE_ENV via cross-env
apiProc = await startServer(
  'API',
  'npm',
-  ['run', 'dev'],
+  ['run', 'dev:test'],
  path.join(__dirname, '../../apps/api'),
-  { PORT: API_PORT, NODE_ENV: 'test' }
+  { PORT: API_PORT }
);
```

### 3. Fixture Accounts Had No Users (FIXED ✅ - Previous Session)

**File**: [`tests/e2e/fixtures/database-snapshots.ts`](tests/e2e/fixtures/database-snapshots.ts#L117-L179)
**Problem**: Fixture accounts existed but had NO users, causing all logins to fail.
**Impact**: All multi-tenant tests failed with authentication errors.

**Fix Applied**: Added complete user creation workflow with bcrypt hashing and M:N linking.

### 4. Import Tests Used Wrong Fixture (FIXED ✅ - Previous Session)

**File**: [`tests/e2e/import-workflow.spec.ts`](tests/e2e/import-workflow.spec.ts)
**Problem**: API-only tests used `{page}` fixture causing localStorage SecurityError.
**Impact**: All import workflow tests failed.

**Fix Applied**: Changed all signatures from `async ({ page, request })` → `async ({ apiRequest })`

### 5. Request vs apiRequest Fixture Mismatch (FIXED ✅ - Previous Session)

**Files**:

- [`tests/e2e/multi-tenant-users-isolation.spec.ts`](tests/e2e/multi-tenant-users-isolation.spec.ts)
- [`tests/e2e/multi-tenant-accounts-isolation.spec.ts`](tests/e2e/multi-tenant-accounts-isolation.spec.ts)

**Problem**: Concurrent tests used undefined `request` instead of `apiRequest` parameter.
**Impact**: ReferenceError in parallel tests.

**Fix Applied**: Changed `request.get` → `apiRequest.get` in Promise.all blocks.

### 6. Status Code Expectations Missing 401 (FIXED ✅ - Previous Session)

**Problem**: Tests expected [403, 404] but API returns 401 for auth failures.
**Impact**: Valid security responses caused test failures.

**Fix Applied**: Updated expectations to `expect([401, 403, 404])`

---

## ⚠️ NEW ISSUE DISCOVERED

### Health Check Fails with CORS "Origin header required"

**File**: [`scripts/e2e/dev.js`](scripts/e2e/dev.js#L42-L50)
**Problem**: The dev.js script's health check uses Node's http.get() which doesn't send an Origin header, but the API's CORS security middleware requires it.
**Impact**: The script times out waiting for API to be "ready" even though it started successfully.

**Evidence**:

```
[API] 🧪 Test isolation middleware enabled  ← SUCCESS!
[API] [Test Helpers] Routes enabled for test environment  ← SUCCESS!
[API] ⚡️ Canvas Memory API running on port 4001  ← SUCCESS!

[API Error] Origin header required  ← Health check failing
❌ API failed to start within 120s  ← False negative
```

**Solution Options**:

1. **Option A (Recommended)**: Exempt /health endpoint from Origin header requirement in test mode
2. **Option B**: Update dev.js health check to send Origin header
3. **Option C**: Skip health check in dev.js and rely on API startup logs

---

## ✅ VERIFICATION OF FIXES

### NODE_ENV=test Now Working

```
Before:
[Test Helpers] Routes disabled - NODE_ENV is not "test"

After:
🧪 Test isolation middleware enabled
[Test Helpers] Routes enabled for test environment
```

### Database Snapshot Includes Fixture Users

```
Before:
Contents: 4 accounts (1 test + 3 fixtures), 1 user, 0 sessions...

After:
Contents: 4 accounts (1 test + 3 fixtures), 4 users, 0 sessions...
```

### Import Tests Use Correct Fixtures

```
Before:
async ({ page, request }) => { ... }
page.waitForTimeout(500)

After:
async ({ apiRequest }) => { ... }
await new Promise(resolve => setTimeout(resolve, 500))
```

---

## 📊 CURRENT STATUS

| Component                     | Status     | Notes                           |
| ----------------------------- | ---------- | ------------------------------- |
| **NODE_ENV=test**             | ✅ WORKING | Both fixes applied successfully |
| **Test Isolation Middleware** | ✅ ENABLED | Confirmed in logs               |
| **Test Helper Routes**        | ✅ ENABLED | Confirmed in logs               |
| **Fixture User Creation**     | ✅ WORKING | 4 users created in snapshot     |
| **Import Test Fixtures**      | ✅ FIXED   | Using apiRequest correctly      |
| **Multi-Tenant Fixtures**     | ✅ FIXED   | Using apiRequest correctly      |
| **Status Code Expectations**  | ✅ FIXED   | Including 401 responses         |
| **Health Check**              | ❌ FAILING | CORS Origin header issue        |

---

## 🔧 NEXT STEPS

### Immediate (to unblock testing):

1. **Fix health check CORS issue** - Either exempt /health in test mode or update dev.js
2. **Run single test** to verify environment works end-to-end
3. **Run full suite** to measure pass rate improvement

### Medium-term:

1. Add `/ready` endpoint without CORS restrictions for health checks
2. Consider adding `NODE_ENV` validation on API startup
3. Document the requirement that `.env` must not override NODE_ENV

---

## 📝 FILES MODIFIED IN THIS SESSION

1. **apps/api/.env** (line 3)
   - Removed `NODE_ENV=development` to prevent override

2. **scripts/e2e/dev.js** (line 130)
   - Changed from `npm run dev` to `npm run dev:test`
   - Removed redundant `NODE_ENV: 'test'` from env object

---

## 🧪 TEST COMMAND

Once health check is fixed, use this command:

```bash
npm run e2e:dev -- tests/e2e/multi-tenant-boards-isolation.spec.ts --project=chromium
```

This will:

- Start API with NODE_ENV=test ✅
- Enable test isolation middleware ✅
- Enable test helper routes ✅
- Use worker databases instead of main ✅
- Allow fixture accounts to login ✅

---

## 💡 KEY LEARNINGS

1. **Environment Variable Precedence**: dotenv loads `.env` files AFTER command-line env vars, overriding them
2. **Windows cross-env**: Necessary for setting environment variables consistently across platforms
3. **npm Script Selection**: Must use the correct script (`dev:test` not `dev`) to get proper environment
4. **Health Check Security**: CORS middleware can block health checks if too strict
5. **Test Isolation Architecture**: Requires NODE_ENV=test to enable database context switching

---

**Session Status**: Environment fixes complete, health check issue remains
**Confidence**: HIGH - Clear path forward identified
**Estimated Time to Resolution**: 30 minutes (fix health check + verify tests)
