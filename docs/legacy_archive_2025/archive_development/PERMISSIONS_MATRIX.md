# Keimenon - Permissions Matrix

## Overview

The system has two account types (`admin` and `client`), four permission levels (`junior`, `senior`, `leader`, `admin`), and three account classes (`free`, `professional`, `business`).

## Account Types

### Client Account

- Standard customer accounts
- Isolated from other client accounts
- Cannot see other client accounts' data
- Cannot modify global system settings

### Admin Account

- System-level account for Keimenon operators
- Has "debug mode" - can operate as if it's a client account for its own data
- Has CRM controls - can view/manage all client accounts
- Can modify global system settings

## Permission Levels

### Junior (Read-Only User)

Least privileged - can view but not modify.

### Senior (Data Contributor)

Can upload/modify data but not manage users.

### Leader (Team Manager)

Can manage users up to their permission level and all data operations.

### Admin (Account Administrator)

Full control over account, users, and settings within scope.

---

## Client Account Permissions

### Client-Junior (Read-Only)

**Sources:**

- ✓ Read sources (own account only)
- ✗ Write/upload sources
- ✗ Delete sources

**Users:**

- ✓ Read users (own account only)
- ✗ Create/update users
- ✗ Delete users

**Account Settings:**

- ✗ Read/write account settings

**Graph Data:**

- ✓ View nodes/edges (own account only)
- ✗ Create/modify/delete nodes/edges

---

### Client-Senior (Data Contributor)

**Sources:**

- ✓ Read sources (own account only)
- ✓ Write/upload sources (own account only)
- ✗ Delete sources

**Users:**

- ✓ Read users (own account only)
- ✗ Create/update users
- ✗ Delete users

**Account Settings:**

- ✗ Read/write account settings

**Graph Data:**

- ✓ View nodes/edges (own account only)
- ✓ Create/modify nodes/edges (own account only)
- ✗ Delete nodes/edges

---

### Client-Leader (Team Manager)

**Sources:**

- ✓ Read sources (own account only)
- ✓ Write/upload sources (own account only)
- ✓ Delete sources (own account only)

**Users:**

- ✓ Read users (own account only)
- ✓ Create/update users **up to leader level** (own account only)
- ✓ Delete users **up to senior level** (own account only)

**Account Settings:**

- ✗ Read/write account settings

**Graph Data:**

- ✓ View nodes/edges (own account only)
- ✓ Create/modify nodes/edges (own account only)
- ✓ Delete nodes/edges (own account only)

---

### Client-Admin (Account Administrator)

**Sources:**

- ✓ Read sources (own account only)
- ✓ Write/upload sources (own account only)
- ✓ Delete sources (own account only)

**Users:**

- ✓ Read users (own account only)
- ✓ Create/update users **up to admin level** (own account only)
- ✓ Delete users **up to leader level** (own account only)
- ✗ Delete self

**Account Settings:**

- ✓ Read/write account system settings
- ✓ Read/write account style settings

**Graph Data:**

- ✓ View nodes/edges (own account only)
- ✓ Create/modify nodes/edges (own account only)
- ✓ Delete nodes/edges (own account only)

---

## Admin Account Permissions

Admin accounts have TWO modes:

1. **Debug Mode** - Work with admin account's own data (same as client account permissions)
2. **CRM Mode** - Manage all client accounts

### Admin-Junior (Read-Only Support)

**Debug Mode (Own Admin Account Data):**

- ✓ Read admin sources
- ✗ Write/upload admin sources
- ✗ Delete admin sources
- ✓ Read admin users
- ✗ Create/update admin users

**CRM Mode (Client Accounts):**

- ✓ Read all client accounts (basic info only)
- ✓ Read all client account users (basic info only)
- ✗ Write client account data
- ✗ Write client user data
- ✗ Modify client account settings

**Global Settings:**

- ✗ Read/write global system settings
- ✗ Read/write global style settings

---

### Admin-Senior (Support Engineer)

**Debug Mode (Own Admin Account Data):**

- ✓ Read admin sources
- ✓ Write/upload admin sources
- ✗ Delete admin sources
- ✓ Read admin users
- ✗ Create/update admin users

**CRM Mode (Client Accounts):**

- ✓ Read all client accounts (full info)
- ✓ Write client account data
- ✓ Read all client account users (full info)
- ✓ Write client user data (create/update)
- ✗ Delete client users
- ✗ Modify client account settings

**Global Settings:**

- ✗ Read/write global system settings
- ✗ Read/write global style settings

---

### Admin-Leader (Team Lead / Account Manager)

**Debug Mode (Own Admin Account Data):**

- ✓ Read admin sources
- ✓ Write/upload admin sources
- ✓ Delete admin sources
- ✓ Read admin users
- ✓ Create/update admin users **up to leader level**
- ✓ Delete admin users **up to senior level**

**CRM Mode (Client Accounts):**

- ✓ Read all client accounts (full info)
- ✓ Write client account data
- ✓ Read all client account users (full info)
- ✓ Write client user data (create/update/delete)
- ✓ Modify client account system settings
- ✓ Modify client account style settings

**Global Settings:**

- ✗ Read/write global system settings
- ✗ Read/write global style settings

---

### Admin-Admin (System Administrator)

**Debug Mode (Own Admin Account Data):**

- ✓ Read admin sources
- ✓ Write/upload admin sources
- ✓ Delete admin sources
- ✓ Read admin users
- ✓ Create/update admin users **up to admin level**
- ✓ Delete admin users **up to leader level**
- ✗ Delete self
- ✓ Read/write admin account system settings
- ✓ Read/write admin account style settings

**CRM Mode (Client Accounts):**

- ✓ Read all client accounts (full info)
- ✓ Write client account data
- ✓ Read all client account users (full info)
- ✓ Write client user data (create/update/delete)
- ✓ Modify client account system settings
- ✓ Modify client account style settings

**Global Settings:**

- ✓ Read/write global system settings
- ✓ Read/write global style settings

---

## Permission Check Logic

### User CRUD Operations

```typescript
// Can user A modify user B?
function canModifyUser(userA: User, userB: User): boolean {
  // Cannot modify yourself beyond basic fields
  if (userA.id === userB.id) return false;

  // Must be same account (unless admin CRM mode)
  if (userA.account_id !== userB.account_id && userA.accountType !== 'admin') {
    return false;
  }

  // Permission level hierarchy
  const levels = ['junior', 'senior', 'leader', 'admin'];
  const userALevel = levels.indexOf(userA.permission_level);
  const userBLevel = levels.indexOf(userB.permission_level);

  // Leader can modify up to leader (junior, senior, leader)
  if (userA.permission_level === 'leader') {
    return userBLevel <= 2; // leader index
  }

  // Admin can modify up to admin (all levels)
  if (userA.permission_level === 'admin') {
    return userBLevel <= 3; // admin index
  }

  return false;
}

// Can user A delete user B?
function canDeleteUser(userA: User, userB: User): boolean {
  if (userA.id === userB.id) return false; // Cannot delete self

  if (userA.account_id !== userB.account_id && userA.accountType !== 'admin') {
    return false;
  }

  const levels = ['junior', 'senior', 'leader', 'admin'];
  const userBLevel = levels.indexOf(userB.permission_level);

  // Leader can delete up to senior
  if (userA.permission_level === 'leader') {
    return userBLevel <= 1; // senior index
  }

  // Admin can delete up to leader
  if (userA.permission_level === 'admin') {
    return userBLevel <= 2; // leader index
  }

  return false;
}
```

### Data Access (Nodes/Edges)

```typescript
function canAccessData(user: User, resourceAccountId: string): boolean {
  // Admin accounts can access all data (CRM mode)
  if (user.accountType === 'admin') {
    return true;
  }

  // Client accounts can only access their own data
  return user.account_id === resourceAccountId;
}

function canModifyData(user: User, resourceAccountId: string): boolean {
  // Must have access first
  if (!canAccessData(user, resourceAccountId)) {
    return false;
  }

  // Junior is read-only
  if (user.permission_level === 'junior') {
    return false;
  }

  // Senior, Leader, Admin can modify
  return true;
}

function canDeleteData(user: User, resourceAccountId: string): boolean {
  // Must have access first
  if (!canAccessData(user, resourceAccountId)) {
    return false;
  }

  // Only Leader and Admin can delete
  return ['leader', 'admin'].includes(user.permission_level);
}
```

### Settings Access

```typescript
function canModifyAccountSettings(user: User, targetAccountId: string): boolean {
  // Own account settings: only admin permission
  if (user.account_id === targetAccountId) {
    return user.permission_level === 'admin';
  }

  // Client accounts cannot modify other accounts
  if (user.accountType === 'client') {
    return false;
  }

  // Admin accounts: leader and admin can modify client account settings
  if (user.accountType === 'admin') {
    return ['leader', 'admin'].includes(user.permission_level);
  }

  return false;
}

function canModifyGlobalSettings(user: User): boolean {
  // Only admin account with admin permission
  return user.accountType === 'admin' && user.permission_level === 'admin';
}
```

---

## API Route Protection Examples

### Sources (Upload/Read/Delete)

```typescript
// GET /api/v1/sources
router.get('/', requireAuth, isolateByAccount, async (req, res) => {
  // isolateByAccount ensures:
  // - Client accounts only see their data
  // - Admin accounts see all data
});

// POST /api/v1/sources (Upload)
router.post('/', requireAuth, requirePermission('senior'), async (req, res) => {
  // requirePermission('senior') blocks junior
  // senior, leader, admin can upload
});

// DELETE /api/v1/sources/:id
router.delete('/:id', requireAuth, requirePermission('leader'), async (req, res) => {
  // requirePermission('leader') blocks junior and senior
  // leader, admin can delete
});
```

### Users (CRUD)

```typescript
// POST /api/v1/accounts/:accountId/users
router.post('/:accountId/users', requireAuth, requirePermission('leader'), async (req, res) => {
  // Additional check in handler:
  // - Verify permission level of new user is allowed
  // - Leader can create up to leader
  // - Admin can create up to admin
});

// DELETE /api/v1/users/:id
router.delete('/:id', requireAuth, requirePermission('leader'), async (req, res) => {
  // Additional check in handler:
  // - Verify target user permission level
  // - Leader can delete up to senior
  // - Admin can delete up to leader
});
```

### Account Settings

```typescript
// PATCH /api/v1/accounts/:id/settings
router.patch('/:id/settings', requireAuth, async (req, res) => {
  // Custom permission check:
  // - Own account: must be admin permission
  // - Other account: must be admin account type + leader/admin permission
});
```

### Global Settings

```typescript
// PATCH /api/v1/settings/global
router.patch('/global', requireAuth, requireAdmin, requirePermission('admin'), async (req, res) => {
  // Only admin account + admin permission
});
```

---

## Settings Types

### Account System Settings

- Keimenon visibility defaults
- Data retention policies
- Export formats allowed
- API rate limits
- Webhook configurations

### Account Style Settings

- UI theme (light/dark)
- Color scheme
- Layout preferences
- Font sizes
- Dashboard layouts

### Global System Settings (Admin-Admin only)

- System-wide feature flags
- Default account class settings
- Security policies
- Backup schedules
- Database maintenance windows

### Global Style Settings (Admin-Admin only)

- Default UI theme for new accounts
- Branding (logo, colors)
- Email templates
- PDF export templates

---

## Implementation Priority

### Phase 1 (Current)

- ✅ Basic auth (login, JWT)
- ✅ Account and user CRUD
- ✅ Permission level enforcement
- ✅ Account isolation

### Phase 2 (Next)

- Update existing routes (nodes, edges, sources) with account_id filtering
- Implement granular permission checks (canModifyUser, canDeleteUser)
- Add permission checks to all data modification endpoints

### Phase 3 (Future)

- Account settings CRUD
- Global settings CRUD
- Style settings system
- Audit logging for permission-sensitive operations
