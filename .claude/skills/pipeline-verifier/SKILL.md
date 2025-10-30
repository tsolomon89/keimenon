---
name: pipeline-verifier
description: Validates complete feature pipeline from backend API to frontend integration to UI/UX functionality to E2E test coverage. Uses MCP servers to verify database state, API responses, and test execution. Use when implementing new features or validating changes end-to-end.
---

# Pipeline Verifier

## Purpose

Full-stack validation ensuring features work correctly across all layers:

1. **Backend Layer** - API endpoints, database operations, business logic
2. **Frontend Layer** - React components, state management, API integration
3. **UI/UX Layer** - Visual components, user interactions, accessibility
4. **Test Layer** - E2E test coverage, test execution, test reliability

## When to Activate

This skill activates when you need to:

- Validate a new feature implementation end-to-end
- Verify bug fixes across all layers
- Ensure backend changes are properly reflected in UI
- Check that E2E tests cover critical flows
- Validate deployment readiness
- Debug issues spanning multiple layers

## Pipeline Layers

### Layer 1: Backend Validation

**What to Check**:

- ✅ API endpoint exists and responds correctly
- ✅ Database schema supports the feature
- ✅ Business logic handles edge cases
- ✅ Multi-tenant isolation enforced
- ✅ Error handling comprehensive
- ✅ Proper logging in place

**Validation Steps**:

```typescript
// 1. Check API endpoint exists
Read apps/api/src/routes/[feature].ts

// 2. Test endpoint with MCP API Testing
mcp__canvas-api-testing__test_endpoint({
  path: '/api/v1/[feature]',
  method: 'GET',
  expect_status: 200
})

// 3. Verify database structure
mcp__canvas-database__inspect_schema({
  table_name: 'nodes' // or 'edges'
})

// 4. Check data isolation
mcp__canvas-api-testing__test_multi_tenant({
  account_a_email: 'user1@test.com',
  account_a_password: 'password',
  account_b_email: 'user2@test.com',
  account_b_password: 'password',
  test_resource: 'nodes'
})

// 5. Query actual data
mcp__canvas-database__query_nodes({
  kind: 'Source', // or relevant type
  limit: 10
})
```

**Success Criteria**:

- ✅ Endpoint returns expected status codes (200, 201, 400, 404, etc.)
- ✅ Response matches Zod schema
- ✅ Database queries use account_id filter
- ✅ No cross-account data leaks
- ✅ Error responses are descriptive

### Layer 2: Frontend Integration Validation

**What to Check**:

- ✅ Component calls correct API endpoint
- ✅ Loading states handled
- ✅ Error states handled
- ✅ Data transformations correct
- ✅ State management works
- ✅ Props/types match backend contracts

**Validation Steps**:

```typescript
// 1. Read component implementation
Read apps/web/src/components/[feature]/[Component].tsx

// 2. Check API client usage
Grep apps/web/src/ -pattern "api.*[endpoint]"

// 3. Verify type definitions
Read apps/web/src/types/[feature].ts

// 4. Check state management
Grep apps/web/src/ -pattern "useState|useEffect|store"

// 5. Look for error handling
Grep apps/web/src/components/[feature]/ -pattern "error|catch|try"
```

**Success Criteria**:

- ✅ API calls include Authorization header
- ✅ Loading state displayed during async operations
- ✅ Error messages shown to user on failure
- ✅ Data properly transformed before display
- ✅ Types match backend response schema
- ✅ No console errors during normal operation

### Layer 3: UI/UX Validation

**What to Check**:

- ✅ Visual components render correctly
- ✅ User interactions work as expected
- ✅ Accessibility standards met
- ✅ Responsive design works on different screens
- ✅ Loading/empty states shown appropriately
- ✅ Error states are user-friendly

**Validation Steps**:

```typescript
// 1. Check component rendering
Read apps/web/src/components/[feature]/[Component].tsx

// 2. Look for accessibility attributes
Grep apps/web/src/components/[feature]/ -pattern "aria-|role=|alt="

// 3. Check for data-testid attributes (for E2E tests)
Grep apps/web/src/components/[feature]/ -pattern "data-testid"

// 4. Verify responsive design considerations
Grep apps/web/src/components/[feature]/ -pattern "sm:|md:|lg:|xl:"

// 5. Check for loading/error states
Grep apps/web/src/components/[feature]/ -pattern "isLoading|isError|error"
```

**Success Criteria**:

- ✅ Components have proper semantic HTML
- ✅ Interactive elements have aria-labels or text content
- ✅ Loading states prevent user confusion
- ✅ Error messages are clear and actionable
- ✅ Forms have proper validation feedback
- ✅ Navigation is intuitive

### Layer 4: Test Coverage Validation

**What to Check**:

- ✅ E2E tests exist for critical flows
- ✅ Tests cover happy path and error cases
- ✅ Tests validate backend integration
- ✅ Tests are reliable (not flaky)
- ✅ Tests follow project patterns
- ✅ Tests are properly tagged (@smoke/@full)

**Validation Steps**:

```typescript
// 1. Check for existing tests
Glob tests/e2e/*[feature]*.spec.ts

// 2. Search for test coverage
Grep tests/e2e/ -pattern "[feature]|[Component]"

// 3. List available tests
mcp__playwright-e2e__pw_listTests({
  grep: '[feature]'
})

// 4. Run tests
mcp__playwright-e2e__pw_run({
  grep: '[feature]',
  project: 'chromium'
})

// 5. Check for test failures
mcp__playwright-e2e__pw_lastFailures()
```

**Success Criteria**:

- ✅ At least 1 smoke test covers critical path
- ✅ Tests include error handling scenarios
- ✅ Tests validate data appears in UI
- ✅ All tests pass in chromium project
- ✅ No console errors during test execution
- ✅ Tests use proper fixtures and patterns

## Complete Pipeline Verification Workflow

### Step 1: Define Feature Scope

```markdown
**Feature**: [Feature Name]
**User Story**: As a [user type], I want to [action] so that [benefit]
**Components**:

- Backend: [API endpoints, services, database changes]
- Frontend: [Components, pages, state management]
- UI/UX: [Visual elements, interactions]
  **Test Coverage**: [Required test scenarios]
```

### Step 2: Backend Verification

```bash
# 1. Check API implementation
Read apps/api/src/routes/[feature].ts

# 2. Test with authentication
mcp__canvas-api-testing__login({
  email: 'admin@admin.com',
  password: 'admin123'
})

# 3. Test CRUD operations
mcp__canvas-api-testing__test_crud({
  resource_type: 'nodes', # or relevant type
  test_data: { kind: 'Source', properties: { title: 'Test' } }
})

# 4. Verify database state
mcp__canvas-database__query_nodes({
  kind: 'Source',
  limit: 5
})

# 5. Check stats
mcp__canvas-database__get_stats()
```

**Result**: Document what works and what doesn't

### Step 3: Frontend Verification

```bash
# 1. Read component source
Read apps/web/src/components/[feature]/[Component].tsx

# 2. Check API calls
Grep apps/web/src/ -pattern "api\.(get|post|put|delete)"

# 3. Verify error handling
Grep apps/web/src/components/[feature]/ -pattern "catch|error|toast|alert"

# 4. Check loading states
Grep apps/web/src/components/[feature]/ -pattern "isLoading|loading|Spinner"

# 5. Validate types match backend
Read apps/web/src/types/[feature].ts
```

**Result**: Confirm frontend correctly integrates with backend

### Step 4: UI/UX Verification

```bash
# 1. Check accessibility
Grep apps/web/src/components/[feature]/ -pattern "aria-|role="

# 2. Verify test IDs for E2E
Grep apps/web/src/components/[feature]/ -pattern "data-testid"

# 3. Check responsive design
Grep apps/web/src/components/[feature]/ -pattern "sm:|md:|lg:"

# 4. Look for loading/empty states
Grep apps/web/src/components/[feature]/ -pattern "empty|no data|loading"
```

**Result**: Ensure UI is user-friendly and accessible

### Step 5: Test Coverage Verification

```bash
# 1. Find existing tests
Glob tests/e2e/*[feature]*.spec.ts

# 2. Read test file
Read tests/e2e/[feature].spec.ts

# 3. Run tests
mcp__playwright-e2e__pw_run({
  grep: '[feature]',
  project: 'chromium',
  headed: false
})

# 4. Check for failures
mcp__playwright-e2e__pw_lastFailures()
```

**Result**: Verify E2E tests exist and pass

### Step 6: Generate Verification Report

```markdown
# Pipeline Verification Report: [Feature Name]

## Executive Summary

✅ Backend Layer: [PASS/FAIL]
✅ Frontend Layer: [PASS/FAIL]
✅ UI/UX Layer: [PASS/FAIL]
✅ Test Layer: [PASS/FAIL]

**Overall Status**: [READY/NEEDS WORK]

---

## Layer 1: Backend Validation

### API Endpoints

- ✅ GET /api/v1/[endpoint] - Returns 200
- ✅ POST /api/v1/[endpoint] - Creates resource
- ❌ PUT /api/v1/[endpoint]/:id - Missing endpoint

### Database

- ✅ Schema supports feature (nodes table has required fields)
- ✅ Multi-tenant isolation enforced (account_id filter present)
- ✅ Queries optimized (indexes exist)

### Business Logic

- ✅ Edge cases handled (empty data, invalid input)
- ✅ Error messages descriptive
- ⚠️ Logging could be improved (add debug logs for key operations)

**Backend Score**: 90% (9/10 checks passed)

---

## Layer 2: Frontend Integration

### API Integration

- ✅ Correct endpoints called
- ✅ Authorization header included
- ✅ Response types match backend schema

### State Management

- ✅ Loading states managed
- ✅ Error states handled
- ❌ Missing optimistic updates (creates feel slow)

### Error Handling

- ✅ Try/catch blocks present
- ✅ User-friendly error messages
- ✅ Retry mechanisms available

**Frontend Score**: 85% (8.5/10 checks passed)

---

## Layer 3: UI/UX Validation

### Visual Components

- ✅ Components render correctly
- ✅ Styling consistent with design system
- ✅ Loading states clear (spinner + message)

### Accessibility

- ✅ Semantic HTML used
- ⚠️ Some buttons missing aria-labels
- ✅ Keyboard navigation works
- ✅ Color contrast sufficient

### Responsive Design

- ✅ Mobile-friendly layout
- ✅ Tablet layout adjusted
- ✅ Desktop shows full features

**UI/UX Score**: 88% (8.8/10 checks passed)

---

## Layer 4: Test Coverage

### E2E Tests

- ✅ tests/e2e/[feature].spec.ts exists
- ✅ Covers happy path (successful flow)
- ❌ Missing error handling tests
- ✅ Validates backend integration

### Test Quality

- ✅ Tagged appropriately (@smoke)
- ✅ Uses reliable locators
- ✅ Proper test isolation
- ⚠️ One test occasionally flaky (needs investigation)

### Test Results

- ✅ All tests pass in chromium
- ✅ All tests pass in firefox
- ❌ 1 test fails in webkit (needs debugging)

**Test Coverage Score**: 80% (8/10 checks passed)

---

## Overall Pipeline Health

**Passed**: 34/40 checks (85%)

### Critical Issues (Must Fix)

1. ❌ Missing PUT endpoint for updates
2. ❌ Missing error handling E2E tests
3. ❌ Webkit test failure in [test name]

### Warnings (Should Fix)

1. ⚠️ Some buttons missing aria-labels
2. ⚠️ Logging could be improved in backend
3. ⚠️ Optimistic updates would improve UX
4. ⚠️ One flaky test needs investigation

### Recommendations

1. **High Priority**: Implement PUT endpoint for updates
2. **High Priority**: Fix webkit test failure
3. **Medium Priority**: Add error handling E2E tests
4. **Medium Priority**: Add aria-labels to interactive elements
5. **Low Priority**: Consider optimistic updates for better UX

---

## Deployment Readiness

**Status**: ⚠️ READY WITH CAVEATS

- Backend: ✅ Production ready (minor logging improvements recommended)
- Frontend: ✅ Production ready (missing optimistic updates but not critical)
- UI/UX: ⚠️ Mostly ready (fix aria-labels before deploy)
- Tests: ⚠️ Mostly ready (fix webkit failure, add error tests)

**Recommendation**:

- Can deploy to staging immediately
- Fix critical issues before production deploy
- Monitor for flaky test in CI/CD

---

## Next Steps

1. [ ] Implement PUT /api/v1/[endpoint]/:id endpoint
2. [ ] Debug and fix webkit test failure
3. [ ] Add error handling E2E tests
4. [ ] Add aria-labels to buttons in [Component].tsx
5. [ ] Investigate flaky test and add wait conditions
6. [ ] Deploy to staging for QA validation
```

## Integration with Other Skills

### Use graph-schema-validator

When verifying backend, use graph-schema-validator to ensure database operations comply with schemas.

### Use code-review-enforcer

Before running pipeline verification, run code-review-enforcer to catch issues early.

### Use e2e-test-generator

If test coverage is insufficient, use e2e-test-generator to create missing tests.

### Use mcp-integration-expert

Leverage MCP servers throughout verification for querying database, testing APIs, running tests.

## Success Metrics

A feature passes pipeline verification when:

- ✅ Backend passes ≥90% checks
- ✅ Frontend passes ≥85% checks
- ✅ UI/UX passes ≥85% checks
- ✅ Test coverage passes ≥80% checks
- ✅ No critical issues present
- ✅ All tests pass in at least 2 browsers
- ✅ Multi-tenant isolation verified

## Common Issues and Solutions

### Issue: Backend works but UI doesn't update

**Diagnosis**:

- Check API response format matches frontend expectations
- Verify frontend is calling correct endpoint
- Check for CORS errors in browser console

**Solution**:

- Use mcp**canvas-api-testing**test_endpoint to verify response
- Add console.log to frontend to see actual response
- Check API_DESIGN.md for expected response format

### Issue: Tests fail but manual testing works

**Diagnosis**:

- Race conditions (elements not loaded yet)
- Test data conflicts (not isolated)
- Environment differences (test vs dev)

**Solution**:

- Add proper waits (waitForSelector, waitForResponse)
- Use test-specific accounts for isolation
- Check playwright config for environment variables

### Issue: Feature works in chromium but not webkit

**Diagnosis**:

- Browser-specific APIs used
- CSS not compatible
- Timing differences

**Solution**:

- Use cross-browser compatible APIs
- Test CSS in webkit dev tools
- Add longer timeouts for webkit (see playwright.config.ts)

## Reference Files

- [docs/architecture/OVERVIEW.md](../../../docs/architecture/OVERVIEW.md) - System architecture
- [docs/architecture/API_DESIGN.md](../../../docs/architecture/API_DESIGN.md) - API patterns
- [docs/architecture/DATABASE.md](../../../docs/architecture/DATABASE.md) - Database design
- [playwright.config.ts](../../../playwright.config.ts) - Test configuration
- [CLAUDE.md](../../../CLAUDE.md) - Operating guide

---

**Note**: This skill orchestrates other skills and MCP servers. It requires all tools to perform comprehensive validation. Use it for final verification before deployment.
