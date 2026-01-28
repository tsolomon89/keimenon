import { test as base, Page } from '@playwright/test';

/**
 * WebKit-Specific Test Fixtures
 *
 * Adds comprehensive logging for WebKit to diagnose navigation/authentication issues.
 *
 * Features:
 * - Navigation event tracking
 * - localStorage/sessionStorage monitoring
 * - API request/response logging
 * - Console message capture
 * - Frame navigation tracking
 */

export const test = base.extend<{ page: Page }>({
  page: async ({ page, browserName }, use) => {
    if (browserName === 'webkit') {
      console.log('\n🦊 [WebKit] Initializing debug fixtures...\n');

      // Track all frame navigations
      page.on('framenavigated', (frame) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`🧭 [${timestamp}] [WebKit Nav] ${frame.url()}`);
      });

      // Track localStorage and token-related messages
      page.on('console', (msg) => {
        const text = msg.text();
        if (
          text.includes('localStorage') ||
          text.includes('token') ||
          text.includes('keimenon_token') ||
          text.includes('Login successful') ||
          text.includes('Redirected')
        ) {
          const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
          console.log(`💾 [${timestamp}] [WebKit Storage] ${text}`);
        }
      });

      // Track all API requests
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
          console.log(`📤 [${timestamp}] [WebKit API →] ${request.method()} ${request.url()}`);
        }
      });

      // Track all API responses
      page.on('response', (response) => {
        if (response.url().includes('/api/')) {
          const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
          console.log(`📥 [${timestamp}] [WebKit API ←] ${response.status()} ${response.url()}`);
        }
      });

      // Track page errors
      page.on('pageerror', (err) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`❌ [${timestamp}] [WebKit Error] ${err.message}`);
      });

      // Log when test starts
      const testInfo = (global as any).currentTest;
      if (testInfo) {
        console.log(`\n🧪 [WebKit Test] Starting: ${testInfo.title}\n`);
      }
    }

    await use(page);

    if (browserName === 'webkit') {
      console.log('\n✅ [WebKit] Test completed\n');
    }
  },
});

export { expect } from '@playwright/test';
