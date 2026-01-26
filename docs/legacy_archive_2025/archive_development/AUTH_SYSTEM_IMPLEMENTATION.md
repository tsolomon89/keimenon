# Multi-Tenant Auth System Implementation Progress

**Date Started**: October 12, 2025
**Status**: Phase 1 - Database Schema (In Progress)

## Summary

Implementing a comprehensive multi-tenant authentication and authorization system for Canvas Memory OS. The system will support:

- Admin accounts (system-level access)
- Client accounts (isolated tenants)
- Multiple users per account
- Permission levels (junior, senior, leader, admin)
- Google OAuth for clients
- Email/password for admin

## Completed Work

### Session 1 (Earlier Today)

1. ✅ **Phase 1.1: Connected Canvas to Backend**
   - Added `getNodes()`, `getEdges()`, `getNode()` API functions
   - Enhanced canvas store with `loadGraphData()`
   - Updated Canvas page to fetch data on mount
   - Replaced CanvasViewport placeholder with actual Canvas2D
   - Fixed edge filtering bug (nodes not found)
   - **Result**: Graph visualization now working with real database data!

2. ✅ **Created Implementation Plan**
   - Comprehensive 3-week plan for auth system
   - Database schema design
   - API routes specification
   - Frontend pages and components
   - Permission matrix
   - Account class features (Free/Pro/Business)

## Current Task

### Phase 1: Database Schema

Need to update `packages/db/src/sqlite/client.ts` SQLITE_SCHEMA constant to add:

```sql
-- Auth Tables (ADD TO SCHEMA)

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK(account_type IN ('admin', 'client')),
  account_class TEXT NOT NULL CHECK(account_class IN ('free', 'professional', 'business')),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  settings TEXT, -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  google_id TEXT UNIQUE,
  user_class TEXT NOT NULL CHECK(user_class IN ('person', 'agent')) DEFAULT 'person',
  permission_level TEXT NOT NULL CHECK(permission_level IN ('junior', 'senior', 'leader', 'admin')) DEFAULT 'admin',
  password_hash TEXT, -- Only for admin@admin.com
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_login INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Indexes for auth tables
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
```

## Next Steps (In Order)

### 1. Update Database Schema

**File**: `packages/db/src/sqlite/client.ts`

- Add auth tables to SQLITE_SCHEMA constant (after schema_metadata table)
- Add account_id and created_by columns to nodes and edges tables

### 2. Create Migration Script

**File**: `packages/db/src/migrations/001_seed_admin.ts` (new file)

```typescript
// Seed admin account with bcrypt hash
// Admin user with email: admin@admin.com, password: any (validates all)
```

### 3. Install Auth Dependencies

```bash
cd apps/api
npm install jsonwebtoken bcrypt passport passport-google-oauth20
npm install -D @types/jsonwebtoken @types/bcrypt @types/passport
```

### 4. Create Auth Service

**File**: `apps/api/src/services/auth.ts` (new)

- JWT token generation/verification
- Password hashing/validation (bcrypt)
- Session management
- Google OAuth integration

### 5. Create Auth Middleware

**Files**: `apps/api/src/middleware/` (new directory)

- `auth.ts` - requireAuth, verifyToken
- `permissions.ts` - requireAdmin, requirePermission, isolateByAccount

### 6. Create Auth API Routes

**Files**: `apps/api/src/routes/` (new files)

- `auth.ts` - login, register, logout, /me, google
- `accounts.ts` - CRUD accounts, toggle class
- `users.ts` - CRUD users, permissions
- `data.ts` - stats, clear, audit

### 7. Update Existing Routes

**Files to modify**: All route files

- Add middleware: `requireAuth`, `isolateByAccount`
- Filter queries by `req.account.id`
- Set `account_id` and `created_by` on creates

### 8. Create Frontend Auth Context

**File**: `apps/web/src/contexts/AuthContext.tsx` (new)

```typescript
{
  (user, account, isAdmin, login, logout, register, hasPermission, impersonate);
}
```

### 9. Update Login Page

**File**: `apps/web/src/app/login/page.tsx`

- Check email input
- If admin@admin.com → password field
- Else → "Sign in with Google" button

### 10. Create Register Page

**File**: `apps/web/src/app/register/page.tsx` (new)

- Google OAuth flow
- Account info form
- User info form
- Account class selector

### 11. Create Settings Pages

**Files**: `apps/web/src/app/settings/` (new directory)

- `account/page.tsx` - Account details, data stats
- `users/page.tsx` - User management table

### 12. Create Admin Dashboard

**Files**: `apps/web/src/app/admin/` (new directory)

- `page.tsx` - List of all client accounts
- `accounts/[id]/page.tsx` - Account detail view

## Data Model Summary

```
Account (1) ←─┐
              ├─→ User (N)
              │
              └─→ Node (N)
              └─→ Edge (N)
              └─→ Session (N)

Permissions:
  junior < senior < leader < admin

Account Types:
  admin: Can view all accounts, toggle classes
  client: Can only view own account

Account Classes:
  free: 1 user, 1K nodes, 10MB
  professional: 5 users, 50K nodes, 1GB
  business: Unlimited everything
```

## Key Features

1. **Admin Account**
   - Email: admin@admin.com
   - Password: ANY (always validates)
   - Can toggle between classes to test features
   - Can view all client accounts
   - Can impersonate clients for debugging

2. **Client Signup**
   - Google OAuth required
   - Select account class (Free/Pro/Business)
   - Creates account + first user (admin permission)

3. **Data Isolation**
   - All queries filtered by account_id
   - Middleware enforces automatically
   - Admin can bypass to view all

4. **Multi-User Support**
   - Accounts can have many users
   - Permission levels control access
   - User classes: person (human) or agent (AI)

## Testing Plan

Once implementation complete:

- [ ] Admin login works with any password
- [ ] Client register flow with Google OAuth
- [ ] User CRUD operations
- [ ] Permission levels enforce correctly
- [ ] Data isolation (can't see other accounts)
- [ ] Admin can view all accounts
- [ ] Admin can toggle account classes
- [ ] Clear data keeps users
- [ ] Session expiry works

## Files to Create (~25 new files)

```
packages/db/src/
  └── migrations/001_seed_admin.ts

apps/api/src/
  ├── middleware/
  │   ├── auth.ts
  │   └── permissions.ts
  ├── services/
  │   ├── auth.ts
  │   └── permissions.ts
  └── routes/
      ├── auth.ts
      ├── accounts.ts
      ├── users.ts
      └── data.ts

apps/web/src/
  ├── contexts/
  │   └── AuthContext.tsx
  ├── app/
  │   ├── register/page.tsx
  │   ├── settings/
  │   │   ├── account/page.tsx
  │   │   └── users/page.tsx
  │   └── admin/
  │       ├── page.tsx
  │       └── accounts/[id]/page.tsx
  ├── components/
  │   ├── auth/
  │   │   ├── ProtectedRoute.tsx
  │   │   └── GoogleAuthButton.tsx
  │   └── settings/
  │       ├── InviteUserModal.tsx
  │       ├── DataStatsCard.tsx
  │       └── UserTable.tsx
  └── lib/
      └── auth-client.ts
```

## Files to Modify (~15 files)

- packages/db/src/sqlite/client.ts (schema)
- apps/api/src/routes/\*.ts (all routes - add auth)
- apps/web/src/app/login/page.tsx
- apps/web/src/app/canvas/page.tsx (add account context)
- apps/web/src/components/canvas/CanvasHeader.tsx (add user menu)

## Estimated Timeline

- **Week 1**: Backend (schema, auth service, API routes)
- **Week 2**: Frontend (pages, context, components)
- **Week 3**: Integration, testing, polish
- **Total**: ~120 hours over 3 weeks

---

**Next Session**: Start with updating the database schema in `packages/db/src/sqlite/client.ts`
