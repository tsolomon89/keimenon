# E2E Test Warning Fixes

This document explains the fixes applied to eliminate warnings in E2E test output and improve test performance.

## Fix #1: Browser Storage Cleanup Order ✅

**Problem**: `SecurityError: Failed to read the 'localStorage' property` warnings during test teardown.

**Cause**: The test cleanup tried to clear localStorage after the test completed, but by that time the page had often navigated to `about:blank` or been closed, making localStorage inaccessible.

**Solution**: Reordered cleanup operations in [test-isolation.ts](./fixtures/test-isolation.ts):

1. Clear browser storage FIRST (while page is still accessible)
2. Then rollback database savepoints

**Impact**: Eliminates localStorage access warnings in test logs.

---

## Fix #2: NODE_ENV=test for Savepoint API ✅

**Problem**: `Failed to begin savepoint: 404` warnings because test helper routes were disabled.

**Cause**: API server started without `NODE_ENV=test`, causing test helper routes (including savepoint endpoints) to be disabled.

**Solution**: Use the correct npm script that automatically sets NODE_ENV=test.

### ✅ CORRECT Way to Run E2E Tests:

```bash
# Recommended: Automatically starts servers with NODE_ENV=test
npm run e2e:dev

# Or run tests directly (if servers already running with NODE_ENV=test)
npm run e2e
```

### ❌ WRONG Way (causes warnings):

```bash
# DON'T: Manually starting servers without NODE_ENV=test
cd apps/api && npm run dev &
cd apps/web && npm run dev &
```

### How It Works:

The `npm run e2e:dev` script ([scripts/e2e/dev.js](../../scripts/e2e/dev.js)):

1. Kills zombie processes on ports 3000 and 4001
2. Starts API server using `npm run dev:test` (which sets NODE_ENV=test via cross-env)
3. Starts web server on port 3000
4. Launches Playwright in UI mode

**Benefit**: Enables fast savepoint-based test isolation instead of slower worker DB fallback.

---

## Fix #3: Savepoint Availability Check ✅

**Problem**: No warning when savepoint API is unavailable, leading to confusion about degraded performance.

**Solution**: Added health check in [global-setup.ts](./global-setup.ts:77) that checks `/api/v1/test/status` endpoint to detect if savepoints are available and provides clear guidance.

**Output when NODE_ENV=test is NOT set**:

```
⚠️  Savepoint API not available (status: 404)
   This means NODE_ENV=test is not set on the API server.
   Tests will use fallback worker DB isolation (slower but reliable).

💡 For better performance, start servers with:
   npm run e2e:dev   (automatically sets NODE_ENV=test)
```

**Output when properly configured**:

```
✅ Savepoint API available (fast transactional isolation enabled)
```

**Impact**: Provides clear feedback about test configuration quality.

---

## Performance Comparison

### With Savepoints (NODE_ENV=test set):

- ✅ Fast transactional rollback after each test
- ✅ No file I/O during cleanup
- ✅ ~10-20ms cleanup time per test
- ✅ Clean test logs

### Without Savepoints (fallback mode):

- ⚠️ Worker-specific database files used
- ⚠️ File-based isolation with snapshot restoration
- ⚠️ ~50-100ms overhead per test
- ⚠️ Warning messages in logs

---

## Summary

All three fixes have been applied:

1. **Fix #1**: Browser storage cleanup order - DONE ✅
2. **Fix #2**: Documentation about proper npm scripts - DONE ✅
3. **Fix #3**: Savepoint availability health check - DONE ✅

Tests now run cleanly with minimal warnings and optimal performance when using `npm run e2e:dev`.
