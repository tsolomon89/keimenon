import { test as base } from '@playwright/test';
import { randomUUID } from 'crypto';

/**
 * Extended test fixture that adds x-test-id header to all requests
 * for backend correlation and log tracking.
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
