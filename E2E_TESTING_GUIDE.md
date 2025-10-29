# E2E Testing with Playwright + MCP Control Layer

Complete guide to end-to-end testing in Canvas Memory OS with Claude-powered test control via Model Context Protocol (MCP).

## Overview

This repository includes:

1. **Playwright E2E Tests** - Browser-based tests covering critical user journeys
2. **Test Correlation** - Backend tracking of test requests via `x-test-id` headers
3. **MCP Server** - Claude can list, run, and debug tests programmatically
4. **CI/CD Integration** - Automated testing on GitHub Actions
5. **Developer Tools** - Scripts for local debugging and development

## Quick Start

### First-Time Setup

```bash
# Install Playwright browsers
npm run e2e:install

# Verify installation
npm run e2e -- --grep="@smoke" --project=chromium
```

### Running Tests Locally

```bash
# Run all tests (headless)
npm run e2e

# Interactive UI mode (recommended for development)
npm run e2e:ui

# Development mode (starts servers + opens UI)
npm run e2e:dev

# Headed mode (see the browser)
npm run e2e:headed

# Debug mode (step through tests)
npm run e2e:debug

# Run smoke tests only
npm run e2e -- --grep="@smoke"

# Run specific browser
npm run e2e -- --project=firefox

# View last report
npm run e2e:report
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User/Claude                             │
└──────────┬──────────────────────────────────────┬───────────┘
           │                                      │
           │ Manual Testing                       │ MCP Protocol
           ▼                                      ▼
    ┌──────────────┐                      ┌──────────────┐
    │  Playwright  │                      │  MCP Server  │
    │  CLI/UI      │                      │  (Node.js)   │
    └──────┬───────┘                      └──────┬───────┘
           │                                      │
           │ Test Execution                       │ Controls
           │                                      │
           └──────────────┬───────────────────────┘
                          ▼
                   ┌──────────────┐
                   │  Tests       │
                   │  (*.spec.ts) │
                   └──────┬───────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐  ┌──────────┐
    │   Web    │◀─▶│   API    │◀─▶│ Database │
    │ (Next.js)│   │(Express) │  │ (SQLite) │
    └──────────┘   └────┬─────┘  └──────────┘
                        │
                        │ x-test-id
                        │ correlation
                        ▼
                  ┌──────────┐
                  │  Logs    │
                  └──────────┘
```

## Test Organization

```
tests/e2e/
├── fixtures/
│   └── testId.ts              # Automatic x-test-id header injection
├── smoke.spec.ts              # @smoke - Quick sanity checks (4 tests)
└── flow-auth-canvas.spec.ts   # @full  - Complete user journeys (4 tests)
```

### Test Tags

- **`@smoke`** - Fast, critical path tests (~30 seconds)
- **`@full`** - Comprehensive end-to-end flows (~2 minutes)

## Test Correlation

Every test request includes a unique `x-test-id` header for backend correlation:

```
Browser Request → x-test-id: abc-123-def-456 → API Server
                                                    ↓
                                              Logs with testId
```

**Finding logs for a specific test:**

```bash
# Get test ID from test output or Playwright trace
grep "testId=abc-123-def-456" apps/api/api-server.log
```

## MCP Server (Claude Control)

### Setup

1. Install MCP server dependencies:

   ```bash
   cd .mcp/servers/playwright-e2e
   npm install
   ```

2. Configure Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "playwright-e2e": {
         "command": "node",
         "args": ["/absolute/path/to/ai_convo_parser/.mcp/servers/playwright-e2e/index.js"]
       }
     }
   }
   ```

3. Restart Claude Desktop

### Available Claude Commands

Once configured, you can ask Claude to:

```
"List all smoke tests"
→ Uses: pw.listTests({ grep: "@smoke" })

"Run the smoke tests in Chromium"
→ Uses: pw.run({ tag: "@smoke", project: "chromium" })

"Show me the last test failures"
→ Uses: pw.lastFailures()

"Start the development servers"
→ Uses: app.start({ env: "local" })

"Show me the test artifacts"
→ Uses: artifacts.list({ limit: 10 })

"Read the test report"
→ Uses: artifacts.read({ path: "playwright-report/index.html" })

"What's the current environment?"
→ Uses: env.info()
```

### Security

- **User Approval Required** for destructive operations (run tests, start/stop servers)
- **Command Whitelisting** - Only predefined commands allowed
- **Path Validation** - File access restricted to repository
- **No Arbitrary Shell** - Prevents command injection

## CI/CD

Tests run automatically on GitHub Actions:

### Workflows

1. **Full E2E Suite** (`.github/workflows/e2e.yml`)
   - Triggers: Push to main/develop, PRs
   - Browsers: Chromium, Firefox, WebKit
   - Duration: ~10 minutes
   - Artifacts: HTML reports, trace files

2. **Smoke Tests** (`.github/workflows/e2e.yml`)
   - Triggers: Same as full suite
   - Browser: Chromium only
   - Duration: ~2 minutes
   - Quick validation before full suite

### Viewing CI Results

1. Go to **Actions** tab on GitHub
2. Click on failed workflow run
3. Download artifacts:
   - `playwright-results-{browser}` - HTML report
   - `playwright-traces-{browser}` - Trace files for failed tests

### Debugging CI Failures

```bash
# Download trace artifact from CI
unzip playwright-traces-chromium.zip

# View trace locally
npx playwright show-trace test-results/*/trace.zip
```

## Writing Tests

### Best Practices

1. **Use ARIA-First Locators** (resilient to UI changes)

   ```typescript
   // Good
   await page.getByLabel(/email/i).fill('user@example.com');
   await page.getByRole('button', { name: /sign in/i }).click();

   // Avoid
   await page.locator('.email-input').fill('user@example.com');
   await page.locator('#submit-btn').click();
   ```

2. **Import Test Fixture** (automatic test ID injection)

   ```typescript
   import { test, expect } from './fixtures/testId';
   ```

3. **Test Full Stack** (wait for API responses)

   ```typescript
   const responsePromise = page.waitForResponse((response) =>
     response.url().includes('/api/v1/auth/login')
   );
   await page.getByRole('button', { name: /sign in/i }).click();
   const response = await responsePromise;
   expect(response.ok()).toBeTruthy();
   ```

4. **Tag Tests** (enable filtering)

   ```typescript
   test.describe('Critical Flow', () => {
     test.describe.configure({ tag: '@smoke' });

     test('should load home page', async ({ page }) => {
       // ...
     });
   });
   ```

### Example Test

```typescript
import { test, expect } from './fixtures/testId';

test.describe('User Authentication', () => {
  test.describe.configure({ tag: '@full' });

  test('should login and access canvas', async ({ page }) => {
    // Navigate
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);

    // Login
    await page.getByLabel(/email/i).fill('admin@admin.com');
    await page.getByLabel(/password/i).fill('admin123');

    // Wait for API response
    const loginResponse = page.waitForResponse((res) => res.url().includes('/api/v1/auth/login'));
    await page.getByRole('button', { name: /sign in/i }).click();

    const response = await loginResponse;
    expect(response.ok()).toBeTruthy();

    // Verify redirect
    await expect(page).toHaveURL(/\/canvas/);
  });
});
```

## Debugging

### Local Debugging

```bash
# Step through test with debugger
npm run e2e:debug

# Run in headed mode (see browser)
npm run e2e:headed

# Run specific test
npm run e2e -- -g "should login successfully"

# Run specific file
npm run e2e -- flow-auth-canvas.spec.ts
```

### Trace Viewer

Traces are captured automatically on test retry:

```bash
# View latest trace
npx playwright show-trace test-results/*/trace.zip

# View specific trace
npx playwright show-trace test-results/flow-auth-canvas-chromium-login/trace.zip
```

Trace viewer shows:

- **Timeline** - Action-by-action replay
- **Screenshots** - Visual state at each step
- **Network** - All API requests/responses
- **Console** - Browser console logs
- **DOM Snapshots** - Full page state

### Common Issues

**Port already in use:**

```bash
npm run kill-ports
```

**Servers not starting:**

```bash
# Check manually
npm run dev  # In root - starts both servers

# Or check ports
lsof -i :3000
lsof -i :4001
```

**Test timing out:**

- Check server logs (`apps/api/api-server.log`)
- Increase timeout in test: `{ timeout: 30000 }`
- Verify test ID correlation in logs

## File Structure

```
.
├── playwright.config.ts               # Playwright configuration
├── tests/e2e/                         # Test files
│   ├── fixtures/testId.ts            # Test correlation fixture
│   ├── smoke.spec.ts                 # Smoke tests
│   └── flow-auth-canvas.spec.ts      # Full flow tests
├── .github/workflows/e2e.yml         # CI/CD workflow
├── .mcp/servers/playwright-e2e/      # MCP server for Claude
│   ├── index.js                      # Server implementation
│   ├── package.json                  # Dependencies
│   └── README.md                     # MCP documentation
├── scripts/e2e/dev.js                # Development script
└── apps/api/src/middleware/
    └── test-correlation.middleware.ts # Backend correlation
```

## Environment Variables

```bash
# .env or export in shell
BASE_URL=http://localhost:3000           # Frontend URL
API_BASE_URL=http://localhost:4001       # Backend URL
TEST_USER_EMAIL=admin@admin.com          # Test credentials
TEST_USER_PASSWORD=admin123
CI=true                                  # CI mode (affects retries)
```

## Resources

### Documentation

- [Tests README](./tests/e2e/README.md) - Detailed testing guide
- [MCP Server README](./.mcp/servers/playwright-e2e/README.md) - Claude control docs
- [Playwright Docs](https://playwright.dev) - Official documentation

### Tools

- **Playwright Test**: Test runner
- **Playwright Inspector**: Debug UI (`npm run e2e:debug`)
- **Playwright Trace Viewer**: Visual debugging (`npx playwright show-trace`)
- **Playwright UI Mode**: Interactive test development (`npm run e2e:ui`)

### Commands Reference

| Command               | Description              |
| --------------------- | ------------------------ |
| `npm run e2e`         | Run all tests (headless) |
| `npm run e2e:ui`      | Interactive UI mode      |
| `npm run e2e:headed`  | Run with visible browser |
| `npm run e2e:debug`   | Step-through debugger    |
| `npm run e2e:install` | Install browsers         |
| `npm run e2e:report`  | View last HTML report    |
| `npm run e2e:dev`     | Start servers + UI mode  |

## Next Steps

1. **Add more tests** - Cover additional user journeys
2. **Parameterize tests** - Data-driven test scenarios
3. **Visual regression** - Screenshot comparison tests
4. **Performance testing** - Measure page load times
5. **API contract tests** - Validate request/response schemas
6. **Mobile testing** - Uncomment mobile projects in config
7. **Accessibility tests** - Automated a11y checks

## Support

- Check [Troubleshooting](#debugging) section above
- Review [test logs](./playwright-report)
- Search [Playwright docs](https://playwright.dev)
- Open issue on GitHub

---

**Last Updated**: 2025-10-26
**Playwright Version**: 1.56.1
**Node Version**: >=18.0.0
