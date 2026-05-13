import { defineConfig, devices } from '@playwright/test';

const DEFAULT_E2E_WEB_PORT = '3211';
const DEFAULT_E2E_API_PORT = '4001';
const WEB_PORT_FALLBACK = process.env.E2E_WEB_PORT || DEFAULT_E2E_WEB_PORT;
const API_PORT_FALLBACK = process.env.E2E_API_PORT || DEFAULT_E2E_API_PORT;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${WEB_PORT_FALLBACK}`;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT_FALLBACK}`;

function resolvePort(urlValue: string, fallbackPort: string): string {
  try {
    const parsed = new URL(urlValue);
    if (parsed.port) {
      return parsed.port;
    }

    return parsed.protocol === 'https:' ? '443' : '80';
  } catch {
    return fallbackPort;
  }
}

const WEB_PORT = resolvePort(BASE_URL, WEB_PORT_FALLBACK);
const API_PORT = resolvePort(API_BASE_URL, API_PORT_FALLBACK);
const E2E_WORKERS = Number.parseInt(process.env.E2E_WORKERS || (process.env.CI ? '4' : '2'), 10);

// Ensure helper modules and global setup resolve to the same E2E endpoints.
process.env.BASE_URL = BASE_URL;
process.env.API_BASE_URL = API_BASE_URL;

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
  workers: E2E_WORKERS, // Tunable via E2E_WORKERS for local stability/perf tradeoff

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,

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
      url: `${API_BASE_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300 * 1000,
      env: {
        NODE_ENV: 'test',
        PORT: API_PORT,
        MAX_CONCURRENT_JOBS: process.env.MAX_CONCURRENT_JOBS || '8',
        WORKER_POLL_INTERVAL_MS: process.env.WORKER_POLL_INTERVAL_MS || '500',
      },
    },
    {
      // Start Web server
      command: 'cd apps/web && npm run dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 300 * 1000,
      env: {
        PORT: WEB_PORT,
        NEXT_PUBLIC_API_URL: API_BASE_URL,
        NEXT_PUBLIC_E2E_TEST_HOOKS: '1',
      },
    },
  ],
});
