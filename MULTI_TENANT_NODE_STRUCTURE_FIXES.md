# Multi-Tenant Node Structure Fixes - Session Summary

**Date**: 2025-11-07
**Session Focus**: Fix multi-tenant isolation test failures caused by inconsistent node response structures
**Test Results**: Improved from 0/9 to 3/9 passing (33% → still in progress)

---

## Executive Summary

This session addressed critical bugs in the multi-tenant isolation test suite, specifically targeting the node response structure inconsistency between single-node (`getNode()`) and list endpoint responses. The core issue was that `getNode()` was spreading properties flat while the list endpoint returned them nested, causing `properties.title` to be undefined in tests.

### Key Achievements

- ✅ Fixed node response structure consistency in `client.ts`
- ✅ Updated test assertions to match correct API response format
- ✅ Identified secondary bug in data-management cleanup (`T.content` column issue)
- ✅ Improved test pass rate from 0/9 to 3/9 (Tests 1, 4, 6 now passing)

### Remaining Work

- ❌ Investigate why `properties` field is still undefined in some responses
- ❌ Fix data-management.ts line 187 (`no such column: T.content`)
- ❌ Debug UI timeout issues (Tests 5, 8)
- ❌ Fix admin login failure (Test 9)

---

## 1. Root Cause Analysis

### Problem: Inconsistent Node Structure

**Symptom**: Tests failing with `TypeError: Cannot read properties of undefined (reading 'title')`

**Root Cause**: Mismatch between `getNode()` and list endpoint response structures:

```typescript
// List Endpoint (correct): Returns nested properties
{
  id: "...",
  kind: "Source",
  properties: {
    title: "Account A Confidential Source",
    content: "..."
  }
}

// getNode() (before fix): Spread properties flat
{
  id: "...",
  kind: "Source",
  title: "Account A Confidential Source",  // No properties wrapper!
  content: "..."
}
```

**Impact**: Tests expecting `node.properties.title` got undefined because properties were spread at top level.

---

## 2. Fixes Applied

### Fix 1: Database Client - Consistent Node Structure

**File**: `packages/db/src/sqlite/client.ts`
**Lines**: 713-730
**Status**: ✅ Applied

**Before**:

```typescript
// Spread properties flat (WRONG)
const properties = JSON.parse(row.properties);
return {
  ...properties, // title, content spread at top level
  id: row.id,
  kind: row.kind,
  account_id: row.account_id,
  // ...
} as AnyNode;
```

**After**:

```typescript
// Nest properties consistently (CORRECT)
const parsedNode = JSON.parse(row.properties);
const nestedProperties = parsedNode.properties || {};

return {
  id: row.id,
  kind: row.kind,
  account_id: row.account_id,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
  data_tag: row.data_tag,
  properties: nestedProperties, // Nested like list endpoint
} as AnyNode;
```

**Rationale**:

- The `properties` column in SQLite stores the **entire node** as JSON (see `createNode()` line 587)
- This JSON includes a nested `properties` field
- Must extract nested properties and return consistent structure

---

### Fix 2: Test Assertions - Correct Property Access

**File**: `tests/e2e/multi-tenant-nodes-isolation.spec.ts`
**Lines**: 183-184
**Status**: ✅ Applied

**Before**:

```typescript
const node = await verifyResponse.json();
expect(node.title).toBe('Account A Confidential Source'); // WRONG
```

**After**:

```typescript
const { node } = await verifyResponse.json();
expect(node.properties.title).toBe('Account A Confidential Source'); // CORRECT
```

**Rationale**: API returns `{ node: {...} }` (wrapped), and node has nested `properties` field.

---

### Fix 3: Security - NULL Account ID Checks (Previous Session)

**Files**: `apps/api/src/routes/nodes.ts`
**Lines**: GET endpoint (106-117), DELETE endpoint (416-428)
**Status**: ✅ Applied (carried over from previous session)

**Added NULL checks**:

```typescript
// CRITICAL SECURITY: Check for NULL account_id
if (nodeAccountId === null || nodeAccountId === undefined) {
  console.error('[SECURITY] Node missing account_id:', {
    nodeId: id,
    nodeAccountId,
    requestingUser: req.user.email,
  });
  return res.status(500).json({
    error: 'Data integrity error',
    message: 'Node has no account owner',
  });
}

// Client accounts can only access their own data
if (nodeAccountId !== req.user.accountId) {
  return res.status(403).json({ error: 'Access denied' });
}
```

**Rationale**: Prevents cross-account access vulnerability when `account_id` is NULL.

---

## 3. Test Results

### Before Fixes

- **Pass Rate**: 0/9 (0%)
- **Main Error**: `TypeError: Cannot read properties of undefined (reading 'title')`
- **Secondary Error**: Savepoint 404 errors (fixed in previous session)

### After Fixes

- **Pass Rate**: 3/9 (33%)
- **Passing Tests**:
  - ✅ Test 1: Prevent Account B from reading Account A node via API
  - ✅ Test 4: Filter nodes by account_id correctly
  - ✅ Test 6: Prevent Account B from accessing Account A node via direct URL

- **Failing Tests**:
  - ❌ Test 2: `TypeError: Cannot read properties of undefined (reading 'title')` at line 184
  - ❌ Test 3: `TypeError: Cannot read properties of undefined (reading 'title')` at line 210
  - ❌ Test 5: `Test timeout of 30000ms exceeded` (UI test)
  - ❌ Test 7: `expect(nodes.length).toBe(1)` received 0 (empty node list)
  - ❌ Test 8: `Test timeout of 30000ms exceeded` (UI test)
  - ❌ Test 9: `expect(response.ok()).toBeTruthy()` - Admin login failure

---

## 4. Discovered Issues

### Issue 1: Properties Still Undefined in Some Cases

**Symptom**: Tests 2 and 3 still fail with `node.properties.title` undefined
**Hypothesis**:

- Server caching may not have picked up `client.ts` changes
- Or `parsedNode.properties` doesn't exist in stored JSON
- Need to add debug logging to verify what's in `parsedNode`

**Next Steps**:

1. Add console.log in `client.ts getNode()` to inspect `parsedNode` structure
2. Check if server restart is needed (TypeScript compilation lag)
3. Verify what's actually stored in `properties` column in database

---

### Issue 2: Data Management Cleanup Bug

**File**: `apps/api/src/routes/data-management.ts`
**Line**: 187
**Error**: `"no such column: T.content"`
**Frequency**: Every test cleanup (afterEach)

**Impact**:

- Test cleanup fails silently
- Doesn't directly cause test failures (savepoints handle rollback)
- But indicates query bug in clearCanvas operation

**Root Cause**: SQL query references non-existent column `T.content`

**Next Steps**:

1. Inspect data-management.ts line 187
2. Find query with `T.content` reference
3. Replace with correct column name from schema

---

### Issue 3: UI Test Timeouts

**Tests Affected**: 5, 8
**Error**: `page.waitForLoadState('networkidle')` timeout after 30s

**Hypothesis**:

- Network requests hanging
- Canvas page not loading properly
- Or savepoint/test data not visible in UI

**Next Steps**:

1. Check if canvas page has infinite loading
2. Verify nodes are actually created in database before UI navigation
3. Consider increasing timeout or using different wait strategy

---

### Issue 4: Admin Login Failure

**Test Affected**: 9
**Error**: `expect(response.ok()).toBeTruthy()` - Login returns non-200 status

**Hypothesis**:

- Admin credentials incorrect
- Admin account setup issue in fixtures
- Or admin login route has different validation

**Next Steps**:

1. Check admin account creation in `global-setup.ts`
2. Verify admin credentials match what test uses
3. Add debug logging to see actual login error response

---

## 5. Files Modified

### Core Database Logic

- ✅ `packages/db/src/sqlite/client.ts` (lines 713-730) - Fixed getNode() structure

### Test Files

- ✅ `tests/e2e/multi-tenant-nodes-isolation.spec.ts` (line 184) - Fixed assertion

### API Routes (Previous Session)

- ✅ `apps/api/src/routes/nodes.ts` (lines 106-117, 416-428) - Added NULL checks

---

## 6. Architecture Insights

### How Node Storage Works

1. **createNode()** (client.ts line 587):

   ```typescript
   JSON.stringify(node); // Entire node object stored in properties column
   ```

2. **Database Structure**:

   ```sql
   CREATE TABLE nodes (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     properties TEXT NOT NULL,  -- JSON blob containing entire node
     account_id TEXT,
     created_by TEXT,
     -- ...
   );
   ```

3. **Properties Column Contains**:

   ```json
   {
     "id": "...",
     "kind": "Source",
     "fingerprint": "...",
     "properties": {
       "title": "...",
       "content": "..."
     },
     "created_at": 1234567890
     // ... (entire node)
   }
   ```

4. **getNode() Must**:
   - Parse JSON from `properties` column
   - Extract nested `properties` field
   - Return structure consistent with list endpoint

---

## 7. Next Session Priorities

### High Priority (Blocking Test Progress)

1. **Debug properties undefined issue**
   - Add logging to `client.ts getNode()`
   - Verify server picked up TypeScript changes
   - Check actual database contents

2. **Fix data-management cleanup bug**
   - Find `T.content` reference
   - Replace with correct column

### Medium Priority (Unblock 6 More Tests)

3. **Fix UI timeout issues**
   - Investigate canvas page loading
   - Verify test data visibility

4. **Fix admin login**
   - Verify admin account setup
   - Check credentials

### Low Priority (Future Work)

5. **Review other routes for NULL checks**
   - edges.ts
   - boards.ts
   - groups.ts

6. **Add database constraint**
   - `ALTER TABLE nodes ADD CONSTRAINT account_id_not_null`

---

## 8. Commands for Next Session

### Debug getNode() Issue

```bash
# Add logging and restart API
npm run dev:api

# Run single test with debug output
npx playwright test tests/e2e/multi-tenant-nodes-isolation.spec.ts:164 --project=chromium
```

### Check Database Contents

```bash
# Inspect what's actually stored
sqlite3 .test-dbs/worker-0.db "SELECT id, properties FROM nodes LIMIT 1;"
```

### Fix Data Management Bug

```bash
# Find the problematic query
grep -n "T.content" apps/api/src/routes/data-management.ts
```

---

## 9. Lessons Learned

### 1. Response Structure Consistency is Critical

When modifying data access layers, **all endpoints must return consistent structures**. Mixing flat vs nested properties breaks client code.

### 2. Database Schema Drives Implementation

The fact that `properties` column stores the **entire node** JSON (not just properties) was crucial to understanding the bug. Always check schema first.

### 3. Test Timeouts Indicate Deeper Issues

16-minute test runs suggest infrastructure problems (slow server starts, Next.js webpack builds). Consider:

- Pre-building Next.js before tests
- Using faster test database (in-memory SQLite)
- Parallel test execution with proper isolation

### 4. Incremental Debugging Pays Off

Fixed 3/9 tests by addressing one issue at a time. Remaining failures likely have different root causes requiring separate investigation.

---

## 10. Commit Message

```
fix(db): standardize node response structure across endpoints

PROBLEM:
- getNode() spread properties flat: { id, kind, title, content, ... }
- List endpoint returned nested: { id, kind, properties: { title, content } }
- Tests failed with "Cannot read properties of undefined (reading 'title')"

SOLUTION:
- Modified client.ts getNode() to return nested properties structure
- Updated test assertions to access node.properties.title
- Ensures consistency with list endpoint response format

IMPACT:
- Multi-tenant isolation tests: 3/9 now passing (was 0/9)
- Remaining failures need further investigation (see MULTI_TENANT_NODE_STRUCTURE_FIXES.md)

FILES CHANGED:
- packages/db/src/sqlite/client.ts (lines 713-730): Nest properties in getNode()
- tests/e2e/multi-tenant-nodes-isolation.spec.ts (line 184): Fix assertion

REMAINING ISSUES:
- Some responses still have undefined properties (needs debug logging)
- Data-management cleanup bug: "no such column: T.content"
- UI tests timing out (Tests 5, 8)
- Admin login failing (Test 9)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 11. References

- **Test File**: `tests/e2e/multi-tenant-nodes-isolation.spec.ts`
- **Database Client**: `packages/db/src/sqlite/client.ts`
- **Node Routes**: `apps/api/src/routes/nodes.ts`
- **Schema**: `packages/db/src/sqlite/schema.sql`
- **Previous Session Docs**: `MULTI_TENANT_SECURITY_FIXES.md`

---

**Session End**: 2025-11-07
**Next Session**: Continue with priorities listed in Section 7
