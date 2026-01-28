# Quick Start: WebKit Authentication Debug Session

**Purpose**: Debug WebKit navigation failures in E2E tests
**Status**: Ready to begin
**Prerequisites**: Hardcoded timeout fixes complete ✅

---

## Problem Statement

**WebKit Tests**: 14/31 failing (45% failure rate)
**Chromium/Firefox**: 2-3/31 failing (6-10% failure rate)

### Common Failure Pattern (WebKit Only)

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
Error: page.waitForURL: Test timeout of 30000ms exceeded.
waiting for navigation until "load"

await page.waitForURL(/\/keimenon/);
```

**What happens**:

1. ✅ Login form loads
2. ✅ Credentials submitted
3. ✅ API returns 200 + JWT token
4. ❌ Browser stuck on `/login` page (never navigates to `/keimenon`)
5. ❌ Test times out after 30 seconds

**Affected Tests** (14 total):

- All keimenon-operations tests (3)
- Most console-error-filtering tests (5)
- Some data-management tests (1)
- Some authentication flow tests (2)
- Some settings-navigation tests (2)
- 1 data-management cleanup test

---

## Investigation Checklist

### Phase 1: Add WebKit-Specific Logging (15 min)

Add detailed logging to understand what's happening during navigation:

```typescript
// tests/e2e/fixtures/testId.ts or create new fixtures/webkit.ts

import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page, browserName }, use) => {
    if (browserName === 'webkit') {
      // Log all navigation events
      page.on('framenavigated', (frame) => {
        console.log(`[WebKit Nav] ${new Date().toISOString()} - ${frame.url()}`);
      });

      // Log localStorage changes
      page.on('console', (msg) => {
        if (msg.text().includes('localStorage') || msg.text().includes('token')) {
          console.log(`[WebKit Storage] ${msg.text()}`);
        }
      });

      // Log network requests to API
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          console.log(`[WebKit API Request] ${request.method()} ${request.url()}`);
        }
      });

      page.on('response', (response) => {
        if (response.url().includes('/api/')) {
          console.log(`[WebKit API Response] ${response.status()} ${response.url()}`);
        }
      });
    }

    await use(page);
  },
});
```

**Run single test with logging**:

```bash
npx playwright test tests/e2e/keimenon-operations.spec.ts --project=webkit -g "should load keimenon page successfully"
```

### Phase 2: Check SSE Connection Timing (10 min)

WebKit may have issues with Server-Sent Events initialization:

```typescript
// tests/e2e/keimenon-operations.spec.ts (modify beforeEach)

test.beforeEach(async ({ page, browserName }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // WebKit-specific: Wait for SSE connection before navigation
  if (browserName === 'webkit') {
    console.log('[WebKit] Waiting 5s for SSE connection initialization...');
    await page.waitForTimeout(5000);
  }

  await page.waitForURL(/\/keimenon/);
  await page.waitForLoadState('domcontentloaded');
});
```

**Test hypothesis**: Does 5s SSE wait fix navigation?

### Phase 3: Verify Token Persistence (10 min)

Check if JWT token is properly stored before navigation:

```typescript
test.beforeEach(async ({ page, browserName }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);

  // Set up API response listener BEFORE clicking submit
  const loginPromise = page.waitForResponse(
    (response) => response.url().includes('/api/v1/auth/login'),
    { timeout: 15000 }
  );

  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for API response
  const loginResponse = await loginPromise;
  console.log(`[${browserName}] Login API: ${loginResponse.status()}`);

  // WebKit-specific: Explicitly wait for token in localStorage
  if (browserName === 'webkit') {
    await page.waitForFunction(() => localStorage.getItem('keimenon_token') !== null, {
      timeout: 5000,
    });
    console.log('[WebKit] Token confirmed in localStorage');
  }

  await page.waitForURL(/\/keimenon/);
});
```

**Test hypothesis**: Does explicit token wait fix navigation?

### Phase 4: Test Extended Timeout (5 min)

Maybe 30s is still not enough for WebKit:

```typescript
// playwright.config.ts
{
  name: 'webkit',
  use: {
    ...devices['Desktop Safari'],
    extraHTTPHeaders: {
      'x-test-source': 'playwright-e2e',
    },
    actionTimeout: 60000,      // Increase to 60s
    navigationTimeout: 60000,  // Increase to 60s
  },
},
```

**Run test**:

```bash
npx playwright test tests/e2e/keimenon-operations.spec.ts --project=webkit
```

**Test hypothesis**: Does 60s timeout allow navigation to complete?

### Phase 5: Check React Router Middleware (15 min)

Investigate if Next.js middleware evaluation is slow in WebKit:

```typescript
// apps/web/middleware.ts (if exists)
// Add logging to understand middleware execution time

export async function middleware(request: NextRequest) {
  const start = Date.now();
  console.log('[Middleware] Start:', request.url);

  // ... existing middleware logic ...

  const duration = Date.now() - start;
  console.log(`[Middleware] Complete in ${duration}ms:`, request.url);

  return response;
}
```

**Alternative**: Temporarily disable middleware for WebKit tests:

```typescript
// tests/e2e/keimenon-operations.spec.ts
test.beforeEach(async ({ page, browserName, context }) => {
  if (browserName === 'webkit') {
    // Bypass middleware by setting cookie/header that middleware checks
    await context.addCookies([
      { name: 'bypass_middleware', value: 'e2e_test', domain: 'localhost', path: '/' },
    ]);
  }

  // ... rest of login flow ...
});
```

---

## Quick Commands

### Run Single WebKit Test (with debugging)

```bash
DEBUG=pw:api npx playwright test tests/e2e/keimenon-operations.spec.ts --project=webkit -g "should load keimenon page successfully" --headed
```

### Run WebKit Suite Only

```bash
npx playwright test tests/e2e/ --project=webkit
```

### Run with Playwright Inspector

```bash
PWDEBUG=1 npx playwright test tests/e2e/keimenon-operations.spec.ts --project=webkit
```

### Generate Trace for Failed Test

```bash
npx playwright test tests/e2e/keimenon-operations.spec.ts --project=webkit --trace on
npx playwright show-trace test-results/.../trace.zip
```

---

## Expected Outcomes

After investigation, you should identify ONE of these root causes:

### Scenario A: SSE Connection Delay

- **Symptom**: 5s wait after login fixes navigation
- **Fix**: Add `await page.waitForTimeout(5000)` for WebKit only
- **Long-term**: Improve SSE connection initialization or make it optional

### Scenario B: Token Persistence Timing

- **Symptom**: Explicit token wait fixes navigation
- **Fix**: Add `waitForFunction` to check token before navigation
- **Long-term**: Improve localStorage sync or use sessionStorage

### Scenario C: Middleware Slowness

- **Symptom**: 60s timeout allows navigation to complete
- **Fix**: Optimize middleware or bypass for E2E tests
- **Long-term**: Profile middleware execution, cache results

### Scenario D: WebKit-Specific Router Bug

- **Symptom**: None of the above fixes work
- **Fix**: May need to use full page reload instead of client-side navigation
- **Long-term**: Report to Next.js or Playwright teams

---

## Success Criteria

✅ Identify root cause of WebKit navigation failure
✅ Implement temporary workaround to unblock tests
✅ Document long-term fix needed
✅ Get WebKit pass rate from 13% to >60%

---

## Files to Review

### Current State

- [TIMEOUT_FIXES_COMPLETE.md](TIMEOUT_FIXES_COMPLETE.md) - Today's session summary
- [playwright.config.ts](playwright.config.ts) - WebKit timeout config
- [tests/e2e/keimenon-operations.spec.ts](tests/e2e/keimenon-operations.spec.ts) - Example failing test

### Related Issues

- [E2E_FIXES_COMPLETE_SUMMARY.md](E2E_FIXES_COMPLETE_SUMMARY.md) - Previous fixes
- [E2E_DELETE_REQUEST_INVESTIGATION.md](E2E_DELETE_REQUEST_INVESTIGATION.md) - DELETE workaround pattern

---

## Time Estimate

- **Investigation**: 45-60 minutes
- **Implementing fix**: 15-30 minutes
- **Verification**: 15 minutes
- **Documentation**: 10 minutes
- **Total**: 1.5-2 hours

---

**Next Session Goal**: Fix WebKit authentication flow and achieve >60% pass rate for WebKit tests.

---

**End of Guide**
