# E2E Test DELETE Request CORS Issue - Status Report

## Problem

Test #4 "should remove job from table after deletion" fails because DELETE requests never reach the API server, despite confirmation dialog being accepted and frontend code executing.

## Investigation Summary

### What We've Tried

1. ✅ Added SSE broadcast to correct DELETE endpoint (jobs.routes.ts)
2. ✅ Fixed React state capture race condition (ImportsTableCard.tsx)
3. ❌ Added X-Test-Id to CORS allowedHeaders (both cases)
4. ❌ Commented out allowedHeaders entirely to allow all headers
5. ❌ Disabled x-test-id header in Playwright fixture
6. ❌ Set maxAge to 0 to disable CORS preflight caching

### Key Findings

- Frontend logs show "[DELETE] Sending DELETE request" but never "[DELETE] Response"
- API server logs show ZERO HTTP DELETE requests (only GET/POST work)
- Browser console shows no CORS errors (requests fail silently)
- Issue persists even WITHOUT the x-test-id custom header
- The fetch promise appears to hang indefinitely

### Evidence

- Test consistently times out after 5-second wait (31 → 31 jobs)
- GET/POST requests to same endpoint work fine
- DELETE button IS clicked (bulkActionLoading becomes true)
- Confirmation dialog IS accepted
- Request NEVER leaves the browser or is blocked before reaching server

## Current Hypothesis

The browser is either:

1. **Caching CORS preflight responses** despite maxAge=0
2. **Silently blocking DELETE** due to some browser security policy
3. **Experiencing a Next.js/Playwright interaction issue** with DELETE specifically

## Recommended Next Steps

1. **Test DELETE manually** in browser DevTools to rule out E2E-specific issues:

   ```javascript
   await fetch('http://localhost:4001/api/v1/jobs/JOB_ID', {
     method: 'DELETE',
     headers: { Authorization: 'Bearer TOKEN' },
   });
   ```

2. **Add error logging** to fetch in ImportsTableCard.tsx to catch silent failures

3. **Check browser console** in manual test for any CORS/security warnings

4. **Temporarily allow all CORS** by setting:

   ```javascript
   origin: '*'; // WARNING: Only for debugging
   ```

5. **Consider alternative approach**: Use POST with `_method=DELETE` as a workaround

## Files Modified

- `apps/api/src/modules/jobs/infrastructure/jobs.routes.ts` - Added SSE broadcast
- `apps/api/src/app.ts` - Passed sseBroadcaster parameter
- `apps/web/src/components/canvas/ImportsTableCard.tsx` - State capture fix
- `apps/api/src/middleware/security.middleware.ts` - Multiple CORS attempts
- `tests/e2e/fixtures/testId.ts` - Disabled x-test-id header

## Status: BLOCKED

Need to identify why browser is silently blocking DELETE requests to localhost:4001 from localhost:3000.
