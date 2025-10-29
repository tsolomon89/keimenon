# Quick Start - Next Session

## Current Blocker

DELETE requests from Playwright E2E tests never reach the Express API server, causing the bulk job deletion test to fail.

## What You Need to Know

- **curl DELETE works** ✅ - Server-side is configured correctly
- **Playwright DELETE fails** ❌ - Both Firefox and Chromium
- **No CORS errors in console** - Requests hang silently forever
- **No OPTIONS preflight sent** - Required for DELETE with custom headers

## Quick Diagnosis

This is a Playwright network interception issue, not a code bug. The browser automation layer is blocking cross-origin DELETE requests.

## Recommended First Action

Try adding `bypassCSP: true` to Playwright config:

```typescript
// playwright.config.ts
{
  name: 'chromium',
  use: {
    ...devices['Desktop Chrome'],
    bypassCSP: true,  // ADD THIS LINE
  },
}
```

Then run:

```bash
npx playwright test tests/e2e/data-management-ui-updates.spec.ts -g "should handle bulk job deletion" --project=chromium
```

## If That Doesn't Work

Implement Next.js proxy to avoid cross-origin entirely:

```javascript
// apps/web/next.config.js
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: 'http://localhost:4001/api/:path*',
    },
  ];
}
```

## Files That Need Cleanup After Fix

These files have TEMPORARY changes that should be reverted:

1. `tests/e2e/data-management-ui-updates.spec.ts:1-3` - Restore testId import
2. `playwright.config.ts:61-87` - Restore extraHTTPHeaders
3. `apps/api/src/middleware/security.middleware.ts:78` - Change maxAge back to 86400

## Full Details

See [E2E_DELETE_REQUEST_INVESTIGATION.md](./E2E_DELETE_REQUEST_INVESTIGATION.md) for complete investigation timeline, findings, and alternative solutions.

## Test Command

```bash
# Start servers
npm run dev:clean

# In new terminal, run test
npx playwright test tests/e2e/data-management-ui-updates.spec.ts -g "should handle bulk job deletion" --project=chromium
```

## Success Criteria

- DELETE requests appear in API server logs
- Test assertion passes: job count decreases from 26 to 24
- Console log shows "Response received for job..." (currently missing)
