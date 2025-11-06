import { test as base } from './test-isolation';
import { randomUUID } from 'crypto';

/**
 * Extended test fixture that adds x-test-id header to all requests
 * for backend correlation and log tracking.
 *
 * CRITICAL FIX #6: Now extends test-isolation fixture instead of @playwright/test
 * This ensures all tests get:
 * - Worker-specific database isolation (dbPath fixture)
 * - window.__TEST_DB_PATH__ injection for frontend test isolation
 * - Savepoint-based atomic test cleanup
 * - X-Test-DB-Path header injection
 *
 * Previous issue: Tests were using raw @playwright/test which didn't include
 * the test isolation fixtures, causing login failures due to missing test user.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    // Generate a unique test ID for this test run
    const testId = randomUUID();

    // Add test ID header to all requests from this context
    // IMPORTANT: Don't intercept OPTIONS preflight requests - they must be handled
    // natively by the browser for CORS to work properly
    await context.route('**/*', async (route) => {
      const request = route.request();

      // Skip interception for OPTIONS requests to allow proper CORS preflight
      if (request.method() === 'OPTIONS') {
        await route.continue();
        return;
      }

      // Skip interception for DELETE requests to API - let them pass through unmodified
      // This fixes an issue where DELETE requests would hang when intercepted
      if (request.method() === 'DELETE' && request.url().includes('/api/')) {
        await route.continue();
        return;
      }

      const headers = {
        ...route.request().headers(),
        'x-test-id': testId,
      };
      await route.continue({ headers });
    });

    // Make testId available in the test info
    await use(context);
  },
});

export { expect } from '@playwright/test';
