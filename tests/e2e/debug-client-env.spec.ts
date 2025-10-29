import { test, expect } from './fixtures/testId';

/**
 * Debug Client Environment Test
 *
 * Checks what environment variables are actually available in the client-side bundle
 */

test('should show client environment variables', async ({ page }) => {
  // Enable console logging
  page.on('console', (msg) => {
    console.log('[Browser]', msg.text());
  });

  // Navigate to debug page
  await page.goto('/debug-client-env');
  await page.waitForLoadState('domcontentloaded');

  // Wait for content to appear
  await page.waitForSelector('pre', { timeout: 5000 });

  // Take screenshot for visual verification
  await page.screenshot({ path: 'test-results/debug-client-env.png', fullPage: true });

  // Get the displayed environment info
  const envText = await page.locator('pre').textContent();
  console.log('\n=== Client Environment (from page) ===');
  console.log(envText);

  // Parse and verify
  const env = JSON.parse(envText || '{}');
  console.log('\n=== Parsed Environment ===');
  console.log(JSON.stringify(env, null, 2));

  // Check if variables are defined
  if (env.NEXT_PUBLIC_API_URL) {
    console.log('✅ NEXT_PUBLIC_API_URL is defined:', env.NEXT_PUBLIC_API_URL);
  } else {
    console.log('❌ NEXT_PUBLIC_API_URL is undefined!');
  }

  if (env.NEXT_PUBLIC_E2E_TESTING) {
    console.log('✅ NEXT_PUBLIC_E2E_TESTING is defined:', env.NEXT_PUBLIC_E2E_TESTING);
  } else {
    console.log('❌ NEXT_PUBLIC_E2E_TESTING is undefined!');
  }
});
