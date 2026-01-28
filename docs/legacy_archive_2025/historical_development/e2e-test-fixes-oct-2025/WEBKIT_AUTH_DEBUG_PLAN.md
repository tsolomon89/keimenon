# WebKit Authentication Investigation Plan

**Date**: 2025-10-29  
**Owner**: QA Infra  
**Scope**: Stabilise WebKit E2E authentication and navigation flows

---

## Current Signal

- WebKit pass rate: **4/31 (13%)**
- Failure signature: `page.waitForURL(/\/keimenon/)` timing out after successful login POST
- Impacted specs: `keimenon-operations`, `console-error-filtering`, `settings-navigation`, `flow-auth-keimenon`, `data-management-ui-updates`
- Artifacts reviewed: `test-results/**/error-context.md` (all snapshots remain on `/login`), `flow-auth-keimenon.spec.ts` confirms JWT payload received prior to timeout

---

## Hypotheses To Validate

1. **SSE timing** – WebKit needs additional time for Server-Sent Event bootstrap before router transition.
2. **Token persistence** – JWT is not committed to `localStorage`/cookies in time for middleware to detect authenticated state.
3. **Middleware delays** – Next.js middleware (or route guards) evaluate slower on WebKit, preventing `/keimenon` redirect.
4. Navigation listener or CSP edge cases unique to WebKit.
5. Residual storage contamination between tests.

---

## Phase Breakdown

### Phase 1 – Instrument & Capture (15 min)

- **Change**: Extended `tests/e2e/fixtures/testId.ts` WebKit pages with navigation, storage, API request/response, and console logging. Generates structured `[WebKit][ISO] ...` lines.
- **Command**:
  ```bash
  npx playwright test tests/e2e/keimenon-operations.spec.ts --project=webkit --grep "keimenon page successfully" --headed
  ```
- **Exit criteria**: Confirm logs show `/login` POST 200, storage snapshot still missing `token` before redirect, or any unexpected page errors.

### Phase 2 – SSE Timing Probe (15 min)

- **Action**: In `keimenon-operations.spec.ts` temporary branch, inject WebKit-only `await page.waitForTimeout(5000)` post-sign-in.
- **Observation**: Determine whether additional wait allows navigation.
- **Decision**: If positive, investigate SSE initialisation path in app (`apps/web/src/lib/sse.ts?`). If negative, move to Phase 3.

### Phase 3 – Token Persistence Audit (20 min)

- **Action**: Add helper to explicitly poll `localStorage.getItem('token')` after login for WebKit.
- **Command**:
  ```typescript
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('token') !== null))
    .toBeTruthy({ timeout: 5000 });
  ```
- **Expected outcomes**:
  - **Pass** → Token exists but redirect still blocked → continue to Phase 4.
  - **Fail** → Inspect login response handler (`apps/web/src/lib/auth.ts`), confirm WebKit storage writes.

### Phase 4 – Middleware & Router Trace (25 min)

- **Action**: Log middleware timings in `apps/web/middleware.ts` (or equivalent guard) and capture `NextResponse` headers.
- **Secondary check**: Temporarily bypass middleware via cookie (`context.addCookies([{ name: 'bypass_middleware', ... }])`).
- **Goal**: Identify whether middleware denies or stalls redirect for WebKit only.

### Phase 5 – Stabilise & Document (20 min)

- Consolidate findings into root-cause summary.
- Implement minimal workaround (e.g., WebKit-specific wait, storage flush, middleware bypass).
- Update `QUICK_START_WEBKIT_DEBUG.md` with verified fix, create TODO for long-term product change.
- Re-run `npx playwright test tests/e2e --project=webkit` and archive trace for any remaining failures.

---

## Next Checks

- Validate newly added WebKit logging by inspecting `test-results/**/stdout.txt` after next run.
- Track storage snapshots for presence/absence of auth token.
- Ensure logs exclude raw PII (token length only).
- Prepare to instrument SSE client if Phase 2 inconclusive.

---

**Success Criteria**: Identify blocking layer, land reliable workaround, raise follow-up issue for product fix, and raise WebKit pass rate above 60% within this sprint.
