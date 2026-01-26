# E2E Test Troubleshooting Guide

This guide covers common issues with Playwright E2E tests and how to resolve them.

## Table of Contents

1. [Quick Fixes](#quick-fixes)
2. [Common Issues](#common-issues)
3. [Architecture](#architecture)
4. [Best Practices](#best-practices)
5. [Debugging Techniques](#debugging-techniques)

---

## Quick Fixes

### Problem: Tests Fail with "Module not found" or 404 errors

**Root Cause**: Next.js HMR cache poisoning - newly created modules are cached as 404s

**Solution**:

```bash
# Option 1: Run the E2E dev script (automatically cleans cache)
npm run e2e:dev

# Option 2: Clean cache manually
npm run e2e:clean-cache

# Option 3: Manual cleanup
rm -rf apps/web/.next/cache
```

**Prevention**: The E2E dev script now automatically cleans the Next.js cache before starting servers.

---

### Problem: Tests Fail with "Invalid email or password"

**Root Cause**: Password mismatch between test code and test database

**Check**:

1. Test database password (in `tests/e2e/fixtures/database-snapshots.ts`):

   ```typescript
   const passwordHash = await bcrypt.hash('TestPass123!', 10);
   ```

2. Test file password (e.g., `tests/e2e/flow-auth-canvas.spec.ts`):
   ```typescript
   const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPass123!';
   ```

**Solution**: Ensure both use the same password (`TestPass123!`)

---

### Problem: Global Setup Fails with ECONNREFUSED

**Root Cause**: Playwright resolving `localhost` to IPv6 (::1) instead of IPv4 (127.0.0.1)

**Fix Applied** (Oct 30, 2025):

- Changed [global-setup.ts:17-18](tests/e2e/global-setup.ts#L17-L18) to use `127.0.0.1`
- Changed [playwright.config.ts:46](playwright.config.ts#L46) to use `127.0.0.1`

**Verification**:

```bash
curl http://127.0.0.1:4001/health  # Should return 200 OK
curl http://127.0.0.1:3000         # Should return Next.js page
```

---

## Common Issues

### 1. HMR Cache Poisoning

**Symptoms**:

- Module not found errors
- 404 for newly created files (like `env.config.ts`)
- Import errors that don't make sense

**Why It Happens**:

- Next.js webpack dev server caches module resolution results
- When a new file is created AFTER the dev server starts, the cache has a "404" entry
- Subsequent requests continue to return 404 even though the file exists

**Solution**:

```bash
# Kill servers
npm run kill-ports

# Clean Next.js cache
npm run e2e:clean-cache

# Restart with clean cache
npm run e2e:dev
```

**Files Modified**:

- [scripts/e2e/dev.js](scripts/e2e/dev.js) - Added `cleanNextCache()` function
- [scripts/e2e/clean-cache.js](scripts/e2e/clean-cache.js) - New standalone script
- [package.json](package.json) - Added `e2e:clean-cache` script

---

### 2. Password Authentication Failures

**Symptoms**:

- "Invalid email or password" errors
- Tests fail at login step
- API logs show login errors

**Why It Happens**:

- Test database is created with a bcrypt hash of one password
- Test code uses a different password
- The two don't match, so authentication fails

**Solution**:

1. Check database snapshot creation:

   ```typescript
   // tests/e2e/fixtures/database-snapshots.ts:100
   const passwordHash = await bcrypt.hash('TestPass123!', 10);
   ```

2. Check test files:

   ```bash
   grep -r "TEST_PASSWORD" tests/e2e/*.spec.ts
   ```

3. Update all mismatches to use `'TestPass123!'`

**Files Fixed** (Oct 30, 2025):

- All 15 test files updated from `'123456'` to `'TestPass123!'`
- Comment in database-snapshots.ts updated for consistency

---

### 3. IPv4/IPv6 Resolution Issues

**Symptoms**:

- ECONNREFUSED errors in global setup
- Playwright can't connect to servers
- Servers are running but tests can't access them

**Why It Happens**:

- Windows/Node.js resolves `localhost` to IPv6 (::1) by default
- Servers listen on IPv4 (127.0.0.1)
- Playwright's request context tries IPv6 first, fails

**Solution**:
Use explicit IPv4 addresses (`127.0.0.1`) instead of `localhost`

**Files Fixed** (Oct 30, 2025):

- [tests/e2e/global-setup.ts:17-18](tests/e2e/global-setup.ts#L17-L18)
- [playwright.config.ts:46](playwright.config.ts#L46)

---

## Architecture

### Test Isolation Architecture

```
┌─────────────────────────────────────────────┐
│ Playwright Test Runner (4 workers)         │
└────┬─────────┬─────────┬─────────┬──────────┘
     │         │         │         │
     ▼         ▼         ▼         ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│Worker 0 ││Worker 1 ││Worker 2 ││Worker 3 │
│worker-0 ││worker-1 ││worker-2 ││worker-3 │
│  .db    ││  .db    ││  .db    ││  .db    │
└────┬────┘└────┬────┘└────┬────┘└────┬────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌──────────────────────────────────────────┐
│ Test Isolation Middleware                │
│ - Routes requests by X-Test-DB-Path      │
│ - Swaps DB client per worker             │
│ - Manages savepoints for atomic cleanup  │
└──────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────┐
│ API Server (NODE_ENV=test)               │
│ - Test helper routes enabled             │
│ - Each worker gets isolated database     │
│ - Savepoints for transaction rollback    │
└──────────────────────────────────────────┘
```

### Key Components

1. **Database Snapshot Template** (`snapshot-template.db`)
   - Created once in global setup
   - Contains: schema + test user + zero data
   - Workers copy this for clean starts

2. **Worker Databases** (`worker-N.db`)
   - Each worker gets its own database copy
   - Perfect isolation - no cross-contamination
   - Parallel test execution without conflicts

3. **Savepoints**
   - Each test wrapped in a savepoint (BEGIN → test → ROLLBACK)
   - Atomic cleanup - database returns to pristine state
   - No need for manual cleanup in `afterEach`

4. **Test Isolation Middleware**
   - Reads `X-Test-DB-Path` header from Playwright
   - Swaps database client for that request
   - Ensures test data stays isolated

---

## Best Practices

### 1. Always Use the E2E Dev Script

```bash
# ✅ Good - automatic cleanup and setup
npm run e2e:dev

# ❌ Avoid - manual setup prone to issues
cd apps/api && npm run dev:test &
cd apps/web && npm run dev &
npx playwright test
```

**Why**: The E2E dev script:

- Cleans Next.js cache automatically
- Kills zombie processes on ports 3000/4001
- Sets proper environment variables
- Handles graceful shutdown

### 2. Use Explicit IPv4 Addresses

```typescript
// ✅ Good
const API_BASE_URL = 'http://127.0.0.1:4001';

// ❌ Avoid - may resolve to IPv6
const API_BASE_URL = 'http://localhost:4001';
```

### 3. Test Database Passwords

When creating test users, document the password clearly:

```typescript
// ✅ Good - clear comment
// Password: TestPass123! (used in all test files)
const passwordHash = await bcrypt.hash('TestPass123!', 10);

// ❌ Avoid - unclear, different from tests
const passwordHash = await bcrypt.hash('somepassword', 10);
```

### 4. Clean Restart When Things Break

If tests start failing mysteriously:

```bash
# Nuclear option - clean everything
npm run kill-ports
npm run e2e:clean-cache
rm -rf .test-dbs/worker-*.db
npm run e2e:dev
```

---

## Debugging Techniques

### 1. Check Server Logs

The E2E dev script shows server output with color-coded labels:

```
[API] POST /api/v1/auth/login
[Web] GET / 200 in 45ms
```

Look for:

- 404 errors → module not found (cache issue)
- 401 errors → authentication failure (password mismatch)
- ECONNREFUSED → IPv4/IPv6 issue

### 2. Test Individual Files

```bash
# Run a single test file
npx playwright test tests/e2e/flow-auth-canvas.spec.ts --project=chromium

# Run with UI mode for debugging
npx playwright test tests/e2e/flow-auth-canvas.spec.ts --project=chromium --ui

# Run in headed mode to see the browser
npx playwright test tests/e2e/flow-auth-canvas.spec.ts --project=chromium --headed
```

### 3. Check Database State

```bash
# Inspect the snapshot template
sqlite3 .test-dbs/snapshot-template.db

sqlite> SELECT email, password_hash FROM users;
admin@admin.com|$2b$10$...

sqlite> .exit
```

### 4. Verify Environment Variables

```bash
# Check if servers are using the right config
curl http://127.0.0.1:4001/health
curl http://127.0.0.1:3000

# Check environment in tests
# Add this to a test file temporarily:
console.log('API_BASE_URL:', process.env.API_BASE_URL);
```

### 5. Enable Playwright Debug Mode

```bash
# Step through tests in debugger
npx playwright test --debug

# Show browser DevTools
npx playwright test --headed --debug
```

### 6. Check Test Isolation

```bash
# View test isolation middleware logs in API server output
# Look for:
[Test Isolation MW] ✅ Path validated and attached
[DB Context MW] ✅ Client swapped successfully
[Test Helpers] ✅ Savepoint created
```

---

### 7. Module Health Validation

**Symptoms**:

- Tests fail during global setup
- "API modules are not healthy" errors
- Module loading issues after code changes

**Why It Happens**:

- Critical services (database, auth, workerPool, etc.) not initialized
- HMR cache poisoning affecting module resolution
- Database connection issues

**Solution**:

```bash
# Check module health manually
npm run diagnose-modules

# Restart servers if modules unhealthy
npm run kill-ports
npm run e2e:dev
```

**How It Works**:

- Global setup now validates `/health/modules` endpoint
- Checks: database, auth, storage, workerPool, jobRepository
- Fails fast if any module not loaded or responsive
- Provides actionable recommendations

---

## Quick Reference

### NPM Scripts

```bash
# E2E Development
npm run e2e:dev              # Start servers + Playwright UI
npm run e2e:clean-cache      # Clean Next.js cache only
npm run diagnose-modules     # Check API module health

# Run Tests
npm run e2e                  # Run all tests (all browsers)
npm run e2e:chromium         # Chromium only
npm run e2e:firefox          # Firefox only
npm run e2e:webkit           # WebKit only
npm run e2e:smoke            # Smoke tests only (fast, ~2min)
npm run e2e:smoke:ui         # Smoke tests with UI

# Debugging
npm run e2e:ui               # Playwright UI mode
npm run e2e:headed           # Show browser
npm run e2e:debug            # Step-through debugger

# Utilities
npm run kill-ports           # Kill processes on 3000/4001
npm run e2e:clean            # Clean test data from database
```

### File Locations

- **E2E Tests**: `tests/e2e/*.spec.ts`
- **Test Fixtures**: `tests/e2e/fixtures/`
- **Test Helpers**: `tests/e2e/helpers/`
- **Global Setup**: `tests/e2e/global-setup.ts`
- **Playwright Config**: `playwright.config.ts`
- **E2E Dev Script**: `scripts/e2e/dev.js`
- **Cache Clean Script**: `scripts/e2e/clean-cache.js`

### Key Files Modified

**October 30, 2025 - Initial Fixes:**

1. **HMR Cache Fix**:
   - [scripts/e2e/dev.js](scripts/e2e/dev.js) - Added cache cleanup
   - [scripts/e2e/clean-cache.js](scripts/e2e/clean-cache.js) - New script
   - [package.json](package.json) - Added `e2e:clean-cache` script

2. **Password Fix**:
   - All 15 test files in `tests/e2e/*.spec.ts`
   - [tests/e2e/fixtures/database-snapshots.ts](tests/e2e/fixtures/database-snapshots.ts)

3. **IPv4/IPv6 Fix**:
   - [tests/e2e/global-setup.ts](tests/e2e/global-setup.ts)
   - [playwright.config.ts](playwright.config.ts)

**November 5, 2025 - Module Health & Smoke Tests:**

1. **Module Health Validation**:
   - [apps/api/src/routes/health.routes.ts](apps/api/src/routes/health.routes.ts) - New health routes module with `/health/modules` endpoint
   - [apps/api/src/index.ts](apps/api/src/index.ts) - Integrated health routes
   - [scripts/diagnose-modules.js](scripts/diagnose-modules.js) - New diagnostic script
   - [tests/e2e/global-setup.ts](tests/e2e/global-setup.ts) - Added module validation
   - [package.json](package.json) - Added `diagnose-modules` script

2. **Smoke Tests**:
   - [playwright.smoke.config.ts](playwright.smoke.config.ts) - New smoke test configuration
   - [tests/e2e/flow-auth-canvas.spec.ts](tests/e2e/flow-auth-canvas.spec.ts) - Added @smoke tag
   - [package.json](package.json) - Added `e2e:smoke` and `e2e:smoke:ui` scripts

---

## Getting Help

If you're still stuck after trying this guide:

1. **Check Module Health First**: `npm run diagnose-modules`
2. **Check Recent Changes**: `git log --oneline tests/e2e/`
3. **Search Issues**: Look for similar problems in the project's GitHub issues
4. **Ask the Team**: Provide:
   - Exact error message
   - Steps to reproduce
   - Output from `npm run e2e:dev` and `npm run diagnose-modules`
   - Your OS and Node.js version

---

**Last Updated**: November 5, 2025
**Maintained By**: Canvas Memory OS Team
