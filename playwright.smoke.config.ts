import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Smoke Test Configuration
 *
 * Fast critical path test suite for CI/CD pipelines.
 * Only runs tests tagged with @smoke.
 *
 * Usage:
 *   npm run e2e:smoke
 *   npx playwright test --config=playwright.smoke.config.ts
 *
 * What's included:
 *   - Authentication flows (login, registration)
 *   - Basic navigation and UI rendering
 *   - Health checks and server accessibility
 *   - Critical user journeys
 *
 * Target Duration: < 2 minutes
 */
export default defineConfig({
  ...baseConfig,

  // Only run tests tagged with @smoke
  // Using grep to match the tag annotation in test titles
  grep: /@smoke/,

  // Smoke tests should run on Chromium only for speed
  projects: [
    {
      name: 'chromium-smoke',
      use: {
        ...devices['Desktop Chrome'],
        extraHTTPHeaders: {
          'x-test-source': 'playwright-e2e-smoke',
        },
      },
    },
  ],

  // Smoke tests should fail fast
  workers: 2, // Reduced workers for faster startup

  // No retries for smoke tests - they should be stable
  retries: 0,

  // More verbose reporting for smoke tests
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-smoke', open: 'never' }]],

  // Reduced timeouts for smoke tests (they should be fast)
  use: {
    ...baseConfig.use,
    actionTimeout: 5000,
    navigationTimeout: 15000,
  },

  // Metadata for reporting
  metadata: {
    suite: 'smoke',
    purpose: 'Fast critical path validation for CI/CD',
    expectedDuration: '< 2 minutes',
  },
});
