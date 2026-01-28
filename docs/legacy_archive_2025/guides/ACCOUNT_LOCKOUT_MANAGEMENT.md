# Account Lockout Management

## Overview

The Keimenon API implements account lockout protection to prevent brute-force attacks. After 5 failed login attempts within 15 minutes, an account is locked for 30 minutes.

**IMPORTANT**: Lockout is **automatically disabled** during E2E testing (`NODE_ENV=test`) to prevent false positives from parallel test execution.

## Quick Reference

```bash
# Clear ALL lockouts (development/production database)
npm run unlock:all

# Unlock specific email
npm run unlock user@example.com

# View lockout settings
# apps/api/src/utils/account-lockout.ts:16-20
```

## When Lockouts Happen

### Production/Development

- 5+ failed login attempts in 15 minutes
- Wrong password, wrong email format, etc.
- Multiple devices trying same account

### Testing (Should NEVER Happen)

- ✅ **Prevented**: `NODE_ENV=test` bypass at [account-lockout.ts:40-47](../../apps/api/src/utils/account-lockout.ts#L40-L47)
- ✅ **Prevented**: Test databases use `.test-dbs/` path with isolated data
- ⚠️ **Can happen**: If you run production server (`npm run dev`) while testing

## Clearing Lockouts

### Option 1: Clear All Lockouts

```bash
npm run unlock:all
```

**Output**:

```
🔓 Clearing Account Lockouts...
📂 Database: C:\Users\YourName\.keimenon\keimenon.db
📊 Found 10 failed login attempts
✅ Cleared 10 failed login attempts
✅ All accounts unlocked!
```

### Option 2: Unlock Specific Account

```bash
npm run unlock user@example.com
```

**Output**:

```
🔓 Unlocking account: user@example.com
📂 Database: C:\Users\YourName\.keimenon\keimenon.db
📊 Found 3 failed attempts for user@example.com
✅ Unlocked user@example.com (cleared 3 attempts)
```

### Option 3: Manual SQL (Advanced)

```bash
# SQLite CLI
sqlite3 ~/.keimenon/keimenon.db

# Clear all lockouts
DELETE FROM login_attempts WHERE success = 0;

# Clear specific email
DELETE FROM login_attempts WHERE email = 'user@example.com' AND success = 0;
```

## Preventing Lockouts in Testing

### ✅ Automatic Prevention (Already Implemented)

The fix at [apps/api/src/utils/account-lockout.ts:40-47](../../apps/api/src/utils/account-lockout.ts#L40-L47) **completely bypasses lockout** when `NODE_ENV=test`:

```typescript
if (process.env.NODE_ENV === 'test') {
  console.log('[Account Lockout] Test environment detected, bypassing lockout for:', email);
  return {
    isLocked: false,
    remainingAttempts: 999999,
    totalAttempts: 0,
  };
}
```

### Running Tests Correctly

**CORRECT** (lockout disabled):

```bash
# E2E tests (uses NODE_ENV=test automatically)
npm run e2e
npm run e2e:dev

# API in test mode
cd apps/api && npm run dev:test
```

**INCORRECT** (lockout enabled - will fail!):

```bash
# ❌ Production server while testing
npm run dev && npx playwright test  # Wrong!

# ❌ Manual server without NODE_ENV
cd apps/api && npm run dev  # Not test mode!
```

### Test Database Isolation

Tests use **per-worker databases** to prevent cross-contamination:

```
.test-dbs/
├── snapshot-template.db    # Pristine snapshot (4 accounts, 4 users, zero data)
├── worker-0.db            # Worker 0 gets copy of snapshot
├── worker-1.db            # Worker 1 gets copy of snapshot
└── worker-2.db            # Worker 2 gets copy of snapshot
```

Each worker:

1. Restores from snapshot (clean state)
2. Runs tests with isolation
3. Cleaned up automatically

## Configuration

Default settings in [account-lockout.ts:16-20](../../apps/api/src/utils/account-lockout.ts#L16-L20):

```typescript
const DEFAULT_CONFIG: LoginAttemptConfig = {
  maxAttempts: 5, // Attempts before lockout
  lockoutDurationMs: 30 * 60 * 1000, // 30 minutes
  attemptWindowMs: 15 * 60 * 1000, // Count window (15 min)
};
```

### Adjusting for Development

If you need to adjust for local development (not recommended for production):

```typescript
// In apps/api/src/routes/auth.ts (login endpoint)
const lockoutStatus = checkAccountLockout(db, email, req.ip || 'unknown', {
  maxAttempts: 10, // More lenient
  lockoutDurationMs: 5 * 60 * 1000, // 5 min
  attemptWindowMs: 15 * 60 * 1000,
});
```

## Troubleshooting

### Issue: Tests fail with "Account is locked"

**Cause**: API server not running in test mode

**Fix**:

```bash
# Kill all servers
npm run kill-ports

# Start in test mode
cd apps/api && npm run dev:test  # Terminal 1
cd apps/web && npm run dev        # Terminal 2
npx playwright test               # Terminal 3
```

### Issue: Production login fails

**Cause**: Too many failed login attempts

**Fix**:

```bash
# Option 1: Wait 30 minutes
# Option 2: Clear lockout
npm run unlock user@example.com
```

### Issue: Lockout happens during local development

**Causes**:

- Typo in test password
- Wrong test account email
- Shared database between dev and test

**Fix**:

```bash
# Clear lockout
npm run unlock:all

# Use separate databases
export DB_PATH=~/.keimenon/dev.db      # Development
export TEST_DB_PATH=.test-dbs/snapshot-template.db  # Testing
```

## Best Practices

### Development

1. **Use test mode** for E2E tests: `npm run e2e:dev`
2. **Clear lockouts** if you get locked out: `npm run unlock:all`
3. **Don't share databases** between dev and test

### Testing

1. **Always verify NODE_ENV=test** in API logs
2. **Use fixture accounts** for test data (auto-created)
3. **Don't use real emails** in tests

### Production

1. **Monitor lockout events** in audit logs
2. **Set up alerts** for high lockout rates
3. **Educate users** about password policies

## API Reference

### Check Lockout Status

```typescript
import { checkAccountLockout } from './utils/account-lockout';

const status = checkAccountLockout(db, email, ipAddress);

if (status.isLocked) {
  const minutes = Math.ceil((status.lockoutExpiresAt - Date.now()) / 1000 / 60);
  return res.status(403).json({
    error: `Account locked. Try again in ${minutes} minutes.`,
  });
}
```

### Record Login Attempt

```typescript
import { recordLoginAttempt } from './utils/account-lockout';

// Record success
recordLoginAttempt(db, email, ipAddress, true);

// Record failure
recordLoginAttempt(db, email, ipAddress, false, userAgent, 'Invalid password');
```

### Unlock Account (Admin)

```typescript
import { unlockAccount } from './utils/account-lockout';

// Clear all failed attempts for user
unlockAccount(db, email);
```

## Related Documentation

- [E2E Test Documentation](../testing/E2E_TESTS.md)
- [Authentication Flow](../architecture/AUTHENTICATION.md)
- [Security Best Practices](../architecture/SECURITY.md)
- [Test Isolation](../testing/TEST_ISOLATION.md)

## Files Modified

- ✅ [apps/api/src/utils/account-lockout.ts:40-47](../../apps/api/src/utils/account-lockout.ts#L40-L47) - Test bypass
- ✅ [scripts/clear-lockouts.js](../../scripts/clear-lockouts.js) - Clear all lockouts
- ✅ [scripts/unlock-account.js](../../scripts/unlock-account.js) - Unlock specific account
- ✅ [package.json](../../package.json) - Added `unlock` and `unlock:all` scripts
