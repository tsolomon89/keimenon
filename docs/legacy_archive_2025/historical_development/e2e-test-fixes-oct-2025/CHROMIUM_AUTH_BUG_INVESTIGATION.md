# Chromium Authentication Bug Investigation

**Date:** 2025-10-30
**Status:** IN PROGRESS - Root cause NOT yet identified
**Impact:** HIGH - Blocks E2E test suite

## Executive Summary

During Phase 2 test isolation implementation, discovered that **ALL authentication attempts are failing** in E2E tests (all browsers, not just Chromium). This is NOT a test isolation issue - it affects all authentication flows.

## What Was Initially Thought

Originally appeared to be:

- Chromium-specific browser issue ❌
- Test isolation middleware problem ❌
- Worker database configuration issue ❌

## What Was Actually Discovered

### Critical Bug #1: Audit Logger Schema Violation (FIXED ✅)

**File:** [apps/api/src/utils/audit-logger.ts:109](apps/api/src/utils/audit-logger.ts#L109)

**Bug:**

```typescript
'security',  // ❌ INVALID - not in CHECK constraint
```

**Fixed To:**

```typescript
'native',  // ✅ Valid mode value
```

**Schema Constraint:**

```sql
mode TEXT NOT NULL CHECK(mode IN ('native', 'crm', 'nested'))
```

**Impact:**

- Authentication was attempting to log audit events with `mode='security'`
- SQLite CHECK constraint rejected the invalid value
- Error was caught and logged to console (line 117-120 try-catch)
- **Did NOT break authentication** - error is non-fatal

**Verification:**

```bash
curl http://localhost:4001/api/v1/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@admin.com", "password": "admin123"}'
# Result: HTTP 200, valid token returned ✅
```

### Critical Bug #2: Unknown E2E Authentication Failure (UNSOLVED ❌)

**Symptoms:**

- API authentication works via curl/direct HTTP ✅
- Browser-based E2E tests ALL FAIL ❌
- All browsers affected (Chromium, Firefox, Webkit)
- Error message visible on login page
- No token stored in localStorage
- User stuck on `/login` page

**Evidence:**

1. **API Works:**

   ```bash
   curl test: HTTP 200, token received ✅
   ```

2. **Browser Tests Fail:**

   ```
   [Debug Phase 7] Authentication state:
     - Token in localStorage: ❌ Missing

   [Debug Phase 8] Error state:
     - Error message visible: ⚠️ Yes

   Final URL: http://localhost:3000/login  (Expected: /keimenon)
   ```

3. **Headers Sent Correctly:**

   ```
   ✅ X-Test-DB-Path header present: worker-0.db
   ✅ x-test-source: playwright-e2e
   ```

4. **Test Isolation Works:**
   ```
   [Worker 0] Using isolated DB: .test-dbs/worker-0.db
   [Worker 0] Worker DB initialized with standard test user
   [Test Isolation] Page configured with DB: worker-0.db
   ```

## What Was Ruled Out

❌ **Test isolation middleware** - Headers being sent and received correctly
❌ **Worker database issues** - DBs are copied correctly with test user
❌ **Audit logging** - Temporarily disabled, tests still fail
❌ **Browser-specific** - ALL browsers fail (Chromium, Firefox, Webkit)
❌ **API authentication logic** - Works via curl

## What Remains to Investigate

### Hypothesis 1: Frontend Authentication Flow Issue

**Likelihood:** HIGH

The API returns success, but the frontend may be:

- Not receiving/parsing the response correctly
- Failing to store the token
- Encountering a JavaScript error during login flow
- Checking for something that's missing in the response

**Next Steps:**

1. Check browser console logs during Playwright test
2. Examine frontend auth store/context code
3. Add network response logging in debug test
4. Check if response body is being parsed correctly

### Hypothesis 2: CORS or Header Issue in E2E Context

**Likelihood:** MEDIUM

E2E environment might have:

- Different CORS configuration
- Missing headers that frontend expects
- Cookie/session handling differences

**Next Steps:**

1. Compare curl response headers vs browser response headers
2. Check CORS middleware configuration
3. Verify Set-Cookie headers are present
4. Check if browser is blocking cookies

### Hypothesis 3: Playwright-Specific Browser Context Issue

**Likelihood:** MEDIUM

Playwright browsers might:

- Have different security policies
- Block localStorage access
- Not persist cookies correctly
- Have different JavaScript execution context

**Next Steps:**

1. Test with real browser (not Playwright)
2. Check Playwright browser context configuration
3. Verify localStorage/cookies permissions
4. Test with Playwright in non-headless mode

### Hypothesis 4: Database Transaction/Connection Issue

**Likelihood:** LOW

Even though curl works, there might be:

- Race condition in database operations
- Connection pooling issue specific to E2E
- Transaction isolation problem

**Next Steps:**

1. Add database operation logging
2. Check for deadlocks or timeouts
3. Verify transaction commit status

## Files Involved

### Backend (API)

- [apps/api/src/utils/audit-logger.ts](apps/api/src/utils/audit-logger.ts) - Audit log bug (FIXED)
- [apps/api/src/services/auth.service.ts](apps/api/src/services/auth.service.ts) - Authentication service
- [apps/api/src/routes/auth.routes.ts](apps/api/src/routes/auth.routes.ts) - Login endpoint
- [apps/api/src/middleware/test-isolation.middleware.ts](apps/api/src/middleware/test-isolation.middleware.ts) - Test DB routing (WORKING)
- [apps/api/src/middleware/db-context.middleware.ts](apps/api/src/middleware/db-context.middleware.ts) - DB client swapping (WORKING)

### Frontend (Web)

- Frontend auth store/context - **NOT YET EXAMINED**
- Login page component - **NOT YET EXAMINED**
- API client configuration - **NOT YET EXAMINED**

### Tests

- [tests/e2e/debug-chromium-isolation.spec.ts](tests/e2e/debug-chromium-isolation.spec.ts) - Debug test with extensive logging
- [tests/e2e/fixtures/test-isolation.ts](tests/e2e/fixtures/test-isolation.ts) - Test isolation fixtures (WORKING)

## Enhanced Logging Added

Created debug logging in:

1. **test-isolation.middleware.ts** - Request details, browser detection, path validation
2. **db-context.middleware.ts** - Client swapping operations
3. **get-db-client.ts** - Client creation and errors
4. **debug-chromium-isolation.spec.ts** - 8-phase debug test with network logging

All logs show correct operation up to the point where browser should receive auth response.

## Test Isolation Status

✅ **Test Isolation is WORKING CORRECTLY:**

- Worker-scoped fixtures implemented
- Per-worker databases created
- Headers sent and received
- Middleware activated correctly
- Database routing functional
- No conflicts between workers

❌ **But authentication is broken for unrelated reasons**

## Recommendations

### Immediate (Priority 1)

1. **Examine frontend authentication code**
   - Check login form submission handler
   - Verify response parsing logic
   - Check token storage mechanism
   - Look for error handling that might be swallowing issues

2. **Add response body logging to debug test**
   - Capture actual API response in Playwright
   - Compare to curl response
   - Check for differences in headers/body

3. **Test in real browser**
   - Open login page manually
   - Try authentication
   - Check browser console for errors
   - Verify if issue is Playwright-specific

### Medium Term (Priority 2)

4. **Review recent authentication changes**
   - Check git history for auth-related commits
   - Look for changes to login flow
   - Identify when tests last passed

5. **Simplify test case**
   - Create minimal reproduction without test isolation
   - Remove all custom headers
   - Use simplest possible browser context

### Long Term (Priority 3)

6. **Improve error visibility**
   - Add structured error responses
   - Improve frontend error display
   - Add request/response logging middleware

## Current State of Code

### Audit Logger (FIXED)

- ✅ Changed `mode='security'` to `mode='native'`
- ✅ Audit logging no longer causes CHECK constraint violations
- ⚠️ But temporarily disabled in auth.service.ts (line 365) for testing

### Test Isolation (COMPLETE)

- ✅ Worker-scoped fixtures working
- ✅ Headers propagating correctly
- ✅ Middleware activating properly
- ✅ Database routing functional

### Authentication (BROKEN)

- ✅ API endpoint returns success (curl)
- ❌ Frontend unable to complete login
- ❌ No token stored
- ❌ Error message displayed (content unknown)
- ❌ All E2E tests failing

## Debug Commands

```bash
# Test API directly
curl http://localhost:4001/api/v1/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@admin.com", "password": "admin123"}'

# Run debug test
npx playwright test debug-chromium-isolation --project=chromium --reporter=list

# Clean worker databases
rm -rf .test-dbs

# Check API server logs
# Look for stderr in background process d04c92

# Run specific test with video/screenshot
npx playwright test debug-chromium-isolation --headed --project=chromium
```

## Timeline

1. **Phase 2 Started:** Implement test isolation
2. **Discovered:** Tests failing to authenticate
3. **Initial Hypothesis:** Chromium-specific + test isolation issue
4. **Found:** Audit logger schema bug
5. **Fixed:** Audit logger bug
6. **Discovered:** Tests still failing
7. **Ruled Out:** Test isolation as cause
8. **Verified:** API works, frontend broken
9. **Current:** Need to investigate frontend code

## Impact

**Severity:** P0 - Critical
**Blocks:** All E2E tests, Phase 2 completion, CI/CD pipeline
**Workaround:** None currently
**Users Affected:** Development team only (E2E tests)

## Next Session Should Start With

1. Read this document
2. Check frontend authentication code (auth store, login component)
3. Add response body logging to debug test
4. Compare working curl response with failing Playwright response
5. Test manually in real browser to isolate if Playwright-specific

---

**Last Updated:** 2025-10-30 11:50 GMT
**Investigator:** AI Agent (Claude Code)
**Status:** Requires frontend code examination
