# E2E Test Run - Issues Log

**Date**: 2025-10-31
**Session**: Initial Test Run After Generation

## Issue Summary

| #   | Issue                                   | Severity | Status           | Root Cause                                     | Solution                                                                        |
| --- | --------------------------------------- | -------- | ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | API Server Failed to Start              | HIGH     | ✅ RESOLVED      | Missing node_modules in apps/api               | Ran `npm install` in apps/api and apps/web                                      |
| 2   | Health Endpoint 404                     | LOW      | ✅ NOTED         | `/api/v1/health` doesn't exist                 | Not critical - API is running, changed setup script to use `/api/v1/auth/login` |
| 3   | Setup Script Health Check Failing       | MEDIUM   | ✅ RESOLVED      | Wrong endpoint check                           | Modified to test `/api/v1/auth/login` instead                                   |
| 4   | Password Requirements Not Met           | HIGH     | ✅ RESOLVED      | Password "123456" too weak                     | Updated to "TestPassword123!"                                                   |
| 5   | Password Still Too Weak                 | HIGH     | ✅ RESOLVED      | "TestPassword123!" detected as common pattern  | Updated to random strong passwords                                              |
| 6   | Login Endpoint Returning HTML           | HIGH     | 🔍 INVESTIGATING | Initially thought redirect, actually...        | See Issue #7                                                                    |
| 7   | JSON Parsing Error - Special Characters | CRITICAL | 🔧 IN PROGRESS   | Password contains `#` causing JSON parse error | Need to use passwords without special chars OR properly escape                  |

---

## Detailed Issue Reports

### Issue #1: API Server Failed to Start

**Error**: "API failed to become ready"
**Root Cause**: `apps/api/node_modules not found`
**Impact**: Cannot run any tests
**Solution**:

```bash
cd apps/api && npm install
cd apps/web && npm install
```

**Status**: ✅ Resolved
**Lesson**: Always ensure dependencies are installed before running dev:clean

---

### Issue #2: Health Endpoint 404

**Error**: `GET /api/v1/health` returns 404
**Root Cause**: Health endpoint doesn't exist in API routes
**Impact**: Setup script health check fails
**Solution**: API is actually running - use different endpoint for health check
**Status**: ✅ Noted - Not critical
**Recommendation**: Add `/api/v1/health` endpoint for better monitoring

---

### Issue #3: Setup Script Health Check Failing

**Error**: Setup script says "API server is not accessible"
**Root Cause**: Health check using non-existent endpoint
**Impact**: Cannot create test accounts
**Solution**: Changed health check to test `/api/v1/auth/login` endpoint instead
**Code Change**:

```typescript
// Before:
const healthCheck = await context.get('/api/v1/health');

// After:
const testCheck = await context.post('/api/v1/auth/login', {
  data: { email: 'nonexistent@test.com', password: 'test' },
});
```

**Status**: ✅ Resolved

---

### Issue #4: Password Requirements Not Met (First Attempt)

**Error**: "Password does not meet requirements: Password must be at least 12 characters long..."
**Password Used**: `123456`
**Root Cause**: Password validator has strict requirements
**Requirements**:

- At least 12 characters long
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (likely)

**Impact**: Cannot create test accounts
**Solution**: Updated to `TestPassword123!`
**Status**: ✅ Resolved (but led to Issue #5)

---

### Issue #5: Password Still Too Weak (Second Attempt)

**Error**: "Password contains common weak patterns and is not allowed"
**Password Used**: `TestPassword123!`
**Root Cause**: Password validator detects common patterns like "Test", "Password"
**Impact**: Still cannot create test accounts
**Solution**: Used random strong passwords:

- Account A: `Xk9mP2vQ#wL4zA!`
- Account B: `Rj7nD5tM$bS3yC@`

**Status**: ✅ Resolved (accounts created successfully!)
**Lesson**: Password validator is very strict - avoid dictionary words entirely

---

### Issue #6: Login Endpoint Returning HTML (Initial Diagnosis)

**Error**: `SyntaxError: Unexpected token '<', "<!DOCTYPE "...`
**Initial Diagnosis**: Login endpoint redirecting to web page
**Root Cause**: Actually Issue #7 - JSON parsing error
**Status**: ⚠️ Superseded by Issue #7

---

### Issue #7: JSON Parsing Error - Special Characters 🔥 CURRENT

**Error**:

```
SyntaxError: Bad escaped character in JSON at position 56
  at JSON.parse (<anonymous>)
  at parse (body-parser/lib/types/json.js:92:19)
```

**Root Cause**: Password `Xk9mP2vQ#wL4zA!` contains special characters (`#`, `!`) that cause JSON parsing issues when sent via Playwright request API

**Evidence**:

```bash
curl -X POST http://localhost:4001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client-a@test.com","password":"Xk9mP2vQ#wL4zA!"}'
# Returns: Bad escaped character in JSON at position 56
```

**Impact**:

- All multi-tenant isolation tests fail in beforeEach
- Cannot login to create test data
- 9/9 tests failing

**Analysis**:

- Position 56 in JSON string aligns with password field
- `#` character at position 8 of password might be interpreted as escape sequence
- Body-parser middleware failing to parse request body

**Possible Solutions**:

**Option A: Change Passwords (RECOMMENDED)**

- Use passwords without special JSON-problematic characters
- Still meet security requirements
- Examples: `SecurePass2024Alpha`, `StrongKey9876Beta`

**Option B: Fix Test Code**

- Ensure Playwright properly encodes JSON
- Might already be doing this - issue could be server-side

**Option C: Fix Server**

- Check body-parser configuration
- Ensure it properly handles special characters

**Decision**: Going with Option A - simpler and tests shouldn't rely on specific password characters

**Status**: 🔧 IN PROGRESS

---

## Actions Taken

1. ✅ Installed dependencies in apps/api and apps/web
2. ✅ Started dev environment with `npm run dev:clean`
3. ✅ Fixed setup script health check
4. ✅ Updated test account passwords (multiple iterations)
5. ✅ Created test accounts successfully
6. ✅ Updated all test files with correct passwords
7. 🔧 Currently fixing JSON parsing issue

---

## Next Steps

1. **IMMEDIATE**: Change passwords to avoid special characters
   - Update setup script
   - Update all test files
   - Re-create test accounts

2. **SHORT TERM**: Run tests again
   - Multi-tenant isolation tests
   - Auth flow tests
   - CRUD tests

3. **MEDIUM TERM**: Consider improvements
   - Add `/api/v1/health` endpoint
   - Document password requirements clearly
   - Add test account management script

4. **LONG TERM**: Code improvements
   - Investigate body-parser JSON parsing
   - Add better error messages for password validation
   - Consider test-friendly password generator

---

## Lessons Learned

1. **Dependencies First**: Always check and install dependencies before running servers
2. **Password Validators Are Strict**: Test passwords need to be truly random, not just "strong-looking"
3. **Special Characters in Tests**: Avoid JSON-problematic characters in test data
4. **Health Checks Matter**: Always have a reliable health check endpoint
5. **Iterative Debugging**: Issues often reveal deeper issues (password strength → JSON parsing)

---

## Test Environment Status

### Servers

- ✅ API Server: Running on http://localhost:4001
- ✅ Web Server: Running on http://localhost:3000
- ✅ Database: SQLite initialized at `~/.canvas-memory/canvas.db`

### Test Accounts

- ✅ admin@admin.com (exists, working)
- ✅ client-a@test.com (created, password issue)
- ✅ client-b@test.com (created, password issue)

### Test Files Status

- 📝 7 test files generated
- 🔧 Passwords need fixing
- ⏳ 0 tests passing (due to password issue)

---

## Quirks & Hiccups Noted

1. **Dev Script Warning**: Deprecation warning about passing args to child process with shell option
   - Not blocking, but should be addressed in dev script

2. **Node Modules Check**: Dev script checks for node_modules but proceeds anyway
   - Could add automatic npm install if missing

3. **Port Killing**: Dev script successfully kills conflicting processes
   - Works well on Windows

4. **Multiple Sed Failures**: Windows sed doesn't support all Unix sed features
   - Need to use different approach for bulk file updates on Windows

5. **Account ID Not Showing**: Setup script shows "Account ID: N/A"
   - Auth response might not include account_id field
   - Not blocking, but would be useful for debugging

---

**Last Updated**: 2025-10-31 14:50:00
**Next Update**: After fixing password issue
