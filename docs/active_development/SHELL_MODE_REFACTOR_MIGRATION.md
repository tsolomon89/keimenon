# ShellMode Refactor Migration Guide

**Date**: 2025-10-22
**Version**: 1.0
**Status**: Complete

---

## Executive Summary

The ShellMode refactor simplifies the application architecture by:

1. **Renaming shell modes** to match account types (`'crm'/'portal'` → `'admin'/'client'`)
2. **Locking shell mode** to user's accountType (no manual switching)
3. **Consolidating dashboard** to use one component for all users (API handles data scoping)
4. **Adding 'auth' CanvasMode** type (for future flexibility, not yet implemented)

---

## Breaking Changes

### 1. ShellMode Values Changed

**OLD:**

```typescript
type ShellMode = 'crm' | 'portal';
```

**NEW:**

```typescript
type ShellMode = 'admin' | 'client';
```

**Impact:**

- All code referencing `'crm'` now uses `'admin'`
- All code referencing `'portal'` now uses `'client'`
- Tests updated to use new values

**Files Modified:**

- `packages/types/src/navigation.model.ts`
- `apps/web/src/contexts/ShellContext.tsx`
- `apps/web/src/components/canvas/CanvasLayout.tsx`
- `apps/web/src/components/canvas/CanvasSidebar.tsx`
- `apps/web/src/components/canvas/CanvasToolbar.tsx`
- `apps/web/src/test/test-utils.tsx`
- `packages/types/src/navigation.model.test.ts`

### 2. ShellMode Now Locked to AccountType

**OLD Behavior:**

```typescript
// Users could manually switch shells
setShellMode('crm'); // Admin or client could access CRM mode
setShellMode('portal'); // Both could access portal mode
```

**NEW Behavior:**

```typescript
// ShellMode automatically determined by user.accountType
// Admin accounts → shellMode: 'admin' (locked)
// Client accounts → shellMode: 'client' (locked)

setShellMode('admin'); // Logs warning, does nothing (no-op)
```

**Rationale:**

- Simpler UX (no shell switcher UI needed)
- Clearer permissions (shell matches account type)
- Better data scoping (enforced at API layer)

**Impact:**

- Shell switcher UI removed/disabled
- `setShellMode()` function is now a no-op (kept for API compatibility)
- ShellMode automatically syncs with `user.accountType` on login

### 3. CanvasMode Values Updated

**OLD:**

```typescript
type CanvasMode = 'dashboard' | 'settings' | 'canvas' | 'upload' | 'processing';
```

**NEW:**

```typescript
type CanvasMode = 'auth' | 'dashboard' | 'settings' | 'canvas';
```

**Changes:**

- **Added**: `'auth'` (for future auth integration, currently unused)
- **Removed**: `'upload'`, `'processing'` (unused values)

**Impact:**

- TypeScript will catch any references to removed values
- Auth remains as separate routes (`/login`, `/register`) for now

### 4. Dashboard Consolidated

**OLD:**

```typescript
{shellMode === 'admin' ? (
  <CRMDashboard />  // Admin-specific dashboard
) : (
  <ClientDashboard />  // Separate client dashboard
)}
```

**NEW:**

```typescript
{canvasMode === 'dashboard' && (
  <CRMDashboard />  // Works for both admin and client
)}
```

**Why:**

- **API already handles data scoping** based on `req.user.accountType`
- Admin users: API returns system-wide data (all accounts)
- Client users: API returns filtered data (own account only)
- **One component, different data** - simpler architecture

**Impact:**

- Removed placeholder client dashboard
- `CRMDashboard` component now serves all users
- (Optional) Can rename to just `Dashboard` in future

---

## Migration Checklist

### For Developers

- [ ] Pull latest code from `feature/shell-mode-refactor` branch
- [ ] Run `npm install` (no new dependencies, just ensure consistency)
- [ ] Run tests: `npm test`
- [ ] Test login flow:
  - [ ] Admin user → `shellMode === 'admin'`
  - [ ] Client user → `shellMode === 'client'`
- [ ] Test dashboard:
  - [ ] Admin sees all accounts data
  - [ ] Client sees own account data
- [ ] Verify navigation:
  - [ ] Admin + dashboard → Accounts Tree
  - [ ] Client + canvas → Groups Tree
- [ ] Check inspector buttons:
  - [ ] "View Canvas" button in AccountInspector
  - [ ] "View Canvas" button in UserDetailInspector

### For QA/Testing

**Test Scenarios:**

1. **Admin User Login**

   ```
   Login as admin@admin.com
   → Expect: shellMode = 'admin'
   → Expect: canvasMode = 'dashboard' (default)
   → Verify: Dashboard shows all accounts
   → Verify: Left sidebar shows Accounts Tree
   ```

2. **Client User Login**

   ```
   Login as client@example.com
   → Expect: shellMode = 'client'
   → Expect: canvasMode = 'canvas' (default)
   → Verify: Dashboard shows own data only
   → Verify: Left sidebar shows Groups Tree
   ```

3. **Shell Mode Locking**

   ```
   Try to manually change shellMode (dev console)
   → Expect: Console warning logged
   → Expect: shellMode does not change
   ```

4. **Inspector Buttons**

   ```
   Admin: Select account in dashboard
   → Verify: AccountInspector shows "View Canvas" button
   → Click button → Expect: Switch to canvas mode

   Admin: Select user in dashboard
   → Verify: UserDetailInspector shows "View Canvas" button
   → Click button → Expect: Switch to canvas mode
   ```

---

## Why This Change?

### Before (Problems)

1. **Confusing naming**: 'crm' vs 'portal' didn't clearly map to account types
2. **Unnecessary flexibility**: Shell switching allowed but rarely used
3. **Duplicate dashboards**: Admin and client dashboards would diverge over time
4. **UI complexity**: Shell switcher UI was extra maintenance burden

### After (Benefits)

1. **Clear naming**: `shellMode === accountType` (admin/client)
2. **Simplified logic**: No shell switching code, fewer edge cases
3. **Single dashboard**: API handles scoping, one component for all
4. **Better maintainability**: Fewer components, clearer responsibilities

---

## API Impact

### ✅ No Backend Changes Required

The backend already implements proper data scoping:

**analytics.routes.ts (lines 51-53):**

```typescript
const isAdmin = req.user?.accountType === 'admin';
const isSystemWideView = isAdmin && !req.operating;
// Admin users get all data, clients get filtered data
```

**nodes.ts, edges.ts, etc:**

```typescript
const accountFilter =
  req.user && req.user.accountType !== 'admin' ? `AND nodes.account_id = ?` : '';
// Client queries automatically filtered by account_id
```

**Key Point:** The API has always scoped data by `accountType`. The frontend refactor just simplifies the UI to match this reality.

---

## Rollback Plan

If critical issues are found:

1. **Git Revert:**

   ```bash
   git revert <commit-hash>  # Revert the refactor commit
   ```

2. **Manual Rollback:**
   - Restore `ShellMode = 'crm' | 'portal'`
   - Restore `CanvasMode` old values
   - Re-add shell switcher UI
   - Restore `shellMode === 'crm'` conditionals
   - Revert test file changes

3. **Database:** No database changes made - rollback is code-only

---

## Known Issues / Limitations

### 1. Shell Mode Display Labels

The `SHELL_MODE_LABELS` now shows:

- `admin: 'Admin'` (previously 'Manager')
- `client: 'Client'` (previously 'Portal')

**Impact:** UI text changed from "Manager" to "Admin"

**Future:** If we want to keep "Manager" branding, update labels while keeping type values as 'admin'/'client'

### 2. Auth CanvasMode Not Implemented

The `'auth'` CanvasMode type exists but is not used:

- Login/register remain as separate routes
- Future: Could integrate auth into CanvasLayout for seamless UX

### 3. CRMDashboard Component Name

The component is still named `CRMDashboard` even though it now serves all users.

**Future:** Rename to just `Dashboard` for clarity (non-breaking change)

---

## FAQ

### Q: Can users still switch between views?

**A:** Yes! Users can switch between **CanvasMode** values:

- Dashboard (`canvasMode = 'dashboard'`)
- Canvas (`canvasMode = 'canvas'`)
- Settings (`canvasMode = 'settings'`)

What changed is **ShellMode** is now locked to accountType.

### Q: Will client users see less functionality?

**A:** No. Client users can still access dashboard, canvas, and settings. The API returns data scoped to their account automatically.

### Q: Do we need to update the API?

**A:** No. The API already implemented proper data scoping by `accountType`. This refactor just simplifies the frontend to match.

### Q: What about multi-account users?

**A:** Multi-account users work the same way:

- When they switch accounts, `accountType` updates
- ShellMode automatically syncs to the new account's type
- Dashboard shows data for the active account

### Q: Can we still add a shell switcher in the future?

**A:** Yes, but it's not recommended. The current approach (shell = accountType) is simpler and clearer. If needed, we can re-add switching, but would need to update the locking logic in `ShellContext.tsx`.

---

## Related Documentation

- [SHELL_MODE_AND_ACCOUNT_TYPES.md](./SHELL_MODE_AND_ACCOUNT_TYPES.md) - Complete architecture explanation
- [COMPONENT_TREE_AUDIT.md](./COMPONENT_TREE_AUDIT.md) - Component wiring and hierarchy
- [docs/inventory.md](../inventory.md) - Overall system documentation

---

## Timeline

- **Started**: 2025-10-22
- **Completed**: 2025-10-22
- **Merged to main**: TBD
- **Deployed**: TBD

---

**Questions?** Contact the development team or review the code changes in the `feature/shell-mode-refactor` branch.
