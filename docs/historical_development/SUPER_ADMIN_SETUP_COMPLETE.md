# Super Admin Account Setup - Complete

**Date:** October 20, 2025
**Status:** ✅ Complete
**Purpose:** Debugging and development super admin account

---

## What Was Implemented

### 1. Super Admin Creation Script

**File:** [`scripts/create-super-admin.ts`](scripts/create-super-admin.ts)

A TypeScript script that creates a super admin account with the following:

- **Account:** `admin` (ID: `admin`)
  - Type: `admin`
  - Class: `business` (full features)
  - Name: "Super Admin Account (DEBUG ONLY)"

- **User:** `admin@admin.com`
  - Password: `123456` (accepts ANY password via bypass)
  - Permission level: `admin`
  - User class: `person`

- **Membership:** Links user to admin account
  - Role rank: 4 (admin)
  - Status: `active`

- **Graph Nodes:** (if migrations 014/015 have run)
  - `AccountNode` for admin account
  - `UserNode` for admin user
  - `OWNER_OF` edge linking them

**Run the script:**

```bash
npx tsx scripts/create-super-admin.ts
```

### 2. Authentication Bypass

**File:** [`apps/api/src/services/auth.service.ts:174-179`](apps/api/src/services/auth.service.ts#L174-L179)

Added special case in `login()` method:

```typescript
// TODO: REMOVE BEFORE PRODUCTION - Super admin bypass for debugging
// FIXME: This bypasses password verification for admin@admin.com
// This is a temporary debugging feature and MUST be removed before deployment
// See: scripts/create-super-admin.ts for account creation
// NOTE: The entire super admin account should be deleted in production
const isAdmin = email === 'admin@admin.com';

if (!isAdmin) {
  // Regular user - verify password hash
  if (!userRow.password_hash) {
    throw new Error('Invalid email or password');
  }

  const isValidPassword = await bcrypt.compare(password, userRow.password_hash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }
}
```

**Key Points:**

- `admin@admin.com` accepts **ANY** password
- Password verification is completely bypassed
- Multiple TODO/FIXME/NOTE comments mark this as temporary

### 3. Build Configuration Fixes

**Files Updated:**

- [`packages/types/tsconfig.json`](packages/types/tsconfig.json)
- [`packages/db/tsconfig.json`](packages/db/tsconfig.json)

**Changes:**

- Excluded test files from TypeScript compilation (`**/*.test.ts`, `**/__tests__`)
- Excluded migration files using `import.meta` (ES module feature)

---

## Credentials

⚠️ **FOR DEBUGGING ONLY** ⚠️

```
Email:    admin@admin.com
Password: 123456 (or ANY password - bypass enabled)
```

---

## Security Warnings

### 🚨 CRITICAL - Remove Before Production

This implementation is **intentionally insecure** for debugging purposes:

1. **Password Bypass:** Any password works for `admin@admin.com`
2. **Hardcoded Credentials:** Email and weak password are hardcoded
3. **No MFA:** No multi-factor authentication
4. **No Password Requirements:** No complexity, length, or expiry requirements
5. **No Audit Logging:** Super admin actions not specially logged

### ⚠️ TODO Checklist

Before production deployment:

- [ ] Delete the super admin account from database
- [ ] Remove `scripts/create-super-admin.ts`
- [ ] Remove password bypass from `auth.service.ts:174-179`
- [ ] Implement proper admin onboarding flow
- [ ] Add password requirements (min 12 chars, complexity, etc.)
- [ ] Implement MFA for admin accounts
- [ ] Add admin action audit logging
- [ ] Create secure initial admin setup wizard

---

## How It Works

### M:N Architecture Support

The super admin account is fully compatible with the new M:N (many-to-many) user-account architecture:

1. **Account Creation:** Creates `admin` account in `accounts` table
2. **User Creation:** Creates user in `users` table with `deprecated_account_id` and `primary_account_id`
3. **Membership Creation:** Creates entry in `user_accounts` junction table
4. **Graph Integration:** Creates AccountNode, UserNode, and OWNER_OF edge

### Login Flow

1. User submits login with `admin@admin.com` and any password
2. Auth service checks if email === 'admin@admin.com'
3. If yes, bypass password verification (INSECURE!)
4. Return full JWT token with admin permissions
5. User can access all features with admin rights

### Account Structure

```
accounts table:
  id: "admin"
  account_type: "admin"
  account_class: "business"
  email: "admin@admin.com"
  name: "Super Admin Account (DEBUG ONLY)"

users table:
  id: "user_admin_<timestamp>"
  deprecated_account_id: "admin"
  primary_account_id: "admin"
  email: "admin@admin.com"
  password_hash: <bcrypt hash of "123456">
  permission_level: "admin"
  user_class: "person"

user_accounts table:
  id: "ua_admin_<timestamp>"
  user_id: "user_admin_<timestamp>"
  account_id: "admin"
  permission_level: "admin"
  role_rank: 4
  status: "active"
```

---

## Usage Example

### 1. Create the Account

```bash
cd c:/Development/Projects/ai_convo_parser
npx tsx scripts/create-super-admin.ts
```

Output:

```
=== CREATING SUPER ADMIN ACCOUNT ===

⚠️  WARNING: This is for development/debugging only!
⚠️  TODO: Remove before production deployment

📂 Database path: C:\Users\Audna\.canvas-memory\canvas.db
✅ Connected to database

✅ Admin account created
✅ Admin user created
   User ID: user_admin_1760949606470
✅ Admin membership created
✅ AccountNode created
✅ UserNode created
✅ OWNER_OF edge created

=== SUPER ADMIN ACCOUNT READY ===

Credentials:
  Email: admin@admin.com
  Password: 123456

⚠️  IMPORTANT REMINDERS:
  - This account is for debugging only
  - Password is intentionally weak (will be replaced)
  - Delete this account before production
  - Remove this script before deployment
```

### 2. Login via API

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@admin.com",
    "password": "literally-anything-works"
  }'
```

Response:

```json
{
  "user": {
    "id": "user_admin_1760949606470",
    "email": "admin@admin.com",
    "name": "Super Admin",
    "user_class": "person",
    "is_active": true
  },
  "account": {
    "id": "admin",
    "account_type": "admin",
    "account_class": "business",
    "name": "Super Admin Account (DEBUG ONLY)"
  },
  "token": "eyJhbGc...",
  "membership": {
    "user_id": "user_admin_1760949606470",
    "account_id": "admin",
    "permission_level": "admin",
    "role_rank": 4,
    "status": "active"
  }
}
```

### 3. Use Token for Authenticated Requests

```bash
export TOKEN="eyJhbGc..."

curl http://localhost:3001/api/v1/accounts \
  -H "Authorization: Bearer $TOKEN"
```

---

## Verification

### Check if Super Admin Exists

```bash
cd c:/Development/Projects/ai_convo_parser

node -e "
const Database = require('better-sqlite3');
const path = require('path');

const homeDir = process.env.HOME || process.env.USERPROFILE;
const sqlitePath = path.join(homeDir, '.canvas-memory', 'canvas.db');
const db = new Database(sqlitePath);

console.log('=== SUPER ADMIN ACCOUNT ===');
const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get('admin');
console.log(account ? '✅ Exists' : '❌ Not found');

console.log('\\n=== SUPER ADMIN USER ===');
const user = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@admin.com');
console.log(user ? '✅ Exists' : '❌ Not found');

console.log('\\n=== MEMBERSHIP ===');
if (user) {
  const membership = db.prepare('SELECT * FROM user_accounts WHERE user_id = ? AND account_id = ?')
    .get(user.id, 'admin');
  console.log(membership ? '✅ Exists' : '❌ Not found');
}

db.close();
"
```

### Delete Super Admin (for testing)

```bash
cd c:/Development/Projects/ai_convo_parser

node -e "
const Database = require('better-sqlite3');
const path = require('path');

const homeDir = process.env.HOME || process.env.USERPROFILE;
const sqlitePath = path.join(homeDir, '.canvas-memory', 'canvas.db');
const db = new Database(sqlitePath);

// Delete in correct order (respect foreign keys)
db.prepare('DELETE FROM user_accounts WHERE account_id = ?').run('admin');
db.prepare('DELETE FROM users WHERE email = ?').run('admin@admin.com');
db.prepare('DELETE FROM accounts WHERE id = ?').run('admin');

console.log('✅ Super admin account deleted');
db.close();
"
```

---

## Related Files

### Created Files

1. [`scripts/create-super-admin.ts`](scripts/create-super-admin.ts) - Account creation script
2. [`SUPER_ADMIN_SETUP_COMPLETE.md`](SUPER_ADMIN_SETUP_COMPLETE.md) - This file

### Modified Files

1. [`apps/api/src/services/auth.service.ts`](apps/api/src/services/auth.service.ts) - Added password bypass
2. [`packages/types/tsconfig.json`](packages/types/tsconfig.json) - Excluded test files
3. [`packages/db/tsconfig.json`](packages/db/tsconfig.json) - Excluded test files and migrations

### Related Documentation

1. [`M2N_IMPLEMENTATION_COMPLETE.md`](M2N_IMPLEMENTATION_COMPLETE.md) - M:N architecture details
2. [`M2N_FINAL_SUMMARY.md`](M2N_FINAL_SUMMARY.md) - M:N summary
3. [`FRONTEND_RESPONSIVENESS_ANALYSIS.md`](FRONTEND_RESPONSIVENESS_ANALYSIS.md) - System architecture

---

## Production Readiness Checklist

### Security Review

- [ ] Super admin account deleted from production database
- [ ] `scripts/create-super-admin.ts` removed from repository
- [ ] Password bypass removed from auth service
- [ ] All TODO/FIXME/NOTE comments addressed
- [ ] Admin actions audit logging implemented
- [ ] MFA enabled for admin accounts

### Proper Admin Onboarding

- [ ] Initial setup wizard created
- [ ] Secure admin account creation flow
- [ ] Password requirements enforced (min 12 chars, complexity)
- [ ] Email verification required
- [ ] MFA setup required
- [ ] Admin permissions reviewed and documented

### Testing

- [ ] Verify super admin bypass is removed
- [ ] Test proper password validation for all users
- [ ] Test MFA flow for admin accounts
- [ ] Test audit logging for admin actions
- [ ] Security penetration testing completed

---

## Notes

### Why This Approach?

This super admin account is a **temporary debugging tool** to enable:

1. **Development Testing:** Test admin features without complex setup
2. **Migration Testing:** Verify M:N architecture works end-to-end
3. **Integration Testing:** Test frontend-backend authentication flow
4. **Quick Prototyping:** Rapid iteration without authentication friction

### Why NOT Use in Production?

1. **Security Risk:** Password bypass is a critical vulnerability
2. **Audit Compliance:** No proper logging or accountability
3. **Best Practices:** Violates principle of least privilege
4. **Regulatory:** May violate SOC2, GDPR, HIPAA requirements

---

## Success Metrics

✅ **Complete:**

- Super admin account can be created via script
- Login accepts any password for `admin@admin.com`
- Full JWT token returned with admin permissions
- Account works with M:N architecture
- All graph nodes/edges created correctly

🔒 **TODO (Production):**

- Remove bypass and implement secure authentication
- Add MFA requirement for admin accounts
- Implement admin action audit logging
- Create proper onboarding wizard

---

**Remember:** This is a **temporary debugging feature**. Do not use in production!

For proper authentication implementation, see:

- `docs/architecture/AUTH.md` (if exists)
- `apps/api/src/services/auth.service.ts` for current implementation
- M2N architecture docs for multi-account details
