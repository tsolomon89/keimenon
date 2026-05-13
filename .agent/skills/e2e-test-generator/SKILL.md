---
name: e2e-test-generator
description: Generates Playwright E2E tests following project patterns. Creates tests for keimenon operations, data management, authentication flows, and API integration. Ensures proper test isolation, tags (@smoke/@full), and fixture usage. Use when adding features or components requiring E2E coverage.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npx playwright test:*), mcp__playwright-e2e__pw_listTests, mcp__playwright-e2e__pw_run
---

---

**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):

- **Context Consolidation**: Automatic, not optional (Section 13.0)
- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)
- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)
- **Full-Scope Traversal**: Address all layers (Section 13.3)
- **Recursive Intelligence**: Enrich system with every run (Section 13.4)

---

# E2E Test Generator

## Purpose

Generate comprehensive Playwright E2E tests that validate full-stack functionality:

- Keimenon operations (node/edge visualization)
- Data management (imports, exports, backups)
- Authentication flows (login, registration, sessions)
- Settings and CRM (user management, account settings)
- API integration (backend data reflected in UI)

## When to Activate

This skill activates when you need to:

- Generate tests for new features or components
- Add E2E coverage for uncovered user flows
- Create regression tests after bug fixes
- Validate backend-to-frontend integration
- Ensure UI/UX functionality matches requirements

## Project Test Patterns

### Test Location and Structure

```
tests/e2e/
├── fixtures/
│   └── testId.ts          # Custom test fixtures
├── smoke.spec.ts          # Critical path tests (@smoke tag)
├── keimenon-operations.spec.ts
├── data-management-ui-updates.spec.ts
├── settings-navigation.spec.ts
├── flow-auth-keimenon.spec.ts
├── console-error-filtering.spec.ts
└── debug-auth.spec.ts
```

### Test File Template

```typescript
import { test, expect } from './fixtures/testId';

/**
 * [Feature Name] Test
 *
 * [Brief description of what this test validates]
 * Tagged with @smoke for quick validation OR @full for comprehensive tests.
 */

test.describe('[Feature Name]', () => {
  // Tag for CI/CD pipeline selection
  test.describe.configure({ tag: '@smoke' }); // or '@full'

  // Test credentials (use environment variables)
  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

  test.beforeEach(async ({ page }) => {
    // Setup: Login if authenticated route
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect (uses global 30s timeout)
    await page.waitForURL(/\/keimenon/);
    await page.waitForLoadState('domcontentloaded');
  });

  test('should [do something specific]', async ({ page }) => {
    // Test implementation
  });
});
```

### Tagging Strategy

**@smoke Tags** - Critical path tests (run on every commit):

- Login/logout flow
- Keimenon page loads
- Basic node creation
- API connectivity

**@full Tags** - Comprehensive tests (run nightly or pre-release):

- Complex workflows
- Edge cases
- Multi-step processes
- Performance validation

## Test Generation Workflow

### Step 1: Understand the Feature

1. **Read feature implementation**:

   ```bash
   Read apps/web/src/components/keimenon/[ComponentName].tsx
   Read apps/api/src/routes/[endpoint].ts
   ```

2. **Identify user flows**:
   - What actions can users take?
   - What data is displayed?
   - What backend calls are made?

3. **Check existing tests**:
   ```bash
   Glob tests/e2e/*.spec.ts
   Grep tests/e2e/ -pattern "ComponentName"
   ```

### Step 2: Design Test Cases

**Test Case Categories**:

1. **Happy Path** - Normal successful flow
2. **Error Handling** - Invalid inputs, network errors
3. **Edge Cases** - Boundary conditions, empty states
4. **Integration** - Backend data reflected in UI

**Example Test Cases for Chat Import**:

```markdown
1. ✅ Upload valid ChatGPT export (happy path)
2. ❌ Upload invalid JSON file (error handling)
3. ⚠️ Upload 0-byte file (edge case)
4. ✅ Verify imported nodes appear in database (integration)
5. ✅ Check UI shows import progress (UI validation)
```

### Step 3: Generate Test Code

**Pattern 1: Navigation Test**

```typescript
test('should navigate to [page/feature]', async ({ page }) => {
  // Click navigation element
  await page.getByRole('link', { name: /settings/i }).click();

  // Verify URL changed
  await expect(page).toHaveURL(/\/settings/);

  // Verify page content loaded
  const heading = page.getByRole('heading', { name: /settings/i });
  await expect(heading).toBeVisible();
});
```

**Pattern 2: Form Submission Test**

```typescript
test('should submit [form name] successfully', async ({ page }) => {
  // Navigate to form
  await page.goto('/path/to/form');

  // Fill form fields
  await page.getByLabel(/name/i).fill('Test Name');
  await page.getByLabel(/email/i).fill('test@example.com');

  // Submit form
  await page.getByRole('button', { name: /submit/i }).click();

  // Verify success message
  await expect(page.getByText(/success/i)).toBeVisible();

  // Verify backend integration (API call successful)
  // Check database via MCP if needed
});
```

**Pattern 3: Data Validation Test**

```typescript
test('should display [data] from backend', async ({ page }) => {
  // Navigate to page showing data
  await page.goto('/keimenon');

  // Wait for data to load
  await page.waitForLoadState('networkidle');

  // Verify data appears (use data-testid for reliability)
  const nodeCount = await page.locator('[data-testid="keimenon-node"]').count();
  expect(nodeCount).toBeGreaterThan(0);

  // Verify specific data (if known)
  await expect(page.getByText('Expected Content')).toBeVisible();
});
```

**Pattern 4: API Integration Test**

```typescript
test('should reflect backend changes in UI', async ({ page }) => {
  // Perform action that triggers backend call
  await page.getByRole('button', { name: /create node/i }).click();
  await page.getByLabel(/title/i).fill('New Node');
  await page.getByRole('button', { name: /save/i }).click();

  // Wait for API response
  await page.waitForResponse((resp) => resp.url().includes('/api/v1/nodes'));

  // Verify UI updated
  await expect(page.getByText('New Node')).toBeVisible();

  // Optional: Verify in database
  // const nodes = await mcp__keimenon-database__query_nodes({ kind: 'Source' });
  // expect(nodes.find(n => n.properties.title === 'New Node')).toBeDefined();
});
```

### Step 4: Add Error Handling Tests

```typescript
test('should handle [error scenario]', async ({ page }) => {
  // Set up error condition (mock API failure if needed)
  await page.route('**/api/v1/**', (route) => {
    route.fulfill({
      status: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    });
  });

  // Perform action that should fail
  await page.getByRole('button', { name: /submit/i }).click();

  // Verify error message displayed
  await expect(page.getByText(/error/i)).toBeVisible();

  // Verify graceful degradation (UI doesn't crash)
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
});
```

### Step 5: Add Accessibility Tests

```typescript
test('should be accessible', async ({ page }) => {
  await page.goto('/feature-page');

  // Check for proper heading structure
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();

  // Check for ARIA labels on interactive elements
  const buttons = page.getByRole('button');
  const buttonCount = await buttons.count();

  for (let i = 0; i < buttonCount; i++) {
    const button = buttons.nth(i);
    const ariaLabel = await button.getAttribute('aria-label');
    const text = await button.textContent();

    // Button should have text or aria-label
    expect(ariaLabel || text?.trim()).toBeTruthy();
  }

  // Test keyboard navigation
  await page.keyboard.press('Tab');
  const focusedElement = page.locator(':focus');
  await expect(focusedElement).toBeVisible();
});
```

## Test Configuration

### Playwright Config Reference

```typescript
// playwright.config.ts structure
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000, // 30s per test
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

### Running Tests

```bash
# Run all tests
npx playwright test

# Run smoke tests only
npx playwright test --grep @smoke

# Run specific file
npx playwright test tests/e2e/keimenon-operations.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific browser
npx playwright test --project=chromium

# Debug mode
npx playwright test --debug
```

## Backend Integration Validation

### Using MCP Keimenon-Database

```typescript
// Query database to verify test data
import { test, expect } from './fixtures/testId';

test('should create node in database', async ({ page }) => {
  // Perform UI action
  await page.goto('/keimenon');
  await page.getByRole('button', { name: /create source/i }).click();
  await page.getByLabel(/title/i).fill('Test Source');
  await page.getByRole('button', { name: /save/i }).click();

  // Wait for API call
  await page.waitForResponse(
    (resp) => resp.url().includes('/api/v1/nodes') && resp.status() === 201
  );

  // Verify in UI
  await expect(page.getByText('Test Source')).toBeVisible();

  // Verify in database (using MCP tool)
  // Note: This requires MCP server access from test environment
  // Alternative: Use API endpoint to verify
  const response = await page.request.get('/api/v1/nodes', {
    headers: {
      Authorization: `Bearer ${process.env.TEST_AUTH_TOKEN}`,
    },
    params: {
      kind: 'Source',
      limit: 1,
    },
  });

  const data = await response.json();
  expect(data.nodes).toContainEqual(
    expect.objectContaining({
      kind: 'Source',
      properties: expect.objectContaining({
        title: 'Test Source',
      }),
    })
  );
});
```

## Common Test Patterns

### Pattern: Wait for Specific Element

```typescript
// ✅ GOOD: Wait for specific element
await page.waitForSelector('[data-testid="keimenon-loaded"]');

// ✅ GOOD: Wait for URL change
await page.waitForURL(/\/keimenon/);

// ✅ GOOD: Wait for network idle
await page.waitForLoadState('networkidle');

// ❌ BAD: Fixed wait (flaky!)
await page.waitForTimeout(5000);
```

### Pattern: Handle Dynamic Content

```typescript
// ✅ GOOD: Poll for element
await expect(async () => {
  const count = await page.locator('[data-testid="node"]').count();
  expect(count).toBeGreaterThan(0);
}).toPass({ timeout: 10000 });

// ✅ GOOD: Wait for specific count
await page.locator('[data-testid="node"]').nth(4).waitFor();
```

### Pattern: Test Isolation

```typescript
test.describe('Feature Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Reset state before each test
    // Option 1: Use test-specific account
    // Option 2: Clear test data via API
    // Option 3: Use database snapshots
  });

  test.afterEach(async ({ page, context }) => {
    // Cleanup (if needed)
    await context.clearCookies();
  });
});
```

## Test Quality Checklist

A good E2E test should:

- [ ] Have a descriptive name: `should [action] when [condition]`
- [ ] Be independent (doesn't depend on other tests)
- [ ] Use semantic locators (role, label) over CSS selectors
- [ ] Wait for dynamic content properly (no fixed timeouts)
- [ ] Verify both UI and backend state
- [ ] Handle errors gracefully
- [ ] Include accessibility checks
- [ ] Be tagged appropriately (@smoke or @full)
- [ ] Clean up test data (if needed)
- [ ] Have clear assertions with meaningful error messages

## MCP Playwright Server Usage

### List Available Tests

```typescript
const tests =
  (await mcp__playwright) -
  e2e__pw_listTests({
    grep: 'keimenon', // Filter tests
  });
```

### Run Tests via MCP

```typescript
const result =
  (await mcp__playwright) -
  e2e__pw_run({
    grep: '@smoke',
    project: 'chromium',
    headed: false,
  });
```

### Check Last Failures

```typescript
const failures = (await mcp__playwright) - e2e__pw_lastFailures();
// Returns traces and screenshots for debugging
```

## Example: Complete Test File

```typescript
import { test, expect } from './fixtures/testId';

/**
 * Data Management UI Test
 *
 * Validates data management operations including imports, exports,
 * and database cleanup functionality.
 * Tagged with @full for comprehensive test coverage.
 */

test.describe('Data Management', () => {
  test.describe.configure({ tag: '@full' });

  const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@admin.com';
  const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/keimenon/);

    // Navigate to data management
    await page.goto('/settings/data');
  });

  test('should display database statistics', async ({ page }) => {
    // Wait for stats to load
    await page.waitForLoadState('networkidle');

    // Verify stats cards are visible
    await expect(page.getByText(/total nodes/i)).toBeVisible();
    await expect(page.getByText(/total edges/i)).toBeVisible();

    // Verify numbers are displayed (not just labels)
    const nodeCount = await page.locator('[data-testid="node-count"]').textContent();
    expect(parseInt(nodeCount || '0')).toBeGreaterThanOrEqual(0);
  });

  test('should export database successfully', async ({ page }) => {
    // Start export
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export database/i }).click();

    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/keimenon-export.*\.json/);

    // Verify download completed
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test('should import chat export file', async ({ page }) => {
    // Click import button
    await page.getByRole('button', { name: /import/i }).click();

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('ai_context/chat_data/test-samples/tiny.json');

    // Wait for import progress
    await expect(page.getByText(/importing/i)).toBeVisible();

    // Wait for completion
    await expect(page.getByText(/import complete/i)).toBeVisible({ timeout: 30000 });

    // Verify stats updated
    const nodeCount = await page.locator('[data-testid="node-count"]').textContent();
    expect(parseInt(nodeCount || '0')).toBeGreaterThan(0);
  });

  test('should handle import errors gracefully', async ({ page }) => {
    // Upload invalid file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('package.json'); // Not a chat export

    // Verify error message
    await expect(page.getByText(/invalid format/i)).toBeVisible({ timeout: 10000 });

    // Verify UI still functional
    await expect(page.getByRole('button', { name: /import/i })).toBeEnabled();
  });
});
```

## Success Criteria

A generated E2E test is complete when:

- ✅ Follows project patterns and conventions
- ✅ Uses proper fixtures and test utilities
- ✅ Tagged appropriately (@smoke or @full)
- ✅ Tests happy path and error cases
- ✅ Validates backend integration
- ✅ Includes accessibility checks
- ✅ Has clear, descriptive test names
- ✅ Uses reliable locators (role, label)
- ✅ Properly handles async operations
- ✅ Can run independently (test isolation)

## Reference Files

- [tests/e2e/keimenon-operations.spec.ts](../../../tests/e2e/keimenon-operations.spec.ts) - Example test patterns
- [tests/e2e/fixtures/testId.ts](../../../tests/e2e/fixtures/testId.ts) - Custom fixtures
- [playwright.config.ts](../../../playwright.config.ts) - Test configuration
- [docs/architecture/OVERVIEW.md](../../../docs/architecture/OVERVIEW.md) - System architecture

---

**Note**: Generated tests should be reviewed before committing. Run tests locally first to ensure they pass.
