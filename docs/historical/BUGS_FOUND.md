# Bugs Discovered During Testing

**Test Date**: 2025-10-11
**Environment**: Windows, Node.js, Neo4j Aura

---

## Critical Bugs (Must Fix)

### Bug #1: Import Data Not Persisted to Neo4j

**Severity**: 🔴 CRITICAL
**Status**: Confirmed
**Impact**: Complete data loss after import

**Description**:
The enhanced import endpoint (`POST /api/v1/import/enhanced`) successfully parses chat data, extracts sources, code blocks, and finds duplicates, BUT does not save any data to Neo4j.

**Evidence**:

```bash
# Import succeeds with data
curl -X POST http://localhost:4001/api/v1/import/enhanced -F "files=@small.json"
# Response: 44 convos, 406 messages, 44 sources, 199 code blocks, 14 duplicates

# But database remains empty
curl http://localhost:4001/api/v1/content/stats
# Response: total_nodes: 0, message_nodes: 0, source_nodes: 0, code_block_nodes: 0
```

**Location**: `apps/api/src/routes/import-enhanced.ts:314-450` (save functions)

**Root Cause**: Unknown - save functions exist and are called, but either:

1. Sessions/transactions are not being committed
2. Errors are being silently caught
3. Neo4j client connection issue
4. Data format mismatch with schema

**Fix Needed**:

1. Add error logging to all save functions
2. Verify Neo4j session commits
3. Check for silent try/catch blocks
4. Add transaction error handling
5. Test with explicit session close and commit

**Workaround**: None - data is lost

---

### Bug #2: Node List Endpoint Parameter Type Error

**Severity**: 🟡 MEDIUM
**Status**: Confirmed
**Impact**: Cannot list nodes via API

**Description**:
The `GET /api/v1/nodes` endpoint fails with a parameter type error, preventing listing of nodes.

**Evidence**:

```bash
curl http://localhost:4001/api/v1/nodes
# Response: {"error":"Failed to list nodes","message":"Invalid input. '0.0' is not a valid value. Must be a non-negative integer."}

# Error log:
List nodes error: Neo4jError: Invalid input. '0.0' is not a valid value. Must be a non-negative integer.
[cause]: GQLError: 22N01: Expected the value 0.0 to be of type INTEGER, but was of type FLOAT.
```

**Location**: `apps/api/src/routes/nodes.ts:112` (query execution)

**Root Cause**: Query parameter (`skip` or `limit`) is being passed as a Float (0.0) instead of Integer (0)

**Code Issue**:

```typescript
// Likely issue:
const skip = parseFloat(req.query.skip) || 0.0; // ❌ Wrong
const limit = parseFloat(req.query.limit) || 10.0; // ❌ Wrong

// Should be:
const skip = parseInt(req.query.skip as string) || 0; // ✅ Correct
const limit = parseInt(req.query.limit as string) || 10; // ✅ Correct
```

**Fix Needed**:

1. Change `parseFloat` to `parseInt` for skip/limit parameters
2. Add explicit type validation
3. Add fallback to 0 for skip, 100 for limit

**Workaround**: Use explicit integer parameters: `?skip=0&limit=10`

---

## Documentation Issues (Not Bugs, But Inaccuracies)

### Issue #1: README Claims 30+ Endpoints But Documents Only ~15

**Severity**: 🟢 LOW (Documentation)
**Status**: Confirmed

**Actual Count**: 35 endpoints found
**Documented**: ~15 endpoints in README

**Missing from README**:

- `POST /api/v1/ingest/url`
- `GET /api/v1/ingest/status`
- `POST /api/v1/nodes/source`
- `POST /api/v1/nodes/group`
- `DELETE /api/v1/nodes/:id`
- `GET /api/v1/boards` (list all)
- `POST /api/v1/boards` (create)
- `PUT /api/v1/boards/:id` (update)
- `DELETE /api/v1/boards/:id` (delete)
- All 4 `/api/v1/edges/*` endpoints
- `POST /api/v1/import/chat/apply-decisions`
- `GET /api/v1/import/chat/decisions/status/:id`
- `GET /api/v1/import/stream/progress/:uploadId`
- `DELETE /api/v1/import/stream/cancel/:uploadId`
- All 5 `/api/v1/content/*` endpoints

**Fix Needed**: Update README.md API Endpoints section with complete list

---

### Issue #2: Test Data Files Have Empty Conversations

**Severity**: 🟡 MEDIUM (Testing)
**Status**: Confirmed

**Description**:
`ai_context/chat_data/test-samples/tiny.json` contains 5 conversations with empty `chat_messages` arrays, making it useless for testing.

**Evidence**:

```json
{
  "uuid": "e11fc0bc-eb83-4364-bb1e-b9c6c4fc2679",
  "name": "",
  "chat_messages": [] // ❌ Empty
}
```

**Impact**: Integration tests that rely on tiny.json get 0 results

**Fix Needed**: Regenerate tiny.json with actual message data

---

## Feature Gaps (Documentation Claims But Not Implemented)

### Gap #1: Storage Mode Selection Not Working

**Severity**: 🟡 MEDIUM
**Status**: Needs Testing

**Claim**: Documentation says system supports 3 storage modes:

- **Local** (SQLite only)
- **Canvas** (Neo4j only)
- **Hybrid** (both)

**Reality**: Currently reports "local-first" mode, but:

1. No SQLite data found in ~/.canvas-memory
2. Neo4j save functions exist but don't work
3. No clear way to switch storage modes
4. Hybrid mode not functional

**Needs Investigation**:

- How to enable SQLite storage
- How to switch between modes
- Whether migration scripts work

---

### Gap #2: Integration Test Stubs Never Implemented

**Severity**: 🟢 LOW
**Status**: Confirmed

**Tests Marked as Stubs**:

- Code Extractor test (`⊘ Skipped`)
- Similarity Engine test (`⊘ Skipped`)
- Neo4j Data Integrity test (`⊘ Skipped`)

**Actual Impact**: Code extractor and similarity engine DO work (proven by import results), they just lack tests

**Fix Needed**: Implement the 3 stubbed integration tests

---

## Summary

| Bug # | Severity    | Component          | Status    | Blocking               |
| ----- | ----------- | ------------------ | --------- | ---------------------- |
| #1    | 🔴 CRITICAL | Import Persistence | Confirmed | YES - Data Loss        |
| #2    | 🟡 MEDIUM   | Node List API      | Confirmed | NO - Workaround exists |

**Critical Path**: Bug #1 must be fixed before the system is usable. All imports currently lose data.

**Total Bugs Found**: 2
**Documentation Issues**: 2
**Feature Gaps**: 2

---

## Testing Recommendations

1. **Add logging** to all Neo4j save operations
2. **Add integration test** that verifies data persistence
3. **Fix test data** (tiny.json, small.json) to have real messages
4. **Document** actual storage mode switching
5. **Implement** the 3 stubbed integration tests

---

**Next Step**: Fix Bug #1 (import persistence) as highest priority
