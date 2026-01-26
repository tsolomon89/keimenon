# E2E Test Fixes Summary - November 4, 2025

## Problem Overview

**Initial Test Pass Rate**: 35% (130/369 tests passing)

**Primary Root Cause**: Account credential mismatch between test code and database fixtures

- Tests used: `client-alpha@test.com` / `SecurePass-2024-Alpha`
- Fixtures created: `client-alpha@fixture.test` / `Xk9mP2vQ#wL4zA!`
- Result: Login failures with "Failed to fetch" and subsequent test failures

**Secondary Issues**:

1. Tests attempting to register accounts that already exist as fixtures
2. 605 accumulated login attempts causing account lockouts
3. 305 stale worker databases
4. Transaction nesting errors in cleanup code

---

## Fixes Applied

### 1. Updated Account Credentials in All Test Files ✅

Updated **8 test files** to use correct fixture account credentials:

#### Files Modified:

1. `tests/e2e/multi-tenant-nodes-isolation.spec.ts`
2. `tests/e2e/multi-tenant-boards-isolation.spec.ts`
3. `tests/e2e/multi-tenant-edges-isolation.spec.ts`
4. `tests/e2e/multi-tenant-groups-isolation.spec.ts`
5. `tests/e2e/multi-tenant-jobs-isolation.spec.ts`
6. `tests/e2e/multi-tenant-users-isolation.spec.ts`
7. `tests/e2e/multi-tenant-accounts-isolation.spec.ts`
8. `tests/e2e/auth-account-switching.spec.ts`

#### Changes Applied:

**Before:**

```typescript
const ACCOUNT_A = {
  email: 'client-alpha@test.com',
  password: 'SecurePass-2024-Alpha',
};

const ACCOUNT_B = {
  email: 'client-beta@test.com',
  password: 'SecurePass_2024_Beta',
};
```

**After:**

```typescript
const ACCOUNT_A = {
  email: 'client-alpha@fixture.test',
  password: 'Xk9mP2vQ#wL4zA!',
};

const ACCOUNT_B = {
  email: 'client-beta@fixture.test',
  password: 'Rj7nD5tM$bS3yC@',
};
```

### 2. Removed Redundant Registration Calls ✅

Fixture accounts are pre-created in the database snapshot, so registration attempts were failing with UNIQUE constraint violations.

#### Files Modified:

1. `tests/e2e/multi-tenant-nodes-isolation.spec.ts`
2. `tests/e2e/multi-tenant-edges-isolation.spec.ts`
3. `tests/e2e/multi-tenant-groups-isolation.spec.ts`
4. `tests/e2e/multi-tenant-jobs-isolation.spec.ts`

#### Changes Applied:

**Before:**

```typescript
test.beforeEach(async ({ apiRequest }) => {
  // Register Account A (ignore if already exists)
  await apiRequest.post('/api/v1/auth/register', {
    data: {
      email: ACCOUNT_A.email,
      password: ACCOUNT_A.password,
      name: 'Test User Alpha',
      accountName: 'Test Account Alpha',
    },
  });

  // Login to Account A
  const responseA = await apiRequest.post('/api/v1/auth/login', {
    data: ACCOUNT_A,
  });
  // ...
});
```

**After:**

```typescript
test.beforeEach(async ({ apiRequest }) => {
  // Fixture accounts already exist - skip registration, just login
  // Login to Account A
  const responseA = await apiRequest.post('/api/v1/auth/login', {
    data: ACCOUNT_A,
  });
  // ...
});
```

### 3. Cleaned Test Environment ✅

Ran cleanup script to clear stale data:

```bash
npm run e2e:clean
```

**Results:**

- ✅ Cleared **605 login attempt records** (account lockouts)
- ✅ Deleted **305 worker databases** (stale test data)
- ✅ Removed snapshot template (recreated with correct fixture accounts)
- ✅ Killed ports 3000 and 4001

---

## Fixture Account Reference

The database snapshot template now contains these pre-created accounts:

### Account A (Alpha)

- **Email**: `client-alpha@fixture.test`
- **Password**: `Xk9mP2vQ#wL4zA!`
- **User ID**: `usr_fixture_alpha`
- **Account ID**: `acc_fixture_alpha`

### Account B (Beta)

- **Email**: `client-beta@fixture.test`
- **Password**: `Rj7nD5tM$bS3yC@`
- **User ID**: `usr_fixture_beta`
- **Account ID**: `acc_fixture_beta`

### Account C (Gamma)

- **Email**: `client-gamma@fixture.test`
- **Password**: `SecurePass2024Gamma`
- **User ID**: `usr_fixture_gamma`
- **Account ID**: `acc_fixture_gamma`

### Admin Account

- **Email**: `admin@admin.com`
- **Password**: `TestPass123!`

---

## Expected Outcomes

### Immediate Fixes

1. **Login Success**: All fixture account logins should now succeed
2. **No Registration Errors**: No more UNIQUE constraint violations
3. **Token Validity**: JWTs generated successfully for authenticated requests
4. **Node Creation**: Tests can create nodes, edges, groups, etc.

### Expected Pass Rate Improvement

- **Previous**: 35% (130/369 tests)
- **Expected**: 80%+ after fixes
- **Critical Tests**: Multi-tenant isolation tests should now pass

### Remaining Known Issues

The following issues may still exist and require separate investigation:

1. **Form Validation Messages**: Some tests expect specific validation text that may not match UI
   - Example: Tests look for `/invalid email|valid email address/i`
   - May need to update test expectations to match actual UI text

2. **Transaction Nesting**: Some cleanup operations show "cannot start a transaction within a transaction"
   - This may affect test cleanup but shouldn't affect test execution
   - Requires refactoring of cleanup code to avoid nested transactions

3. **localStorage Access**: Some UI tests show "Access is denied for this document"
   - Related to browser security when accessing file:// URLs
   - May need to adjust test setup or page navigation

---

## Next Steps

### 1. Run Full Test Suite

```bash
npm run e2e:clean  # Clean environment first
npm run e2e:dev    # Run all tests
```

### 2. Validate Results

- Check test output for pass/fail counts
- Identify any remaining failures
- Categorize failures by type (auth, validation, timing, etc.)

### 3. Address Remaining Failures

Based on validation results, address:

- Form validation message mismatches
- Transaction nesting in cleanup code
- localStorage access issues in UI tests
- Any timing/race condition issues

### 4. Update Documentation

- Update `tests/e2e/README.md` with fixture account credentials
- Document any test patterns or best practices discovered
- Add troubleshooting guide for common test failures

---

## Files Changed

### Test Files Updated (8 files)

- `tests/e2e/multi-tenant-nodes-isolation.spec.ts`
- `tests/e2e/multi-tenant-boards-isolation.spec.ts`
- `tests/e2e/multi-tenant-edges-isolation.spec.ts`
- `tests/e2e/multi-tenant-groups-isolation.spec.ts`
- `tests/e2e/multi-tenant-jobs-isolation.spec.ts`
- `tests/e2e/multi-tenant-users-isolation.spec.ts`
- `tests/e2e/multi-tenant-accounts-isolation.spec.ts`
- `tests/e2e/auth-account-switching.spec.ts`

### Documentation Created

- `E2E_TEST_FIXES_SUMMARY.md` (this file)

---

## Key Learnings

1. **Fixture vs Test Accounts**: When using database snapshots with pre-created accounts, tests should LOGIN not REGISTER
2. **Account Lockouts**: Failed login attempts accumulate - regular cleanup is essential
3. **Credential Consistency**: Test code must exactly match database fixture credentials
4. **Special Characters**: Passwords with special characters (`#`, `!`, `@`, `$`) require exact matching

---

## Commands Reference

### Cleanup

```bash
npm run e2e:clean
```

### Run Tests

```bash
npm run e2e:dev                  # All tests with dev servers
npm run e2e -- <test-file>       # Specific test file
npm run e2e -- --grep "@smoke"   # Smoke tests only
```

### Debug

```bash
npx playwright test --debug <test-file>      # Debug mode
npx playwright show-report                   # View last report
```

---

**Status**: Fixes applied, ready for test validation
**Date**: November 4, 2025
**Pass Rate Goal**: 80%+
