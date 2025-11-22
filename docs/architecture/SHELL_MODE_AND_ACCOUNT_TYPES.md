# ShellMode and Account Types: Complete Architecture

**Date**: 2025-10-22 (Updated after refactor)
**Version**: 2.0
**Purpose**: Document the relationship between ShellMode, account types, account classes, and how they determine UI behavior and permissions.

---

## Executive Summary

The application uses a **unified access control system**:

1. **ShellMode** - UI presentation layer (**LOCKED** to user's account type)
2. **AccountType** - Permission layer (admin vs client capabilities)

**Key Change (v2.0)**: ShellMode is now **permanently locked** to match AccountType:

- Admin accounts → `shellMode: 'admin'` (cannot switch)
- Client accounts → `shellMode: 'client'` (cannot switch)
- Data scoping enforced at API layer (same endpoint, different data)
- **One dashboard component** serves all users (API returns appropriate data)

---

## 1. Core Type Definitions

### 1.1 ShellMode (UI Layer)

**Definition**: `type ShellMode = 'admin' | 'client'`

**Files**:

- [packages/types/src/navigation.model.ts:10](packages/types/src/navigation.model.ts#L10)
- [apps/web/src/contexts/ShellContext.tsx:13](apps/web/src/contexts/ShellContext.tsx#L13)

**Purpose**: Determines which UI presentation the user sees. **LOCKED to user.accountType** - cannot be manually changed.

| ShellMode  | Display Name | Primary Purpose                                      | Default View | Navigation       | Locked To       |
| ---------- | ------------ | ---------------------------------------------------- | ------------ | ---------------- | --------------- |
| `'admin'`  | **"Admin"**  | Dashboard/management layer for all accounts and data | Dashboard    | Accounts Tree    | Admin accounts  |
| `'client'` | **"Client"** | Canvas UI for own data only                          | Canvas       | Groups & Folders | Client accounts |

**Display Labels**:

```typescript
// apps/web/src/contexts/ShellContext.tsx:18-21
export const SHELL_MODE_LABELS = {
  admin: 'Admin',
  client: 'Client',
} as const;
```

**IMPORTANT**: ShellMode automatically syncs with `user.accountType` and cannot be manually changed. Calls to `setShellMode()` are no-ops.

### 1.2 AccountType (Permission Layer)

**Definition**: `type AccountType = 'admin' | 'client'`

**Database Schema** ([packages/db/src/sqlite/client.ts:21](packages/db/src/sqlite/client.ts#L21)):

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK(account_type IN ('admin', 'client')),
  account_class TEXT NOT NULL CHECK(account_class IN ('free', 'professional', 'business')),
  ...
);
```

**Purpose**: Determines the **permission level** of an account:

| AccountType | Capabilities                                                                                                                      | ShellMode (LOCKED) | Default CanvasMode |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------ |
| `'admin'`   | - Manage multiple client accounts<br>- View all client data (scoped)<br>- Admin features<br>- Create accounts<br>- Full analytics | `'admin'`          | `'dashboard'`      |
| `'client'`  | - Manage own data<br>- Graph/canvas features<br>- Own data analytics                                                              | `'client'`         | `'canvas'`         |

### 1.3 AccountClass (Plan Tier)

**Definition**: `type AccountClass = 'free' | 'professional' | 'business'`

**Database Schema** ([packages/db/src/sqlite/client.ts:22](packages/db/src/sqlite/client.ts#L22)):

```sql
account_class TEXT NOT NULL CHECK(account_class IN ('free', 'professional', 'business'))
```

**Purpose**: Determines the **subscription/plan tier** and feature limits:

| AccountClass     | Features                          | Typical Use Case          |
| ---------------- | --------------------------------- | ------------------------- |
| `'free'`         | Basic features, limited storage   | Individual users, testing |
| `'professional'` | Advanced features, more storage   | Power users, small teams  |
| `'business'`     | Full features, enterprise support | Organizations, agencies   |

**Note**: AccountClass is **orthogonal** to AccountType - you can have:

- Admin accounts with any class (free/professional/business)
- Client accounts with any class (free/professional/business)

---

## 2. User Data Structure

### 2.1 User Interface (JWT Payload)

**File**: [apps/web/src/contexts/AuthContext.tsx:14-25](apps/web/src/contexts/AuthContext.tsx#L14-L25)

```typescript
interface User {
  userId: string; // User's unique ID
  accountId: string; // Current operating account ID
  email: string; // User's email
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin'; // Role in account
  accountType: 'admin' | 'client'; // Account type (permission layer)
  accountClass: 'free' | 'professional' | 'business'; // Plan tier
  rank: number; // Numeric rank (1-4)
  overrides?: Record<string, boolean>; // Permission overrides
  sessionId?: string; // Session identifier
  allAccounts?: AccountInfo[]; // M:N - all accounts user belongs to
}
```

**Key Points**:

- **accountType** is stored on the **account**, not the user
- Users can belong to multiple accounts (M:N relationship)
- When user switches accounts, `accountType` changes based on target account
- `permissionLevel` is the user's **role within the account** (separate from accountType)

### 2.2 Permission Level vs Account Type

| Concept             | Scope                             | Values                                | Stored On                      | Purpose                   |
| ------------------- | --------------------------------- | ------------------------------------- | ------------------------------ | ------------------------- |
| **permissionLevel** | User's role **within** an account | `junior`, `senior`, `leader`, `admin` | `user_accounts` junction table | RBAC within account       |
| **accountType**     | Account's **category**            | `admin`, `client`                     | `accounts` table               | Account-level permissions |
| **accountClass**    | Account's **plan tier**           | `free`, `professional`, `business`    | `accounts` table               | Feature limits            |

**Example Scenario**:

```
User: jane@example.com
├─ Account A (admin account, professional)
│  └─ Jane's permissionLevel: 'admin' (full control)
├─ Account B (client account, free)
│  └─ Jane's permissionLevel: 'leader' (high permissions)
└─ Account C (client account, business)
   └─ Jane's permissionLevel: 'junior' (limited permissions)
```

When Jane switches to Account A:

- `user.accountType = 'admin'` (from accounts table)
- `user.accountClass = 'professional'` (from accounts table)
- `user.permissionLevel = 'admin'` (from user_accounts junction)
- Default ShellMode: `'admin'`
- Default CanvasMode: `'dashboard'`

When Jane switches to Account B:

- `user.accountType = 'client'` (from accounts table)
- `user.accountClass = 'free'` (from accounts table)
- `user.permissionLevel = 'leader'` (from user_accounts junction)
- Default ShellMode: `'client'`
- Default CanvasMode: `'canvas'`

---

## 3. ShellMode Default Logic

### 3.1 Initial Shell Mode (On Login)

**File**: [apps/web/src/contexts/ShellContext.tsx:61-63](apps/web/src/contexts/ShellContext.tsx#L61-L63)

```typescript
const getDefaultShellMode = (): ShellMode => {
  return user?.accountType === 'admin' ? 'admin' : 'client';
};
```

**Logic**:

- **Admin accounts** → Default to `'admin'` (Manager mode)
- **Client accounts** → Default to `'client'` (Portal mode)

**Also in**: [packages/types/src/navigation.model.ts:226-228](packages/types/src/navigation.model.ts#L226-L228)

```typescript
export function getDefaultShellMode(user: User | null): ShellMode {
  return user?.accountType === 'admin' ? 'admin' : 'client';
}
```

### 3.2 Initial Canvas Mode (On Login)

**File**: [apps/web/src/contexts/ShellContext.tsx:72-77](apps/web/src/contexts/ShellContext.tsx#L72-L77)

```typescript
useEffect(() => {
  if (user && !initializedRef.current) {
    const defaultMode = user.accountType === 'admin' ? 'admin' : 'client';
    const defaultCanvasMode = user.accountType === 'admin' ? 'dashboard' : 'canvas';

    setShellModeState(defaultMode);
    setCanvasModeState(defaultCanvasMode);
    // ...
  }
}, [user]);
```

**Logic**:

- **Admin accounts**:
  - ShellMode: `'admin'`
  - CanvasMode: `'dashboard'`
- **Client accounts**:
  - ShellMode: `'client'`
  - CanvasMode: `'canvas'`

**Also in**: [packages/types/src/navigation.model.ts:216-221](packages/types/src/navigation.model.ts#L216-L221)

```typescript
export function getDefaultCanvasMode(shellMode: ShellMode, user: User | null): CanvasMode {
  if (user?.accountType === 'admin' && shellMode === 'admin') {
    return 'dashboard';
  }
  return 'canvas';
}
```

### 3.3 ShellMode Locking (v2.0 Behavior)

**File**: [apps/web/src/contexts/ShellContext.tsx:113-120](apps/web/src/contexts/ShellContext.tsx#L113-L120)

```typescript
const setShellMode = useCallback(
  (mode: ShellMode) => {
    console.warn(
      'setShellMode() called but ShellMode is locked to account type.',
      'ShellMode cannot be manually changed. Ignoring request.',
      { requestedMode: mode, currentMode: shellMode }
    );
    // No-op: shellMode is determined by user.accountType only
  },
  [shellMode]
);
```

**Logic**: ShellMode is **locked** and cannot be manually changed:

- `setShellMode()` is now a **no-op** that logs warnings
- ShellMode is determined **only** by `user.accountType`
- Admin accounts are locked to `'admin'` shell
- Client accounts are locked to `'client'` shell

---

## 4. Permission Checks (Old vs New)

### 4.1 Original Architecture (v1.0 - Deprecated)

**Old Logic** (Before locking refactor):

- Admin accounts could access both `'crm'` and `'portal'` shells
- Client accounts could **only** access `'portal'` shell
- Permission check enforced in `canAccessPortal()` function
- Users could manually switch between shells

### 4.2 Current Architecture (v2.0 - Locked)

**File**: [apps/web/src/contexts/ShellContext.tsx:84-91](apps/web/src/contexts/ShellContext.tsx#L84-L91)

```typescript
/**
 * Check if user can access Portal shell
 * UPDATED: All users can now access all shell modes (Manager mode parity)
 */
const canAccessPortal = useCallback(() => {
  // Manager mode is no longer admin-only
  return true;
}, [user]);
```

**File**: [apps/web/src/contexts/ShellContext.tsx:104-107](apps/web/src/contexts/ShellContext.tsx#L104-L107)

```typescript
/**
 * Set shell mode (Manager or Portal)
 * UPDATED: No longer validates admin-only access (Manager mode parity)
 */
const setShellMode = useCallback((mode: ShellMode) => {
  // No permission check - all users can access all modes
  // Data scoping enforced at API layer instead
  // ...
```

**Key Change**: Permission enforcement has moved from the **UI layer** (ShellContext) to the **API layer** (middleware):

**Backend Permission Check** ([apps/api/src/middleware/auth.middleware.ts:206](apps/api/src/middleware/auth.middleware.ts#L206)):

```typescript
if (req.user.accountType !== 'admin') {
  return res.status(403).json({ error: 'Admin access required' });
}
```

**Rationale**:

1. **Better security**: Permission checks at API layer can't be bypassed
2. **Flexibility**: Clients can use "Manager" UI for their own data
3. **Simplicity**: No complex UI permission logic
4. **Data scoping**: API enforces what data user can see, regardless of shell

---

## 5. Navigation Behavior by Mode

### 5.1 Navigation Rules

**File**: [packages/types/src/navigation.model.ts:90-136](packages/types/src/navigation.model.ts#L90-L136)

```typescript
/**
 * Navigation Model Factory
 *
 * Rules (in priority order):
 * 1. Settings mode → Always show settings tree
 * 2. CRM shell + Dashboard canvas → Show accounts tree
 * 3. Default → Show groups tree
 */
export class NavigationModelFactory {
  static get(context: NavigationContext): NavigationModel {
    // Rule 1: Settings mode always shows settings tree
    if (context.canvasMode === 'settings') {
      return this.getSettingsModel(context);
    }

    // Rule 2: Admin + Dashboard shows accounts tree
    if (context.shellMode === 'admin' && context.canvasMode === 'dashboard') {
      return this.getAccountsModel(context);
    }

    // Rule 3: Default to groups tree
    return this.getGroupsModel(context);
  }
}
```

### 5.2 Navigation Matrix

| ShellMode | CanvasMode  | Left Sidebar        | Right Sidebar                          | Typical User                |
| --------- | ----------- | ------------------- | -------------------------------------- | --------------------------- |
| `admin`   | `dashboard` | **Accounts Tree**   | AccountInspector + UserDetailInspector | Admin                       |
| `admin`   | `canvas`    | Groups & Folders    | Node Inspector                         | Admin (viewing client data) |
| `admin`   | `settings`  | Settings Navigation | Settings detail                        | Admin                       |
| `client`  | `canvas`    | Groups & Folders    | Node Inspector                         | Client (default)            |
| `client`  | `dashboard` | Groups & Folders    | Analytics Dashboard                    | Client (viewing own data)   |
| `client`  | `settings`  | Settings Navigation | Settings detail                        | Client                      |

### 5.3 "Create Button" Logic

**Accounts Tree** (CRM + Dashboard):

```typescript
// packages/types/src/navigation.model.ts:164-176
private static getAccountsModel(context: NavigationContext): NavigationModel {
  const isAdmin = context.user?.accountType === 'admin';

  return {
    mode: 'accounts',
    title: 'Accounts',
    showCreateButton: isAdmin, // Only admins can create accounts
    multiSelect: true,
    // ...
  };
}
```

**Logic**: Only show "+ Account" button if `user.accountType === 'admin'`

**Groups Tree** (Default):

```typescript
// packages/types/src/navigation.model.ts:182-196
private static getGroupsModel(context: NavigationContext): NavigationModel {
  return {
    mode: 'groups',
    title: 'Groups & Folders',
    showCreateButton: false, // Groups creation handled elsewhere
    multiSelect: true,
    // ...
  };
}
```

---

## 6. Data Scoping (How AccountType Controls Access)

### 6.1 Backend Data Filtering

**Admin Account** ([apps/api/src/routes/nodes.ts:167-173](apps/api/src/routes/nodes.ts#L167-L173)):

```typescript
const accountFilter =
  req.user && req.user.accountType !== 'admin' ? `AND nodes.account_id = ?` : '';

const params = req.user && req.user.accountType !== 'admin' ? [req.user.accountId] : [];

console.log(
  `👤 Request from: ${req.user.email} (${req.user.accountType}) | account_id=${req.user.accountId}`
);
```

**Logic**:

- **Admin accounts**: No account filter → Can see data across multiple client accounts (based on `account_links` table)
- **Client accounts**: Filter by `account_id` → Only see their own data

**Verification Example** ([apps/api/src/routes/nodes.ts:116](apps/api/src/routes/nodes.ts#L116)):

```typescript
if (req.user.accountType !== 'admin') {
  return res.status(403).json({ error: 'Admin access required' });
}
```

### 6.2 Account Links Table

**Purpose**: Define which admin accounts can access which client accounts

**Schema** ([packages/db/src/sqlite/client.ts:76-80](packages/db/src/sqlite/client.ts#L76-L80)):

```sql
CREATE TABLE IF NOT EXISTS account_links (
  id TEXT PRIMARY KEY,
  admin_account_id TEXT NOT NULL,
  client_account_id TEXT NOT NULL,
  relationship_type TEXT CHECK(relationship_type IN ('manages', 'audits', 'partners')),
  -- ...
  FOREIGN KEY (admin_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (client_account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
```

**Usage**: When admin is in `'admin'` shell mode:

1. Query `account_links` to find all client accounts linked to admin
2. Show those accounts in Accounts Tree
3. When admin selects a client account, switch operating context to that account
4. Data queries now filter by the selected client's `account_id`

### 6.3 Operating Context

**File**: [apps/web/src/contexts/OperatingContext.tsx](apps/web/src/contexts/OperatingContext.tsx)

**Type**: `type OperatingMode = 'native' | 'nested' | 'crm'`

| OperatingMode | Meaning                                                | Example                                           |
| ------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `'native'`    | User operating in their own account                    | Client user viewing their own data                |
| `'nested'`    | Admin viewing a client account from portal perspective | Admin switched to client account, still in portal |
| `'crm'`       | Admin viewing client account from manager perspective  | Admin viewing client in CRM dashboard             |

**Relationship to ShellMode**:

```typescript
// ShellMode: UI presentation (which sidebar, which view)
// OperatingMode: Data context (whose data am I viewing)

// Admin user in Admin mode, viewing Client Account #123:
shellMode = 'admin'; // UI shows Manager/Dashboard
operatingMode = 'crm'; // Operating as CRM manager (data context)
accountId = '123'; // Viewing Client #123's data
user.accountType = 'admin'; // User's account is admin type
```

---

## 7. Settings Visibility by Account Type

**File**: [apps/api/src/routes/settings.routes.ts:34-46](apps/api/src/routes/settings.routes.ts#L34-L46)

```typescript
const accountType = user.accountType;

// Filter categories and sections by adminOnly flag
const filteredRegistry = settingsRegistry
  .map((category) => {
    // Skip entire category if adminOnly and user is not admin
    if (category.adminOnly && accountType !== 'admin') {
      return null;
    }

    // Filter sections within category
    const filteredSections = category.sections.filter((section) => {
      if (section.adminOnly && accountType !== 'admin') {
        return false;
      }
      return true;
    });

    return { ...category, sections: filteredSections };
  })
  .filter(Boolean);
```

**Logic**:

- Settings can be marked `adminOnly: true` at category or section level
- **Admin accounts**: See all settings
- **Client accounts**: See only non-admin settings

**Example** (from settings registry):

```typescript
{
  category: 'Data Management',
  sections: [
    {
      id: 'data-cleanup',
      label: 'Data Cleanup',
      adminOnly: true,  // Only admins see this
      component: 'DataManagementCard'
    },
    {
      id: 'import-history',
      label: 'Import History',
      adminOnly: false,  // All users see this
      component: 'ImportsTableCard'
    }
  ]
}
```

---

## 8. UI Components Awareness

### 8.1 Components Using accountType

| Component            | File                                                                                                               | Usage                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **ShellContext**     | [apps/web/src/contexts/ShellContext.tsx:62](apps/web/src/contexts/ShellContext.tsx#L62)                            | Default shell mode                     |
| **OperatingContext** | [apps/web/src/contexts/OperatingContext.tsx:64](apps/web/src/contexts/OperatingContext.tsx#L64)                    | Permission check for account switching |
| **CanvasToolbar**    | [apps/web/src/components/canvas/CanvasToolbar.tsx:58-59](apps/web/src/components/canvas/CanvasToolbar.tsx#L58-L59) | Show/hide admin features               |
| **CanvasHeader**     | [apps/web/src/components/canvas/CanvasHeader.tsx:265](apps/web/src/components/canvas/CanvasHeader.tsx#L265)        | Display account type in UI             |
| **SettingsPage**     | [apps/web/src/components/settings/SettingsPage.tsx:260](apps/web/src/components/settings/SettingsPage.tsx#L260)    | Conditionally render admin cards       |
| **AccountInspector** | [apps/web/src/components/inspector/AccountInspector.tsx](apps/web/src/components/inspector/AccountInspector.tsx)   | Show account details                   |
| **useAccountTree**   | [apps/web/src/hooks/useAccountTree.ts:16](apps/web/src/hooks/useAccountTree.ts#L16)                                | Only fetch for admin accounts          |
| **usePermissions**   | [apps/web/src/hooks/usePermissions.ts:57](apps/web/src/hooks/usePermissions.ts#L57)                                | Permission calculations                |

### 8.2 Example: Conditional Rendering

**SettingsPage** ([apps/web/src/components/settings/SettingsPage.tsx:260](apps/web/src/components/settings/SettingsPage.tsx#L260)):

```typescript
{user?.accountType === 'admin' && <AdminDataManagementCard />}
```

**CanvasHeader** ([apps/web/src/components/canvas/CanvasHeader.tsx:23](apps/web/src/components/canvas/CanvasHeader.tsx#L23)):

```typescript
const isAdmin = user?.accountType === 'admin';

// Later in JSX:
{user?.permissionLevel} • {user?.accountType === 'admin' ? 'Admin Account' : 'Client Account'}
```

**useAccountTree Hook** ([apps/web/src/hooks/useAccountTree.ts:16](apps/web/src/hooks/useAccountTree.ts#L16)):

```typescript
if (user?.accountType !== 'admin') {
  // Non-admins don't have an accounts tree
  setTree([]);
  setIsLoading(false);
  return;
}
```

---

## 9. Real-World Scenarios

### Scenario 1: Admin User Workflow

**User**: admin@agency.com (accountType: 'admin', accountClass: 'business')

**Login**:

1. User logs in
2. ShellContext initializes with:
   - ShellMode: `'admin'` (**LOCKED** to admin accountType)
   - CanvasMode: `'dashboard'` (default for admin shell)
3. Left sidebar shows **Accounts Tree** (all client accounts linked to admin)
4. Right sidebar shows **AccountInspector**

**Navigation**:

- User clicks on "Client A" in Accounts Tree
- OperatingContext switches to Client A's account
- Dashboard updates to show Client A's analytics
- Right sidebar shows AccountInspector with Client A's details
- Data queries now filter by Client A's account_id

**v2.0 Note - Shell Locking**:

- Shell mode is **LOCKED** to `'admin'` for this user
- User **cannot** manually switch to `'client'` shell
- ShellMode automatically follows accountType
- To view data differently, use CanvasMode or OperatingMode instead

### Scenario 2: Client User Workflow

**User**: client@business.com (accountType: 'client', accountClass: 'professional')

**Login**:

1. User logs in
2. ShellContext initializes with:
   - ShellMode: `'client'` (**LOCKED** to client accountType)
   - CanvasMode: `'canvas'` (default for client shell)
3. Left sidebar shows **Groups & Folders Tree** (user's own groups)
4. Right sidebar shows **Node Inspector**

**Navigation**:

- User works with graph canvas
- Uploads new chat sources
- Groups are automatically created
- All data scoped to user's own account_id

**v2.0 Note - Shell Locking & Dashboard Access**:

- Shell mode is **LOCKED** to `'client'` for this user
- User **cannot** manually switch to `'admin'` shell
- User CAN switch to `'dashboard'` CanvasMode to view analytics
- Dashboard shows user's own analytics (not other accounts)
- API enforces data scoping - user only sees their own data

### Scenario 3: Multi-Account User

**User**: consultant@freelance.com

**Account Memberships**:

- Account X (admin account, professional) - permissionLevel: 'admin'
- Account Y (client account, business) - permissionLevel: 'leader'
- Account Z (client account, free) - permissionLevel: 'junior'

**Workflow (v2.0 - Locked Shell Modes)**:

1. User logs into Account X (admin)
   - ShellMode: `'admin'` (**LOCKED** to admin accountType)
   - CanvasMode: `'dashboard'`
   - Can see client accounts linked to Account X
   - Full admin features

2. User switches to Account Y (client, leader role)
   - ShellMode **automatically changes** to `'client'` (locked to new accountType)
   - CanvasMode changes to `'canvas'`
   - Can see Account Y's data
   - Has leader-level permissions (based on permissionLevel)

3. User switches to Account Z (client, junior role)
   - ShellMode: `'client'` (**LOCKED** to client accountType)
   - CanvasMode: `'canvas'`
   - Can see Account Z's data
   - Has junior-level permissions (limited features)

**Key Insight**: ShellMode automatically follows the accountType of whichever account the user switches to.

---

## 10. Testing Checklist

### 10.1 Account Type Tests (v2.0 - Locked Shells)

- [ ] Admin user logs in → defaults to 'admin' shell + 'dashboard' canvas (**LOCKED**)
- [ ] Client user logs in → defaults to 'client' shell + 'canvas' canvas (**LOCKED**)
- [ ] Admin **cannot** manually switch to 'client' shell (setShellMode logs warning)
- [ ] Client **cannot** manually switch to 'admin' shell (setShellMode logs warning)
- [ ] Admin sees Accounts Tree in Admin + Dashboard mode
- [ ] Client sees Groups Tree in all modes
- [ ] Multi-account user: ShellMode auto-switches when changing accounts
- [ ] Settings page filters adminOnly sections for client users
- [ ] API blocks client access to admin-only endpoints
- [ ] Account switching updates accountType correctly

### 10.2 Permission Tests

- [ ] Client cannot create accounts (no "+ Account" button)
- [ ] Admin can create accounts (shows "+ Account" button)
- [ ] Client API requests are filtered by account_id
- [ ] Admin API requests can access linked client accounts
- [ ] OperatingContext switches correctly when admin views client account
- [ ] Multi-account user sees correct accountType after switching

### 10.3 Navigation Tests

- [ ] Settings mode always shows settings tree (regardless of shell/account)
- [ ] CRM + Dashboard shows accounts tree (only for admin)
- [ ] All other mode combos show groups tree
- [ ] NavigationModelFactory returns correct model for each combo
- [ ] Multi-select works in accounts and groups modes
- [ ] Single-select enforced in settings mode

---

## 11. Migration Notes (Historical Context)

### Pre-"Manager Mode Parity" (Old Architecture)

**Date**: Prior to recent refactor

**Logic**:

```typescript
// OLD: ShellContext permission check
const canAccessPortal = useCallback(() => {
  if (!user) return false;
  return user.accountType === 'admin'; // Only admins could access portal
}, [user]);
```

**Problem**:

- Client users couldn't access "Manager" features for their own data
- UI was too restrictive
- Permission logic duplicated between frontend and backend

### Post-"Manager Mode Parity" (Current Architecture)

**Date**: Current

**Logic**:

```typescript
// NEW: All users can access all modes
const canAccessPortal = useCallback(() => {
  return true; // No permission check
}, [user]);
```

**Improvement**:

- All users can use Manager UI for their own data
- Permission enforcement at API layer (more secure)
- Simpler frontend logic
- Better UX

**Migration Path**:

1. Remove frontend permission checks from ShellContext
2. Ensure API endpoints enforce accountType permissions
3. Update data scoping logic to filter by account_id for non-admins
4. Test all permission combinations

---

## 12. Glossary

| Term                     | Definition                                                                     |
| ------------------------ | ------------------------------------------------------------------------------ |
| **ShellMode**            | UI presentation layer: 'admin' or 'client' (**LOCKED** to accountType in v2.0) |
| **AccountType**          | Permission category: 'admin' or 'client'                                       |
| **AccountClass**         | Plan tier: 'free', 'professional', or 'business'                               |
| **PermissionLevel**      | User's role within an account: 'junior', 'senior', 'leader', 'admin'           |
| **CanvasMode**           | Page within a shell: 'dashboard', 'settings', 'canvas', 'auth'                 |
| **OperatingMode**        | Data context: 'native', 'nested', or 'crm' (different from ShellMode)          |
| **NavigationMode**       | Which tree to show in sidebar: 'groups', 'accounts', or 'settings'             |
| **Shell Locking (v2.0)** | ShellMode automatically matches accountType and cannot be manually changed     |

---

## 13. Quick Reference

### Default Behaviors (v2.0 - Locked Shells)

```typescript
// Admin account defaults
accountType: 'admin'
  → shellMode: 'admin' (LOCKED)
  → canvasMode: 'dashboard'
  → leftSidebar: Accounts Tree
  → rightSidebar: AccountInspector

// Client account defaults
accountType: 'client'
  → shellMode: 'client' (LOCKED)
  → canvasMode: 'canvas'
  → leftSidebar: Groups Tree
  → rightSidebar: Node Inspector
```

### Mode Locking (v2.0)

```typescript
// setShellMode() is now a NO-OP
setShellMode('admin')
  → Logs warning
  → No state change (shell mode is locked)
  → Use setCanvasMode() or account switching instead

// ShellMode auto-syncs with accountType
switchAccount(newAccountId)
  → If new account is admin: shellMode = 'admin'
  → If new account is client: shellMode = 'client'
  → Automatic, cannot be overridden
```

### Permission Checks

```typescript
// Frontend (UI display)
user?.accountType === 'admin'; // Show admin features

// Backend (data access)
req.user.accountType !== 'admin'; // Deny access
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
**Maintainer**: AI Agent (Claude Code)
**Related Docs**:

- [COMPONENT_TREE_AUDIT.md](./COMPONENT_TREE_AUDIT.md)
- [docs/inventory.md](../inventory.md)
