# E2E Test Backend Issues - Session 3

**Date**: 2025-11-09
**Current Pass Rate**: 121/165 (73.3%) → est. 123/165 (74.5%) after test fixes
**Session**: Continuation from previous E2E fixing sessions

## Summary

Investigation revealed that most failing tests are due to **backend issues**, not test bugs. User was correct that routes exist - the main issue is **session management**.

## Test Fixes Applied ✅

### Category 3: Fixed Test Bugs (2 fixes)

1. **[tests/e2e/nodes-crud-operations.spec.ts:92](tests/e2e/nodes-crud-operations.spec.ts#L92)** - Fixed validation test
   - **Issue**: Test removed optional 'title' field expecting validation error
   - **Fix**: Changed to remove REQUIRED 'fingerprint' field instead
   - **Status**: ✅ Passing

2. **[tests/e2e/boards-crud-operations.spec.ts:536-546](tests/e2e/boards-crud-operations.spec.ts#L536-L546)** - Fixed delete test
   - **Issue**: Missing defensive unwrapping `node1.node.id` → `undefined`
   - **Fix**: Added defensive unwrapping: `const createdNode1 = node1.node || node1;`
   - **Status**: ✅ Passing

## Backend Issues Discovered ❌

### CRITICAL: Session Management (blocks ~10 tests)

**Error**: `[AUTH] ⚠️  Valid JWT token but no session found (userId: usr_test_e2e, accountId: acc_test_e2e)`

**Impact**: Tests with valid JWT tokens fail because no session exists in database
**Affected Tests**:

- nodes-crud-operations.spec.ts:133 - "should read single node by ID"
- nodes-crud-operations.spec.ts:321 - "should delete node successfully"
- All multi-tenant isolation tests (11 tests)

**Root Cause**: Test isolation creates users WITHOUT creating sessions in the `sessions` table

**Fix Required**:

```typescript
// In tests/e2e/fixtures/database-snapshots.ts or test setup
// After creating test user, also create session:
db.prepare(
  `
  INSERT INTO sessions (id, user_id, account_id, token, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`
).run(sessionId, userId, accountId, token, now, now + 86400000);
```

---

### HIGH: Missing PUT Route (blocks 1 test)

**Error**: `Route PUT /api/v1/nodes/:id not found`

**Impact**: Node UPDATE operations fail with 404
**Affected Tests**:

- nodes-crud-operations.spec.ts:254 - "should update node properties successfully"

**Fix Required**: Implement PUT /api/v1/nodes/:id in [apps/api/src/routes/nodes.ts](apps/api/src/routes/nodes.ts)

**Note**: User confirmed this route is ACTUALLY missing (not a test bug)

---

### MEDIUM: FTS Schema Error (intermittent)

**Error**: `no such column: T.content`

**Impact**: Data management clearKeimenon operations fail
**Location**: [apps/api/src/routes/data-management.ts:196](apps/api/src/routes/data-management.ts#L196)

**Root Cause**: FTS query references non-existent `T.content` column
**Fix Required**: Update FTS query to use correct column name (likely `properties` or remove column reference)

---

### MEDIUM: Password Validation Too Strict (blocks 8 tests)

**Error**: `Password contains common weak patterns and is not allowed`

**Impact**: Test password "SecurePass123!" rejected due to sequential "123" pattern
**Affected Tests**: All auth-registration-flow.spec.ts tests (8 tests)

**Location**: [apps/api/src/utils/password-validator.ts:170-176](apps/api/src/utils/password-validator.ts#L170-L176)

**Fix Options**:

1. Relax validation to allow sequential patterns in test environment
2. Update test passwords to avoid sequences (e.g., "SecurePass!@#")
3. Add `NODE_ENV=test` bypass for strict validation

---

### LOW: Invalid Auth Test Expectation (1 test)

**Test**: nodes-crud-operations.spec.ts:114 - "should reject node creation without authentication"
**Expected**: 401 Unauthorized
**Actual**: 404 Not Found

**Root Cause**: Unauthenticated request hits 404 before auth middleware runs
**Fix**: Test should accept both 401 AND 404 as valid responses

---

## Recommended Fix Priority

1. **CRITICAL**: Fix session management (unlocks 10+ tests)
2. **HIGH**: Implement PUT /api/v1/nodes/:id route (unlocks 1 test)
3. **MEDIUM**: Fix FTS schema error (prevents data management errors)
4. **MEDIUM**: Relax password validation or update test passwords (unlocks 8 tests)
5. **LOW**: Update auth test expectation (quick test fix)

## Estimated Impact

| Fix                 | Tests Unlocked | New Pass Rate   |
| ------------------- | -------------- | --------------- |
| Session management  | +10            | 133/165 (80.6%) |
| PUT route           | +1             | 134/165 (81.2%) |
| Password validation | +8             | 142/165 (86.1%) |
| Visual baselines    | +1             | 143/165 (86.7%) |

**Target**: 86%+ pass rate with backend fixes

## Files Modified This Session

- ✅ [tests/e2e/nodes-crud-operations.spec.ts](tests/e2e/nodes-crud-operations.spec.ts) - Fixed validation test
- ✅ [tests/e2e/boards-crud-operations.spec.ts](tests/e2e/boards-crud-operations.spec.ts) - Fixed delete test with defensive unwrapping

## Next Steps

1. Backend team: Implement session creation in test fixtures
2. Backend team: Add PUT /api/v1/nodes/:id route
3. Backend team: Fix FTS query in data-management.ts
4. Testing team: Update password validation config or test passwords
5. Continue E2E fixes once backend issues resolved

---

**Generated**: 2025-11-09 by Claude Code
**Session**: E2E Test Fixing - Part 3
