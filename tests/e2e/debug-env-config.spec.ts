import { test, expect } from '@playwright/test';

test('debug env config', async ({ page }) => {
  // Visit login page
  await page.goto('http://localhost:3000/login');

  // Check if page loads
  await page.waitForLoadState('networkidle');

  // Evaluate if API_BASE_URL is correctly defined
  const apiUrl = await page.evaluate(async () => {
    try {
      // Import API_BASE_URL from env.config.ts (browser-safe)
      const { API_BASE_URL } = await import('/src/lib/env.config');
      return {
        apiUrl: API_BASE_URL,
        hasProcess: typeof process !== 'undefined',
        source: 'env.config.ts',
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('[DEBUG] Env config check:', apiUrl);

  // Try to login and capture network request
  await page.fill('input[type="email"]', 'admin@admin.com');
  await page.fill('input[type="password"]', '123456');

  // Capture fetch requests
  const fetchPromise = page
    .waitForRequest((request) => request.url().includes('/api/v1/auth/login'), { timeout: 5000 })
    .catch(() => null);

  await page.click('button:has-text("Sign In")');

  const request = await fetchPromise;
  console.log('[DEBUG] Login request URL:', request?.url() || 'NO REQUEST SENT');

  // Wait to see error message
  await page.waitForTimeout(2000);

  const errorText = await page.textContent('text=Login Failed').catch(() => null);
  console.log('[DEBUG] Error message:', errorText);

  const detailText = await page
    .locator('text=Failed to fetch')
    .textContent()
    .catch(() => 'No error details');
  console.log('[DEBUG] Error details:', detailText);
});
