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
TEST_USER_PASSWORD=admin123              # Test user password
CI=true                                  # Enables CI-specific behavior
```

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

### Port Already in Use

```bash
# Kill existing servers
npm run kill-ports

# Or manually
lsof -ti:3000 | xargs kill -9
lsof -ti:4001 | xargs kill -9
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
