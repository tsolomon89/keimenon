# Quick Fix Checklist - Canvas Memory OS

**Status:** 🔴 CRITICAL ISSUES FOUND - DO NOT DEPLOY TO PRODUCTION
**Created:** October 17, 2025
**Full Report:** See `AUDIT_FINDINGS.md` for complete details

---

## ⚠️ BLOCKING ISSUES (Fix Before Anything Else)

### 1. Schema Mismatch 🔴 CRITICAL

**Problem:** `schema.sql` missing columns that code expects
**Impact:** Fresh installs will fail immediately
**Time:** 2 hours
**File:** `packages/db/src/sqlite/schema.sql`

**Quick Fix:**

```sql
-- Add to nodes table:
account_id TEXT NOT NULL,
created_by TEXT NOT NULL,
data_tag TEXT DEFAULT 'real',
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE

-- Add to edges table:
account_id TEXT NOT NULL,
created_by TEXT NOT NULL,
data_tag TEXT DEFAULT 'real',
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
```

---

### 2. Conditional Auth Pattern 🔴 SECURITY

**Problem:** 13+ routes apply auth inside handler (race condition)
**Impact:** Data leakage - users can access other accounts' data
**Time:** 6-8 hours
**Files:**

- `apps/api/src/routes/boards.ts`
- `apps/api/src/routes/nodes.ts`
- `apps/api/src/routes/edges.ts`
- `apps/api/src/routes/content.ts`
- `apps/api/src/routes/duplicates.ts`
- `apps/api/src/routes/ingest.ts`
- `apps/api/src/routes/analytics.routes.ts`
- `apps/api/src/routes/search.routes.ts`
- And 5+ more...

**Quick Fix Pattern:**

```typescript
// BEFORE (VULNERABLE):
router.get('/', async (req, res) => {
  if (requireAuth && isolateByAccount) {
    await applyAuthInPromise(); // ❌ Race condition
  }
  const data = await query();
});

// AFTER (SECURE):
const router = Router();
router.use(requireAuth(authService)); // ✅ Applied to ALL routes
router.use(isolateByAccount); // ✅ Before any handler runs

router.get('/', async (req, res) => {
  // req.user GUARANTEED to exist
  const data = await query();
});
```

---

### 3. Cross-Account Deletion Bug 🔴 PRIVILEGE ESCALATION

**Problem:** Admin can delete other admins' client data
**Impact:** Unauthorized data deletion
**Time:** 1.5 hours
**File:** `apps/api/src/routes/data-management.ts` line 137-234

**Quick Fix:**

```typescript
// BEFORE:
const clientAccounts = db
  .prepare(
    `
  SELECT DISTINCT account_id FROM nodes WHERE account_id != ?
`
  )
  .all(adminAccountId);

// AFTER:
const clientAccounts = db
  .prepare(
    `
  SELECT DISTINCT al.client_account_id
  FROM account_links al
  WHERE al.admin_account_id = ?
`
  )
  .all(adminAccountId);
```

---

### 4. File Upload Auth Bypass 🔴 SECURITY

**Problem:** Files uploaded before auth check
**Impact:** Unauthenticated file uploads, DoS attacks
**Time:** 1 hour
**File:** `apps/api/src/routes/ingest.ts` line 61-75

**Quick Fix:**

```typescript
// BEFORE:
router.post('/files',
  upload.array('files', 10), // ❌ Runs FIRST
  async (req, res) => {
    if (requireAuth) await applyAuth();
  }
);

// AFTER:
router.post('/files',
  requireAuth(authService),     // ✅ Auth FIRST
  isolateByAccount,             // ✅ Then isolation
  upload.array('files', 10),    // ✅ THEN upload
  async (req, res) => { ... }
);
```

---

### 5. Canvas Store Account Switch Leak 🟠 HIGH

**Problem:** Previous account's data remains in store after switching
**Impact:** User sees cross-account data (reported by user)
**Time:** 2 hours
**Files:**

- `apps/web/src/contexts/AuthContext.tsx`
- `apps/web/src/store/canvasStore.ts`

**Quick Fix:**

```typescript
// AuthContext.tsx - Add to account switch logic
const switchAccount = useCallback(
  async (newAccountId: string) => {
    const newToken = await generateToken(newAccountId);
    setUser(newUser);

    // ✅ Clear canvas store when account changes
    useCanvasStore.getState().reset();

    router.push('/canvas');
  },
  [router]
);
```

---

## 📋 Quick Test Checklist

After implementing fixes, verify:

```bash
# 1. Schema Fix Verification
cd apps/api
# Delete test database and recreate
rm test.db
npm test import-enhanced  # Should initialize fresh DB successfully

# 2. Auth Middleware Verification
# Manual test: Try accessing /api/v1/nodes without token
curl http://localhost:4001/api/v1/nodes
# Expected: 401 Unauthorized (not 200 with empty data)

# 3. Multi-Tenancy Verification
# Create test script or use existing tests:
npm test -- -t "tenant isolation"

# 4. Canvas Store Verification
# Manual test in browser:
# 1. Login as Tim → Import data → Note selected node in inspector
# 2. Logout
# 3. Login as Jack
# 4. Inspector should be EMPTY (no Tim's data showing)
```

---

## 🎯 Priority Order

**Week 1 (11-13 hours):**

1. Schema sync (2h)
2. Auth middleware refactor (6-8h)
3. Data management security (1.5h)
4. File upload ordering (1h)

**Week 2 (10-12 hours):** 5. Canvas store account switch (2h) 6. Transaction wrapping (2h) 7. Multi-tenancy tests (4-5h) 8. Rate limiting (1.5h) 9. FTS schema fix (30min)

**Week 3 (Optional - 6-8 hours):** 10. Database indexes (2h) 11. Error boundaries (2h) 12. Additional test coverage (2-3h) 13. Documentation updates (1h)

---

## ✅ Current Progress (Already Completed)

- ✅ Fixed `created_by` SQL error in admin.routes.ts
- ✅ Populated account_links table (Migration 005)
- ✅ Added comprehensive debug logging to import pipeline
- ✅ Fixed FTS schema in database (Migration 003)
- ✅ Fixed UNIQUE constraint error (INSERT OR REPLACE)
- ✅ Added canvas store reset on logout
- ✅ Restarted servers with clean state

---

## 🚫 DO NOT START UNTIL PHASE 1 COMPLETE

- ❌ Phase 2 Memberships Model Migration
- ❌ New feature development
- ❌ Production deployment
- ❌ Main branch merge

---

## 📞 Need Help?

**Full Audit Report:** `AUDIT_FINDINGS.md`
**Test Documentation:** `apps/api/src/__tests__/README.md`
**Architecture Docs:** `ai_context/docs_active/`

---

**Last Updated:** October 17, 2025
**Next Review:** After Phase 1 completion
