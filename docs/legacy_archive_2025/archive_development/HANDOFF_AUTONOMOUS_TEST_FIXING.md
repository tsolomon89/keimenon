# Autonomous Test Failure Resolution - Handoff Document

**Date**: 2025-11-06
**Status**: 100% smoke tests passing, feature-incomplete tests failing
**Task**: Autonomously implement missing features to resolve test failures

---

## Context: What's Been Achieved

### ✅ CRITICAL FIXES COMPLETED (All 4 Working)

**CRITICAL FIX #5**: Exponential backoff retry for file deletion on Windows
**CRITICAL FIX #6**: Fixed fixture inheritance chain (test.ts → test-isolation.ts)
**CRITICAL FIX #7**: Login retry logic for Worker 0 race condition
**CRITICAL FIX #8**: Database connection closure before snapshot restore

**Result**: Smoke tests achieve 100% pass rate (14/14) with zero file locking errors

### 📊 Current Test Status

**Passing (100%)**:

- `smoke.spec.ts` (4/4)
- `keimenon-operations.spec.ts` (3/3)
- `flow-auth-keimenon.spec.ts` (4/4)
- `settings-navigation.spec.ts` (3/3)

**Failing (Feature Incomplete)**:

- `auth-account-switching.spec.ts` (0/11) - Missing account switching features
- Other tests with missing endpoints/features

---

## Your Mission: Autonomous Feature Implementation

**DO NOT** modify test files or skip tests. **DO** implement the missing features that tests require.

### Primary Objective

Analyze failing tests → Identify missing features → Implement features → Verify tests pass

### Available Tools & Resources

#### 🔧 MCP Servers (6 Total)

1. **keimenon-database** - Query nodes/edges, inspect schema, search content

   ```
   mcp__keimenon-database__query_nodes
   mcp__keimenon-database__query_edges
   mcp__keimenon-database__inspect_schema
   mcp__keimenon-database__get_stats
   mcp__keimenon-database__search_content
   ```

2. **keimenon-docs** - Search documentation, find related docs, extract TODOs

   ```
   mcp__keimenon-docs__search_docs
   mcp__keimenon-docs__find_related
   mcp__keimenon-docs__list_todos
   mcp__keimenon-docs__get_architecture_info
   mcp__keimenon-docs__read_doc
   ```

3. **keimenon-api-testing** - Test endpoints, CRUD lifecycle, multi-tenant isolation

   ```
   mcp__keimenon-api-testing__login
   mcp__keimenon-api-testing__test_endpoint
   mcp__keimenon-api-testing__test_crud
   mcp__keimenon-api-testing__test_multi_tenant
   mcp__keimenon-api-testing__test_import
   mcp__keimenon-api-testing__test_permissions
   mcp__keimenon-api-testing__create_test_account
   mcp__keimenon-api-testing__cleanup_test_data
   ```

4. **keimenon-chat-import** - Import test datasets, verify results

   ```
   mcp__keimenon-chat-import__list_test_datasets
   mcp__keimenon-chat-import__get_test_dataset
   mcp__keimenon-chat-import__import_test_dataset
   mcp__keimenon-chat-import__verify_import_results
   ```

5. **keimenon-settings-crm** - User/account management, memberships

   ```
   mcp__keimenon-settings-crm__list_users
   mcp__keimenon-settings-crm__get_user_details
   mcp__keimenon-settings-crm__list_accounts
   mcp__keimenon-settings-crm__get_account_details
   mcp__keimenon-settings-crm__query_user_account_memberships
   ```

6. **playwright-e2e** - Run tests, debug failures, list tests
   ```
   mcp__playwright-e2e__pw_listTests
   mcp__playwright-e2e__pw_run
   mcp__playwright-e2e__pw_lastFailures
   mcp__playwright-e2e__app_start
   mcp__playwright-e2e__app_stop
   mcp__playwright-e2e__app_health
   ```

#### 🎯 Specialized Skills (6 Total)

1. **code-review-enforcer** - Review changes for graph-native patterns, schema compliance
2. **e2e-test-generator** - Generate Playwright tests following project patterns
3. **graph-schema-validator** - Validate node/edge operations against schemas
4. **mcp-integration-expert** - Orchestrate multi-server workflows
5. **pipeline-verifier** - Validate complete feature pipeline (backend → frontend → E2E)
6. **vector-similarity-ops** - Similarity detection, deduplication logic

---

## Autonomous Workflow: Step-by-Step

### Phase 1: Analysis (Use MCP Servers)

1. **Identify Failing Tests**

   ```bash
   npm run e2e:chromium
   ```

   Or use `mcp__playwright-e2e__pw_lastFailures` to get detailed failure info

2. **Read Failing Test File**
   Example: `tests/e2e/auth-account-switching.spec.ts`

   Understand what the test expects:
   - Which endpoints does it call?
   - What data structures does it use?
   - What behavior is it testing?

3. **Search Documentation**

   ```javascript
   mcp__keimenon - docs__search_docs({ query: 'account switching' });
   mcp__keimenon - docs__find_related({ topic: 'authentication' });
   mcp__keimenon - docs__get_architecture_info({ category: 'api' });
   ```

4. **Check Current Implementation**

   ```javascript
   // Find related endpoints
   Grep('switch-account', 'apps/api/src/routes');

   // Check database schema
   mcp__keimenon - database__inspect_schema({ table_name: 'accounts' });

   // List existing users/accounts
   mcp__keimenon - settings - crm__list_accounts();
   ```

### Phase 2: Implementation Planning

1. **Create Implementation Plan**
   Use TodoWrite to track tasks:

   ```javascript
   TodoWrite({
     todos: [
       { content: 'Analyze test requirements', status: 'in_progress', activeForm: '...' },
       { content: 'Design account switching API', status: 'pending', activeForm: '...' },
       {
         content: 'Implement POST /api/v1/auth/switch-account',
         status: 'pending',
         activeForm: '...',
       },
       { content: 'Add multi-account support to JWT', status: 'pending', activeForm: '...' },
       { content: 'Validate with E2E tests', status: 'pending', activeForm: '...' },
     ],
   });
   ```

2. **Review Existing Patterns**

   ```javascript
   // Find similar implementations
   Grep('POST.*auth.*login', 'apps/api/src/routes', { output_mode: 'files_with_matches' });

   // Read existing auth routes
   Read('apps/api/src/routes/auth.routes.ts');

   // Check authentication middleware
   Read('apps/api/src/middleware/auth.middleware.ts');
   ```

3. **Validate Schema Requirements**

   ```javascript
   // Use graph-schema-validator skill
   Skill({ command: 'graph-schema-validator' });

   // Check if AccountNode schema exists
   Read('ai_context/schemas/AccountNode.json');
   ```

### Phase 3: Feature Implementation

1. **Backend API Implementation**

   **Pattern to Follow**:
   - Create route handler in `apps/api/src/routes/auth.routes.ts`
   - Add authentication middleware
   - Validate account ownership (CRITICAL SECURITY)
   - Update JWT token with new account_id
   - Return new token

   **Example Structure**:

   ```typescript
   router.post('/switch-account', requireAuth, async (req: Request, res: Response) => {
     const { account_id } = req.body;
     const user_id = req.user?.user_id;

     // CRITICAL: Verify user owns this account
     // Query user_account_memberships
     // Generate new JWT with account_id
     // Return { token, account }
   });
   ```

2. **Database Operations**

   Use existing patterns from `apps/api/src/services/auth.service.ts`:

   ```typescript
   // Query user-account relationship
   const membership = await db.execute(
     `
     SELECT * FROM user_account_memberships
     WHERE user_id = ? AND account_id = ?
   `,
     [user_id, account_id]
   );
   ```

3. **Frontend Integration** (If Required)

   Check if frontend components exist:

   ```bash
   Glob("**/*AccountSelector*.tsx", "apps/web/src")
   ```

   If missing, create component following project patterns

### Phase 4: Testing & Validation

1. **Test Endpoint via MCP**

   ```javascript
   // Login first
   mcp__keimenon -
     api -
     testing__login({
       email: 'admin@admin.com',
       password: 'TestPass123!',
     });

   // Test switch endpoint
   mcp__keimenon -
     api -
     testing__test_endpoint({
       path: '/auth/switch-account',
       method: 'POST',
       body: { account_id: 'acc_test_123' },
       expect_status: 200,
     });
   ```

2. **Run E2E Tests**

   ```javascript
   mcp__playwright -
     e2e__pw_run({
       grep: 'auth-account-switching',
       project: 'chromium',
     });
   ```

3. **Validate Multi-Tenant Isolation**
   ```javascript
   mcp__keimenon -
     api -
     testing__test_multi_tenant({
       account_a_email: 'user1@test.com',
       account_a_password: 'pass1',
       account_b_email: 'user2@test.com',
       account_b_password: 'pass2',
       test_resource: 'nodes',
     });
   ```

### Phase 5: Pipeline Verification

1. **Use pipeline-verifier Skill**

   ```javascript
   Skill({ command: 'pipeline-verifier' });
   ```

   This validates:
   - ✅ Backend API endpoint works
   - ✅ Frontend can call endpoint
   - ✅ UI reflects changes
   - ✅ E2E tests pass
   - ✅ Multi-tenant isolation maintained

2. **Review with code-review-enforcer**

   ```javascript
   Skill({ command: 'code-review-enforcer' });
   ```

   Checks:
   - Graph-native patterns
   - Schema compliance
   - TODO formatting
   - Security boundaries

---

## Critical Implementation Guidelines

### 🔒 Security Requirements

**MANDATORY** for account switching:

1. **Verify Ownership**: User MUST own the target account

   ```sql
   SELECT 1 FROM user_account_memberships
   WHERE user_id = ? AND account_id = ?
   ```

2. **Update JWT Token**: New token MUST include `account_id`

   ```typescript
   const newToken = jwt.sign(
     {
       user_id: user.id,
       account_id: target_account.id,
       email: user.email,
     },
     JWT_SECRET
   );
   ```

3. **Isolate Data**: All subsequent queries MUST filter by `account_id`

   ```sql
   WHERE account_id = ? -- from JWT token
   ```

4. **Audit Log**: Log account switches
   ```typescript
   auditLogger.log('ACCOUNT_SWITCH', {
     user_id,
     from_account: old_account_id,
     to_account: new_account_id,
   });
   ```

### 📐 Architecture Patterns

**Follow Existing Conventions**:

1. **Route Structure**: `apps/api/src/routes/*.routes.ts`
2. **Service Layer**: `apps/api/src/services/*.service.ts`
3. **Middleware**: `apps/api/src/middleware/*.middleware.ts`
4. **Schemas**: `ai_context/schemas/*.json`

**Graph-Native Principles**:

- Everything is a node
- Use edges for relationships (e.g., ASSOCIATED_WITH_USER)
- Respect account_id isolation
- Never invent nodes outside ScopeSet

### 🧪 Testing Standards

**E2E Test Requirements**:

- Use `test-isolation` fixture for database isolation
- Tag smoke tests with `@smoke`
- Clean up test data with `data_tag: 'test'`
- Use ARIA-first selectors (not CSS/text)

**Multi-Tenant Tests**:

- ALWAYS test data isolation between accounts
- Use templates in `tests/e2e/templates/`
- Verify RBAC permissions
- Test invalid account access (403/404)

---

## Example: Implementing Account Switching

### Step 1: Read Test Requirements

```typescript
// Read the failing test
Read('tests/e2e/auth-account-switching.spec.ts');

// Understand expectations:
// - POST /api/v1/auth/switch-account
// - Accepts { account_id }
// - Returns new JWT token
// - Filters data by new account
```

### Step 2: Check Existing Auth Implementation

```typescript
// Read auth routes
Read('apps/api/src/routes/auth.routes.ts');

// Read auth service
Read('apps/api/src/services/auth.service.ts');

// Check JWT token structure
Grep('jwt.sign', 'apps/api/src', { output_mode: 'content', '-n': true });
```

### Step 3: Implement Endpoint

```typescript
// Add to apps/api/src/routes/auth.routes.ts
router.post('/switch-account', requireAuth, async (req: Request, res: Response) => {
  try {
    const { account_id } = req.body;
    const user_id = req.user?.user_id;

    if (!account_id) {
      return res.status(400).json({ error: 'account_id required' });
    }

    // CRITICAL: Verify ownership
    const membership = await authService.getUserAccountMembership(user_id, account_id);

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden: Account not accessible',
      });
    }

    // Generate new token
    const newToken = authService.generateToken({
      user_id,
      account_id,
      email: req.user.email,
    });

    // Audit log
    auditLogger.log('ACCOUNT_SWITCH', {
      user_id,
      from_account: req.user.account_id,
      to_account: account_id,
      timestamp: Date.now(),
    });

    return res.json({
      token: newToken,
      account: membership.account,
    });
  } catch (error) {
    console.error('[Auth] Switch account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Step 4: Add Helper to Auth Service

```typescript
// Add to apps/api/src/services/auth.service.ts
async getUserAccountMembership(
  user_id: string,
  account_id: string
): Promise<{ account: any } | null> {
  const result = await this.db.execute(`
    SELECT a.*
    FROM accounts a
    INNER JOIN user_account_memberships uam
      ON a.id = uam.account_id
    WHERE uam.user_id = ? AND a.id = ?
  `, [user_id, account_id]);

  if (result.length === 0) return null;

  return { account: result[0] };
}
```

### Step 5: Test Implementation

```javascript
// Test via MCP
mcp__keimenon -
  api -
  testing__login({
    email: 'admin@admin.com',
    password: 'TestPass123!',
  });

mcp__keimenon -
  api -
  testing__test_endpoint({
    path: '/auth/switch-account',
    method: 'POST',
    body: { account_id: 'acc_fixture_alpha' },
    expect_status: 200,
  });

// Run E2E tests
mcp__playwright -
  e2e__pw_run({
    grep: 'should allow switching between accounts',
    project: 'chromium',
  });
```

---

## Decision Framework

### When to Implement vs. Skip

**IMPLEMENT** if:

- ✅ Test describes a core feature (auth, data isolation, CRUD)
- ✅ Feature aligns with architecture patterns
- ✅ Required endpoints/schemas are referenced in docs
- ✅ Similar patterns exist in codebase

**SKIP** (ask user) if:

- ❌ Test requires significant UI refactoring
- ❌ Feature conflicts with existing architecture
- ❌ Security implications are unclear
- ❌ Database schema changes required

### Quality Gates

Before marking implementation complete:

1. ✅ **Code Review**: Use `code-review-enforcer` skill
2. ✅ **Schema Validation**: Use `graph-schema-validator` skill
3. ✅ **API Testing**: Use `keimenon-api-testing` MCP
4. ✅ **E2E Validation**: Tests pass via `playwright-e2e` MCP
5. ✅ **Pipeline Check**: Use `pipeline-verifier` skill

---

## Success Criteria

### Primary Goal

Implement missing features autonomously until all E2E tests pass

### Metrics to Track

- **Test Pass Rate**: Target 95%+ (currently 100% smoke, 0% account-switching)
- **Feature Coverage**: Missing endpoints → Implemented
- **Security**: All multi-tenant isolation tests pass
- **Code Quality**: No security vulnerabilities, follows patterns

### Exit Conditions

**Success**:

- ✅ All account-switching tests pass
- ✅ Multi-tenant isolation verified
- ✅ Code reviewed and validated
- ✅ Documentation updated

**Escalate to User**:

- ❌ Test requires features outside current scope
- ❌ Architectural decision needed
- ❌ Database migration required
- ❌ Security clarification needed

---

## Tools Command Reference

### Investigation

```javascript
// Find what endpoints exist
Grep('router\.(get|post|put|delete)', 'apps/api/src/routes', { output_mode: 'content' });

// Check database tables
mcp__keimenon - database__inspect_schema();

// Search documentation
mcp__keimenon - docs__search_docs({ query: 'your search term' });

// List TODOs
mcp__keimenon - docs__list_todos();
```

### Implementation

```javascript
// Read file
Read('path/to/file.ts');

// Edit file
Edit({
  file_path: 'path/to/file.ts',
  old_string: 'old code',
  new_string: 'new code',
});

// Create new file
Write({
  file_path: 'path/to/file.ts',
  content: 'file content',
});
```

### Testing

```javascript
// Run specific tests
mcp__playwright - e2e__pw_run({ grep: 'test name', project: 'chromium' });

// Get last failures
mcp__playwright - e2e__pw_lastFailures();

// Test endpoint
mcp__keimenon -
  api -
  testing__test_endpoint({
    path: '/endpoint',
    method: 'POST',
    body: {},
    expect_status: 200,
  });
```

### Validation

```javascript
// Use skills
Skill({ command: 'code-review-enforcer' });
Skill({ command: 'pipeline-verifier' });
Skill({ command: 'graph-schema-validator' });

// MCP integration
Skill({ command: 'mcp-integration-expert' });
```

---

## Final Instructions

**Your Approach**:

1. Start by running `mcp__playwright-e2e__pw_lastFailures()` to see current failures
2. Read the failing test file to understand requirements
3. Search docs and existing code for patterns
4. Implement features following security guidelines
5. Test implementation via MCPs
6. Validate with E2E tests
7. Review with skills before committing

**Commit Standards**:

- Use conventional commits: `feat:`, `fix:`, `test:`
- Reference the feature: `feat(auth): implement account switching endpoint`
- Keep commits atomic (one feature per commit)
- Run `git commit` - commitlint will validate format

**Communication**:

- Use TodoWrite to show progress
- Log major decisions as comments in code
- Update this document with discoveries
- Ask user for clarification on ambiguous requirements

---

## Resources

- **Architecture**: `docs/architecture/OVERVIEW.md`
- **API Docs**: `docs/guides/API_DOCUMENTATION.md`
- **E2E Guide**: `tests/e2e/README.md`
- **Schemas**: `ai_context/schemas/*.json`
- **MCP Guide**: `.mcp/USAGE_GUIDE.md`
- **Claude Guide**: `CLAUDE.md`

---

**START HERE**: Run `mcp__playwright-e2e__pw_lastFailures()` and begin autonomous implementation.

Good luck! 🚀
