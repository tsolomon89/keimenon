import { test, expect } from '@playwright/test';

test('debug authentication response', async ({ page }) => {
  // Intercept and log all network responses
  const responses: any[] = [];

  page.on('response', async (response) => {
    if (response.url().includes('/api/v1/auth/login')) {
      const responseData = {
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        body: await response.text().catch(() => 'Failed to read body'),
      };
      responses.push(responseData);
      console.log('[DEBUG] Login Response:', JSON.stringify(responseData, null, 2));
    }
  });

  // Capture console messages from the browser
  page.on('console', (msg) => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text());
  });

  // Navigate to login
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');

  // Fill login form with admin account (correct password is 123456, not admin123!)
  await page.fill('input[type="email"]', 'admin@admin.com');
  await page.fill('input[type="password"]', 'TestPass123!');

  // Click login and wait for response
  await page.click('button:has-text("Sign In")');

  // Wait for navigation or error
  await Promise.race([
    page.waitForURL(/\/canvas/, { timeout: 10000 }).catch(() => null),
    page.waitForSelector('text=Login Failed', { timeout: 10000 }).catch(() => null),
  ]);

  // Wait a bit for all logs
  await page.waitForTimeout(2000);

  // Check where we ended up
  const finalUrl = page.url();
  console.log('[DEBUG] Final URL:', finalUrl);
  console.log('[DEBUG] Total responses captured:', responses.length);

  // Check localStorage for token
  const token = await page.evaluate(() => localStorage.getItem('canvas_memory_token'));
  console.log('[DEBUG] Token in localStorage:', token ? 'PRESENT' : 'MISSING');

  // Check for error messages
  const errorMessage = await page.textContent('text=Login Failed').catch(() => null);
  if (errorMessage) {
    console.log('[DEBUG] Error displayed:', errorMessage);

    // Try to get error details
    const errorDetails = await page
      .locator('.text-sm.text-red-600')
      .allTextContents()
      .catch(() => []);
    console.log('[DEBUG] Error details:', errorDetails);
  }
});
