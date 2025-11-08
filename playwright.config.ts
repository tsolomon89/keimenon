import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Ignore template files - they're documentation, not actual tests */
  testIgnore: '**/templates/**',

  /* Global setup - runs once before all tests */
  globalSetup: './tests/e2e/global-setup.ts',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Parallel workers enabled with savepoint-based isolation */
  /* Architecture:
   * - Each worker gets isolated database (worker-0.db, worker-1.db, etc.)
   * - Each test wrapped in savepoint for atomic cleanup
   * - testIsolationMiddleware and dbContextMiddleware handle per-request DB routing
   * - See: tests/e2e/fixtures/test-isolation.ts, tests/e2e/fixtures/database-snapshots.ts
   */
  workers: 4, // Parallel execution with perfect test isolation

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Record video only on failure */
    video: 'retain-on-failure',

    /* Take screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Maximum time each action such as `click()` can take. */
    actionTimeout: 10000,

    /* Maximum time for navigation (goto, waitForURL, etc.) */
    navigationTimeout: 30000,

    /* Bypass CSP and ignore HTTPS errors to fix DELETE request blocking */
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        extraHTTPHeaders: {
          'x-test-source': 'playwright-e2e',
        },
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        extraHTTPHeaders: {
          'x-test-source': 'playwright-e2e',
        },
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        extraHTTPHeaders: {
          'x-test-source': 'playwright-e2e',
        },
        // WebKit needs longer timeouts for SSE connections and async operations
        actionTimeout: 30000,
        navigationTimeout: 30000,
      },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      // Start API server in TEST mode (enables savepoint routes)
      command: 'cd apps/api && npm run dev:test',
      url: 'http://localhost:4001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        NODE_ENV: 'test',
        PORT: '4001',
      },
    },
    {
      // Start Web server
      command: 'cd apps/web && npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        PORT: '3000',
        NEXT_PUBLIC_API_URL: 'http://localhost:4001',
      },
    },
  ],
});
