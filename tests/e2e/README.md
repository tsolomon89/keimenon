# End-to-End Testing with Playwright

This directory contains the Playwright E2E test suite for Canvas Memory OS. The tests cover critical user journeys from browser to backend database.

## Quick Start

```bash
# Install Playwright browsers (first time only)
npm run e2e:install

# Run all tests (headless)
npm run e2e

# Run tests in UI mode (interactive)
npm run e2e:ui

# Run tests in headed mode (see browser)
npm run e2e:headed

# Run with debugger
npm run e2e:debug

# View last test report
npm run e2e:report

# Development mode (starts servers + UI mode)
npm run e2e:dev
```

## Before Running Tests

**IMPORTANT:** Always clean up before running tests to avoid zombie processes and stale data:

```bash
# Clean everything (kills ports, clears databases, removes snapshots)
npm run e2e:clean
```

This command:

- ✅ Kills any processes on ports 3000 and 4001 (prevents zombie servers)
- ✅ Clears login_attempts from main database (fixes account lockout)
- ✅ Deletes all worker databases (ensures fresh test isolation)
- ✅ Removes snapshot template (forces regeneration with latest code)

**Best Practice:** Run `npm run e2e:clean` before every test session to ensure a clean environment.

## Test Organization

```
tests/e2e/
├── fixtures/
│   └── testId.ts          # Test correlation fixture (adds x-test-id header)
├── smoke.spec.ts          # @smoke - Quick sanity checks
└── flow-auth-canvas.spec.ts  # @full - Complete user journeys
```

## Writing Tests

### Use ARIA-First Locators

Prefer accessible locators for resilient tests:

```typescript
import { test, expect } from './fixtures/testId';

test('should login successfully', async ({ page }) => {
  await page.goto('/login');

  // Good: ARIA-based locators
  await page.getByLabel(/email/i).fill('user@example.com');
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();

  // Avoid: Brittle CSS selectors
  // await page.locator('.login-form input[name="email"]').fill('...');
});
```

### Test Tags

Use tags to organize and filter tests:

```typescript
test.describe('Smoke Tests', () => {
  test.describe.configure({ tag: '@smoke' });

  test('loads home page', async ({ page }) => {
    // Quick smoke test
  });
});

test.describe('Full Flow', () => {
  test.describe.configure({ tag: '@full' });

  test('complete import workflow', async ({ page }) => {
    // Comprehensive test
  });
});
```

Run tagged tests:

```bash
npm run e2e -- --grep="@smoke"
npm run e2e -- --grep="@full"
```

### Test Correlation

All tests automatically include a `x-test-id` header for backend correlation:

```typescript
// In fixtures/testId.ts - automatically applied
const testId = randomUUID();
await context.route('**/*', async (route) => {
  const headers = {
    ...route.request().headers(),
    'x-test-id': testId,
  };
  await route.continue({ headers });
});
```

Backend logs will include this test ID for debugging:

```bash
# Find all backend logs for a specific test run
grep "testId=abc-123-def" apps/api/api-server.log
```

## Configuration

See `playwright.config.ts` for:

- **Browser Projects**: Chromium, Firefox, WebKit
- **Traces**: Captured on first retry
- **Videos**: Retained on failure
- **Screenshots**: Only on failure
- **Base URL**: `http://localhost:3000` (configurable via `BASE_URL` env var)

## CI/CD

Tests run automatically on GitHub Actions:

- **Full Suite**: All browsers on push to main/develop
- **Smoke Tests**: Quick Chromium-only tests on PRs

See `.github/workflows/e2e.yml` for details.

### Viewing CI Artifacts

When tests fail on CI:

1. Go to Actions tab
2. Click on failed workflow
3. Download artifacts:
   - `playwright-results-{browser}` - HTML report
   - `playwright-traces-{browser}` - Trace files

View traces locally:

```bash
npx playwright show-trace test-results/*/trace.zip
```

## Debugging Failed Tests

### Local Debugging

```bash
# Run in debug mode (steps through test)
npm run e2e:debug

# Run in headed mode (see browser)
npm run e2e:headed

# Run specific test file
npm run e2e -- flow-auth-canvas.spec.ts

# Run specific test by name
npm run e2e -- -g "should login successfully"
```

### Using Trace Viewer

Traces are automatically captured on retry:

```bash
# View trace from last run
npx playwright show-trace test-results/*/trace.zip

# View specific trace
npx playwright show-trace test-results/flow-auth-canvas-chromium/trace.zip
```

Trace viewer shows:

- Action timeline
- Screenshots at each step
- Network requests
- Console logs
- DOM snapshots

## Environment Variables

```bash
# Test environment (.env.test or set in shell)
BASE_URL=http://localhost:3000           # Frontend URL
API_BASE_URL=http://localhost:4001       # Backend API URL
TEST_USER_EMAIL=admin@admin.com          # Test user credentials
TEST_USER_PASSWORD=TestPass123!          # Standard test password (meets all validation requirements)
CI=true                                  # Enables CI-specific behavior
```

### Standard Test Password

**All test accounts use the same password:** `TestPass123!`

This password:

- ✅ Meets all password validation requirements (12+ chars, upper/lower/numbers/special)
- ✅ Consistent across all test fixtures and specs
- ✅ Easy to remember for manual testing
- ✅ Not in common password blocklist

**Fixture Accounts** (created in database snapshot):

- `admin@admin.com` / `TestPass123!` - Main test user (admin permissions)
- `client-alpha@fixture.test` / `TestPass123!` - Multi-tenant test account A
- `client-beta@fixture.test` / `TestPass123!` - Multi-tenant test account B
- `client-gamma@fixture.test` / `TestPass123!` - Multi-tenant test account C

## Best Practices

### 1. Auto-Waiting

Playwright automatically waits for elements to be actionable:

```typescript
// Automatically waits for element to be visible and enabled
await page.getByRole('button').click();

// No need for manual waits
```

### 2. Isolation

Each test should be independent:

```typescript
test.beforeEach(async ({ page }) => {
  // Set up clean state
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  // Clean up test data if needed
});
```

### 3. Error Messages

Add descriptive assertions:

```typescript
// Good
await expect(page.getByRole('heading', { name: /Canvas Memory/ })).toBeVisible({
  timeout: 10000,
});

// Better (with custom message)
await expect(page.getByRole('heading', { name: /Canvas Memory/ })).toBeVisible();
```

### 4. Waiting for API Responses

Test full stack flows by waiting for API calls:

```typescript
const responsePromise = page.waitForResponse(
  (response) =>
    response.url().includes('/api/v1/auth/login') && response.request().method() === 'POST'
);

await page.getByRole('button', { name: /sign in/i }).click();

const response = await responsePromise;
expect(response.ok()).toBeTruthy();
const data = await response.json();
expect(data).toHaveProperty('token');
```

## MCP Control Layer

Claude can control tests via the MCP server. See `.mcp/servers/playwright-e2e/README.md` for details.

## Troubleshooting

### Port Already in Use / Zombie Processes

**Use the cleanup command (recommended):**

```bash
# Clean everything - kills ports, clears databases, removes snapshots
npm run e2e:clean
```

**Alternative methods:**

```bash
# Kill ports only
npm run kill-ports

# Or manually (Unix/Linux/Mac)
lsof -ti:3000 | xargs kill -9
lsof -ti:4001 | xargs kill -9

# Or manually (Windows)
npx kill-port 3000 4001
```

### Browsers Not Installed

```bash
npm run e2e:install
```

### Tests Timing Out

- Increase timeout in `playwright.config.ts`
- Check server logs for errors
- Verify servers are running on correct ports

### Flaky Tests

1. Check trace viewer for exact failure point
2. Add explicit waits for dynamic content
3. Use `waitForResponse` for API-dependent actions
4. Verify test isolation (no shared state)

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Trace Viewer Guide](https://playwright.dev/docs/trace-viewer)
- [Debugging Guide](https://playwright.dev/docs/debug)
