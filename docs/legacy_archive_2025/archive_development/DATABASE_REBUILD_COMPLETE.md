# Database Rebuild Complete

## Status: ✅ SUCCESS

All database errors have been resolved through a complete schema rebuild.

## What Was Done

### 1. Root Cause Analysis

- Multiple 500 Internal Server Errors from settings and analytics endpoints
- Error: "no such table: settings_config", "no such table: audit_log"
- Error: "no such column: users.account_id" (renamed to deprecated_account_id by migration 013)
- Missing columns in accounts table (require_account_password, etc.)

### 2. Solution: Clean M:N Schema from Day 1

**User Decision:** Complete database wipe and fresh start with clean Many-to-Many architecture

### 3. Implementation Steps

#### Disabled Migration System

- **File:** `apps/api/src/index.ts:491-496`
- Commented out `MigrationRunner` to prevent applying incremental migrations
- Schema now defined entirely in embedded SQL constant

#### Created Clean Unified Schema

- **File:** `packages/db/src/sqlite/client.ts`
- **Schema Version:** 3.0
- **Features:** clean_m2n_schema,audit_log,settings,jobs

**Key Schema Changes:**

- `users` table: NO `account_id` column (never had one from start)
- `user_accounts` junction table: Mediates M:N relationship
- `accounts` table: Added columns from migration 013:
  - account_password_hash
  - require_account_password
  - allow_email_invites
  - max_members
  - visibility
  - join_code
  - owner_user_id
  - created_from_template
- `sessions` table: Added columns from migration 013:
  - operating_account_id
  - available_accounts
  - last_account_switch
  - ip_address
  - user_agent
  - last_active
- `audit_log` table: Added (was missing)
- `settings_config` and `settings_changes` tables: Added (were missing)
- `jobs`, `job_events`, `job_items` tables: Complete unified jobs system

#### Fixed Code to Use M:N Schema

- **`apps/api/src/routes/analytics.routes.ts`**: Updated queries to use `user_accounts` junction table
- **`apps/api/src/routes/accounts.routes.ts`**: Fixed user listing and creation for M:N model
- **`apps/api/src/routes/admin.routes.ts`**: Fixed account creation to insert into both tables

#### Created Bootstrap Script

- **File:** `bootstrap-clean-db.mjs`
- Uses compiled dist folder (avoids tsx caching issues)
- Verifies schema before creating super admin
- Creates admin account, user, and membership in one transaction

### 4. Testing Results

All endpoints now working:

✅ **Login:** `/api/v1/auth/login`

```json
{
  "user": {...},
  "account": {...},
  "token": "...",
  "membership": {...}
}
```

✅ **Settings:** `/api/v1/settings`

```json
{
  "success": true,
  "settings": {...}
}
```

✅ **Analytics Recent Activity:** `/api/v1/analytics/recent-activity`

```json
{
  "activity": []
}
```

✅ **Analytics Top Accounts:** `/api/v1/analytics/top-accounts`

```json
{
  "accounts": []
}
```

## Super Admin Credentials

**Email:** admin@admin.com
**Password:** 123456

⚠️ **WARNING:** This is for development only. Change before production.

## Database Location

`%USERPROFILE%\.canvas-memory\canvas.db` (Windows)
`~/.canvas-memory/canvas.db` (Unix/Mac)

## Schema Verification

```bash
# Check users table (should NOT have deprecated_account_id or account_id)
npx tsx -e "import Database from 'better-sqlite3'; const db = new Database(process.env.HOME + '/.canvas-memory/canvas.db'); const cols = db.prepare('PRAGMA table_info(users)').all(); console.table(cols); db.close();"

# Check accounts table (should have 15 columns including require_account_password)
npx tsx -e "import Database from 'better-sqlite3'; const db = new Database(process.env.HOME + '/.canvas-memory/canvas.db'); const cols = db.prepare('PRAGMA table_info(accounts)').all(); console.log('Total columns:', cols.length); db.close();"

# Check user_accounts junction table exists
npx tsx -e "import Database from 'better-sqlite3'; const db = new Database(process.env.HOME + '/.canvas-memory/canvas.db'); const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"user_accounts\"').all(); console.log(tables.length > 0 ? '✅ user_accounts exists' : '❌ Missing user_accounts'); db.close();"
```

## Future Database Resets

To recreate the database from scratch:

```bash
# 1. Stop API server
# 2. Delete database
rm ~/.canvas-memory/canvas.db*

# 3. Recreate with clean schema
node bootstrap-clean-db.mjs

# 4. Start API server
cd apps/api && PORT=4001 npm run dev
```

## Architecture Notes

- **Local-first:** Database stored locally, no cloud sync by default
- **M:N User-Account Model:** Users can belong to multiple accounts with different roles
- **No Legacy Columns:** No `deprecated_account_id`, no migration artifacts
- **Single Source of Truth:** Schema defined in `packages/db/src/sqlite/client.ts:13-305`
- **Version:** Schema 3.0 with clean M:N from day 1

## Files Modified

1. `packages/db/src/sqlite/client.ts` - Clean unified schema
2. `apps/api/src/index.ts` - Disabled migrations
3. `apps/api/src/routes/analytics.routes.ts` - M:N queries
4. `apps/api/src/routes/accounts.routes.ts` - M:N user management
5. `apps/api/src/routes/admin.routes.ts` - M:N account creation
6. `scripts/create-super-admin.ts` - Import from dist folder
7. `bootstrap-clean-db.mjs` - New bootstrap script (recommended)

## Next Steps

1. ✅ Database rebuilt with clean schema
2. ✅ All endpoints tested and working
3. ⏳ Frontend testing recommended
4. ⏳ Consider removing old migration files in `packages/db/src/sqlite/migrations/`
5. ⏳ Update documentation to reflect M:N architecture

---

**Completed:** October 20, 2025
**Database Version:** 3.0
**Schema Features:** clean_m2n_schema,audit_log,settings,jobs
