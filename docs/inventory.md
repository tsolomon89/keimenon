# Settings + CRM Consolidation Inventory

**Date:** 2025-10-16
**Status:** Discovery Complete
**Purpose:** Document existing CRM/Dashboard/Settings implementation before consolidation

---

## Executive Summary

**Finding:** CRM/Dashboard infrastructure is **100% complete and functional**. The backend, state management, and UI components are all wired and working. Settings are mostly integrated. User Management is the only piece living outside Canvas.

**Action Required:** Move User Management inside Canvas, create NavigationModelFactory for DRY code, and add client-scoped dashboard.

---

## A. CRM/Dashboard Implementation (COMPLETE ✅)

### Frontend Components

| Component        | Path                                                                                                                      | Status      | Notes                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| CRMDashboard     | [apps/web/src/components/canvas/CRMDashboard.tsx](../apps/web/src/components/canvas/CRMDashboard.tsx)                     | ✅ Complete | Full admin analytics dashboard with metrics cards, charts, top accounts, recent activity, system alerts |
| AccountInspector | [apps/web/src/components/inspector/AccountInspector.tsx](../apps/web/src/components/inspector/AccountInspector.tsx)       | ✅ Complete | Shows account stats (users, nodes, edges), tier badge, actions (Add User)                               |
| CanvasToolbar    | [apps/web/src/components/canvas/CanvasToolbar.tsx:216-229](../apps/web/src/components/canvas/CanvasToolbar.tsx#L216-L229) | ✅ Complete | Dashboard button conditionally shown for non-client accounts                                            |
| CanvasLayout     | [apps/web/src/components/canvas/CanvasLayout.tsx:120-147](../apps/web/src/components/canvas/CanvasLayout.tsx#L120-L147)   | ✅ Complete | Conditional rendering: CRMDashboard for admin, placeholder for client                                   |
| CanvasSidebar    | [apps/web/src/components/canvas/CanvasSidebar.tsx:95-113](../apps/web/src/components/canvas/CanvasSidebar.tsx#L95-L113)   | ✅ Complete | Account tree navigation in CRM mode with multi-select support                                           |

### Backend API

| Route File          | Endpoints   | Status     | Notes                                                       |
| ------------------- | ----------- | ---------- | ----------------------------------------------------------- |
| analytics.routes.ts | 4 endpoints | ✅ Working | `/overview`, `/top-accounts`, `/recent-activity`, `/alerts` |
| admin.routes.ts     | 1 endpoint  | ✅ Working | `POST /accounts` - Create client account with initial user  |
| accounts.routes.ts  | 2 endpoints | ✅ Working | `GET /accounts`, `GET /accounts/:id/stats`                  |
| users.routes.ts     | 3 endpoints | ✅ Working | `GET /:id`, `PATCH /:id`, `DELETE /:id`                     |

**Analytics API Details:**

```typescript
// GET /api/v1/analytics/overview
interface AnalyticsOverview {
  accounts: { active; total_seats; tier_distribution };
  user_activity: { last_7_days; last_30_days; avg_session_time_minutes };
  storage: { total_nodes; total_edges; total_sources; storage_size_bytes };
  processing: { active; completed_today; failed };
  billing: { mrr; churn_rate; customer_ltv };
  system_health: { api_latency_ms; error_rate; uptime_percent };
}

// GET /api/v1/analytics/top-accounts?metric=usage&limit=10
// GET /api/v1/analytics/recent-activity?limit=50
// GET /api/v1/analytics/alerts
```

### State Management

| Context          | Path                                                                                        | Status      | Purpose                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| ShellContext     | [apps/web/src/contexts/ShellContext.tsx](../apps/web/src/contexts/ShellContext.tsx)         | ✅ Complete | Manages `shellMode` (crm/portal) and `canvasMode` (dashboard/settings/canvas/upload/processing) |
| OperatingContext | [apps/web/src/contexts/OperatingContext.tsx](../apps/web/src/contexts/OperatingContext.tsx) | ✅ Complete | Manages `operatingMode` (native/nested/crm) and account switching with headers                  |

**ShellContext States:**

- `shellMode`: 'crm' (admin view) | 'portal' (client view wrapped by admin)
- `canvasMode`: 'dashboard' | 'settings' | 'canvas' | 'upload' | 'processing'

**OperatingContext States:**

- `mode`: 'native' (own account) | 'nested' (portal mode) | 'crm' (viewing as admin)
- `accountId`: Current operating account (may differ from user.accountId)
- Provides headers: `X-Operating-Account`, `X-Operating-Mode`

### Features Implemented

✅ **Admin Features:**

- System-wide analytics dashboard with 6 metric categories
- Top accounts by usage/storage
- Recent activity feed across all accounts
- System alerts and health monitoring
- Account creation workflow
- Multi-select account navigation
- Account inspector with stats
- User creation in any account

✅ **Permission Gating:**

- CRM dashboard button hidden for client accounts
- Account navigation only in CRM shell mode
- Admin-only account creation button
- Account switching with `X-Operating-Account` headers

---

## B. Settings Implementation (MOSTLY INTEGRATED ✅)

### Frontend Components

| Component          | Path                                                                                                                  | Status      | Notes                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| SettingsPage       | [apps/web/src/components/settings/SettingsPage.tsx](../apps/web/src/components/settings/SettingsPage.tsx)             | ✅ Complete | Live preview with Apply/Revert, permission-based editing, unsaved changes tracking |
| SettingsCard       | [apps/web/src/components/settings/SettingsCard.tsx](../apps/web/src/components/settings/SettingsCard.tsx)             | ✅ Complete | Individual setting control rendering                                               |
| SettingsInspector  | [apps/web/src/components/settings/SettingsInspector.tsx](../apps/web/src/components/settings/SettingsInspector.tsx)   | ✅ Complete | Right sidebar for selected setting details                                         |
| DataManagementCard | [apps/web/src/components/settings/DataManagementCard.tsx](../apps/web/src/components/settings/DataManagementCard.tsx) | ✅ Complete | Clear canvas data, admin bulk operations                                           |

### Backend API

| Route File         | Endpoints   | Status     | Notes                                                    |
| ------------------ | ----------- | ---------- | -------------------------------------------------------- |
| settings.routes.ts | 7 endpoints | ✅ Working | GET/PATCH/DELETE settings, schema, validation, changelog |

### Hooks

| Hook            | Path                                                                              | Status      | Purpose                                          |
| --------------- | --------------------------------------------------------------------------------- | ----------- | ------------------------------------------------ |
| useSettings     | [apps/web/src/hooks/useSettings.ts](../apps/web/src/hooks/useSettings.ts)         | ✅ Complete | Settings CRUD, local changes, apply/revert       |
| useSettingsTree | [apps/web/src/hooks/useSettingsTree.ts](../apps/web/src/hooks/useSettingsTree.ts) | ✅ Complete | Build tree from SETTINGS_REGISTRY for navigation |

### Integration Status

✅ **Working:**

- Settings accessible via Canvas mode (toolbar button)
- Settings navigation tree in left sidebar
- Settings cards render in center
- Settings inspector in right sidebar
- Live preview with unsaved changes
- Permission-based editing
- Change history (UI ready, backend TODO)

---

## C. User Management (WRONG LOCATION ❌)

### Current Implementation

| Component    | Path                                                                                        | Status             | Issue                  |
| ------------ | ------------------------------------------------------------------------------------------- | ------------------ | ---------------------- |
| UsersPage    | [apps/web/src/app/users/page.tsx](../apps/web/src/app/users/page.tsx)                       | ❌ Standalone page | Should be in Canvas    |
| EditUserPage | [apps/web/src/app/users/[id]/page.tsx](../apps/web/src/app/users/[id]/page.tsx)             | ❌ Standalone page | Should be Inspector    |
| NewUserPage  | [apps/web/src/app/users/new/page.tsx](../apps/web/src/app/users/new/page.tsx)               | ❌ Standalone page | Should be modal        |
| UserList     | [apps/web/src/components/users/UserList.tsx](../apps/web/src/components/users/UserList.tsx) | ✅ Reusable        | Can reuse in Canvas    |
| UserForm     | [apps/web/src/components/users/UserForm.tsx](../apps/web/src/components/users/UserForm.tsx) | ✅ Reusable        | Can reuse in Inspector |

### Backend API

✅ **Complete** - [apps/api/src/routes/users.routes.ts](../apps/api/src/routes/users.routes.ts)

- `GET /api/v1/users/:id` - Get user by ID
- `PATCH /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user
- `GET /api/v1/accounts/:accountId/users` - List users in account (via accounts.routes.ts)
- `POST /api/v1/accounts/:accountId/users` - Create user (via accounts.routes.ts)

### API Client

✅ **Complete** - [apps/web/src/lib/api-client.ts:1094-1225](../apps/web/src/lib/api-client.ts#L1094-L1225)

- `getAccountUsers(accountId)` - List users
- `getUser(userId)` - Get user
- `createUser(accountId, userData)` - Create user
- `updateUser(userId, updates)` - Update user
- `deleteUser(userId)` - Delete user

### User Journey Issues

❌ **Current Flow (BAD):**

1. User clicks Profile → "Manage Users" (or direct URL `/users`)
2. Full-page navigation to `/users` (loses Canvas context)
3. "Back to Canvas" link at top (jarring UX)
4. Click user → Navigate to `/users/:id` (another full-page nav)
5. Edit form with "Back to Users" link
6. "Back to Canvas" to return

✅ **Desired Flow (GOOD):**

1. User clicks Settings → "Users" section (in nav tree)
2. Center: User list table renders in Canvas
3. Click user → Right Inspector shows UserDetailInspector
4. Edit inline or click "Edit" → Modal or Inspector form
5. No page navigation, seamless UX

---

## D. NavigationBar Mode Sync

### Current Implementation

The [CanvasSidebar.tsx](../apps/web/src/components/canvas/CanvasSidebar.tsx#L73-L113) has 40+ lines determining navigation mode:

```typescript
// Lines 73-113 (BEFORE - needs refactoring)
let navMode: 'groups' | 'accounts' | 'settings' = 'groups';
let navData: TreeNode[] = [];
let navTitle = 'Navigation';
let searchPlaceholder = 'Search...';
let emptyMessage = 'No items';

if (canvasMode === 'settings') {
  navMode = 'settings';
  navTitle = 'Settings';
  searchPlaceholder = 'Search settings...';
  // ... 10 more lines
} else if (shellMode === 'crm' && canvasMode === 'dashboard') {
  navMode = 'accounts';
  navTitle = 'Accounts';
  searchPlaceholder = 'Search accounts...';
  // ... 5 more lines
} else {
  navMode = 'groups';
  navTitle = 'Groups & Folders';
  searchPlaceholder = 'Search groups...';
  // ... 5 more lines
}
```

### Problems

❌ **Issues:**

1. **Not DRY:** Logic duplicated if we add more navigation contexts
2. **Not testable:** Embedded in component, no unit tests
3. **Not extensible:** Hard to add new modes (e.g., "Users" mode)
4. **Not documented:** Implicit rules, no spec

### Solution: NavigationModelFactory

✅ **Desired Pattern:**

```typescript
// AFTER - clean, testable, DRY
const navModel = NavigationModelFactory.get({
  shellMode,
  canvasMode,
  operatingMode: operating.mode,
  user,
  accountTreeData,
  groupsTreeData,
  settingsTreeData,
});

// navModel = {
//   mode: 'settings',
//   title: 'Settings',
//   searchPlaceholder: 'Search settings...',
//   data: settingsTreeData,
//   multiSelect: false,
//   showCreateButton: false,
// }
```

### Mode Matrix (12 Permutations)

| Shell  | Canvas     | Expected NavMode | Expected Data    | Notes                           |
| ------ | ---------- | ---------------- | ---------------- | ------------------------------- |
| CRM    | dashboard  | accounts         | accountTreeData  | Admin viewing accounts          |
| CRM    | canvas     | groups           | groupsTreeData   | Admin in canvas view            |
| CRM    | settings   | settings         | settingsTreeData | Admin in settings               |
| portal | dashboard  | groups           | groupsTreeData   | Admin-as-client (nested portal) |
| portal | canvas     | groups           | groupsTreeData   | Admin-as-client canvas          |
| portal | settings   | settings         | settingsTreeData | Admin-as-client settings        |
| portal | upload     | groups           | groupsTreeData   | Any upload flow                 |
| portal | processing | groups           | groupsTreeData   | Processing view                 |
| CRM    | upload     | groups           | groupsTreeData   | Upload in CRM context           |
| CRM    | processing | groups           | groupsTreeData   | Processing in CRM               |
| portal | (any)      | groups           | groupsTreeData   | Client default                  |
| (any)  | settings   | settings         | settingsTreeData | Settings always wins            |

**Rule Priority:**

1. `canvasMode === 'settings'` → Always show settings tree
2. `shellMode === 'crm' && canvasMode === 'dashboard'` → Show accounts tree
3. **Default:** Show groups tree

---

## E. Tenancy & Permissions (Already Implemented ✅)

### Database Schema

✅ **Multi-tenant isolation via account_id:**

```sql
-- All nodes have account_id
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  properties TEXT NOT NULL,
  account_id TEXT NOT NULL,  -- 🔒 Tenant isolation
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

### Middleware

✅ **[apps/api/src/middleware/auth.middleware.ts](../apps/api/src/middleware/auth.middleware.ts):**

- `requireAuth()` - JWT validation
- `requireAdmin()` - Admin account check
- `requirePermission(level)` - Permission level check
- Operating headers: `X-Operating-Account`, `X-Operating-Mode`

### Permission Levels

| Level  | Permissions                                | Use Case          |
| ------ | ------------------------------------------ | ----------------- |
| junior | Read-only (GET)                            | Viewers, analysts |
| senior | Read + Create (GET, POST)                  | Contributors      |
| leader | Read + Create + Delete (GET, POST, DELETE) | Team leads        |
| admin  | Full access including settings             | Administrators    |

### Account Types

| Type   | Access         | Data Scope                  |
| ------ | -------------- | --------------------------- |
| client | Tenant account | Only own account data       |
| admin  | System account | All accounts (cross-tenant) |

### Account Classes

| Class        | Features   | Tier      |
| ------------ | ---------- | --------- |
| free         | Basic      | Free tier |
| professional | Advanced   | Mid tier  |
| business     | Enterprise | Top tier  |

---

## F. Feature Flags & Environment

### Environment Variables

From [apps/web/.env.local](../apps/web/.env.local):

```bash
NEXT_PUBLIC_API_URL=http://localhost:4001
NEXT_PUBLIC_ENABLE_PRO_FEATURES=false
NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES=false
```

**Note:** No CRM/Dashboard feature flags found. Gating is done via `user.accountType === 'admin'` checks in code.

---

## G. Pre-Consolidation State Snapshot

### File Count

- **CRM/Dashboard:** 5 components ✅
- **Settings:** 6 components + 2 hooks ✅
- **User Management:** 6 components (3 pages, 3 reusable) ❌
- **API Routes:** 5 route files ✅
- **State:** 3 contexts ✅

### Routes Inventory

**Existing Routes:**

```
/canvas              → CanvasLayout (main app shell)
/users               → UsersPage (❌ should be /canvas?mode=settings&section=users)
/users/:id           → EditUserPage (❌ should be Inspector)
/users/new           → NewUserPage (❌ should be modal)
/login               → Login
/register            → Register
/account             → Account settings (deprecated?)
/board/:id           → Board view
/ingest              → Upload UI
```

**API Routes:**

```
/api/v1/analytics/*          ✅
/api/v1/admin/*              ✅
/api/v1/accounts/*           ✅
/api/v1/users/*              ✅
/api/v1/settings/*           ✅
/api/v1/groups/*             ✅
/api/v1/nodes/*              ✅
/api/v1/edges/*              ✅
/api/v1/content/*            ✅
/api/v1/import/*             ✅
```

---

## H. Migration Checklist

### Phase 1: NavigationModelFactory

- [ ] Create `packages/types/src/navigation.model.ts`
- [ ] Implement factory with strategy pattern
- [ ] Write unit tests for all 12 mode permutations
- [ ] Update [CanvasSidebar.tsx](../apps/web/src/components/canvas/CanvasSidebar.tsx#L73-L113)

### Phase 2: User Management

- [ ] Add "Users" section to SETTINGS_REGISTRY
- [ ] Create `UsersListCard.tsx` (table view)
- [ ] Create `UserDetailInspector.tsx` (right sidebar)
- [ ] Update `SettingsPage.tsx` to render UsersListCard
- [ ] Add route redirect `/users` → `/canvas?mode=settings&section=users`
- [ ] Delete old page routes

### Phase 3: Client Dashboard

- [ ] Create `ClientDashboard.tsx` (client-scoped metrics)
- [ ] Add backend endpoint `/api/v1/analytics/client/:accountId`
- [ ] Update [CanvasLayout.tsx](../apps/web/src/components/canvas/CanvasLayout.tsx) conditionals

### Phase 4: Documentation & Testing

- [ ] Create inventory.md (this file)
- [ ] Update README with new navigation patterns
- [ ] Test all 12 navigation permutations manually
- [ ] Test admin-as-client mode
- [ ] Verify permission gating

---

## I. Risk Assessment

### Low Risk ✅

- CRM/Dashboard: Already working, no changes needed
- Settings: Minimal changes, already integrated
- API: No backend changes required

### Medium Risk ⚠️

- NavigationFactory: New abstraction, needs thorough testing
- User Management: Route redirects could break bookmarks

### Mitigation

- Git tags before each major change
- Feature branch with incremental commits
- Unit tests for factory
- Manual testing checklist

---

## J. References

### Documentation

- [README.md](../README.md) - Project overview, auth system
- [AUTH_GUIDE.md](../ai_context/docs_active/AUTH_GUIDE.md) - Auth architecture (if exists)
- [GIT_WORKFLOW.md](../docs/GIT_WORKFLOW.md) - Git conventions

### Key Files

- [ShellContext.tsx](../apps/web/src/contexts/ShellContext.tsx) - Shell/Canvas mode state
- [OperatingContext.tsx](../apps/web/src/contexts/OperatingContext.tsx) - Operating mode state
- [CanvasLayout.tsx](../apps/web/src/components/canvas/CanvasLayout.tsx) - Main app shell
- [CanvasSidebar.tsx](../apps/web/src/components/canvas/CanvasSidebar.tsx) - Navigation sidebar
- [CanvasToolbar.tsx](../apps/web/src/components/canvas/CanvasToolbar.tsx) - Top toolbar
- [CRMDashboard.tsx](../apps/web/src/components/canvas/CRMDashboard.tsx) - Admin dashboard
- [SettingsPage.tsx](../apps/web/src/components/settings/SettingsPage.tsx) - Settings UI

---

**End of Inventory**
**Next Steps:** Proceed with implementation plan
